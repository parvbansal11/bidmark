import io
import os
import sys

os.environ["DATABASE_URL"] = "sqlite://"  # in-memory, overridden below with a shared connection

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.main import app

TEST_ENGINE = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=TEST_ENGINE)


def _override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _override_get_db


@pytest.fixture(scope="function", autouse=True)
def fresh_database():
    Base.metadata.create_all(bind=TEST_ENGINE)
    yield
    Base.metadata.drop_all(bind=TEST_ENGINE)


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def register(client, email, role, password="Password123"):
    """Registers via the PUBLIC endpoint. NOTE: as of the RBAC hardening,
    POST /api/v1/auth/register always creates a BIDDER account regardless of
    what `role` is passed here — any `role` in the payload is a no-op extra
    field. This helper is only meaningful (and only used) for role="BIDDER"
    call sites; see `_bootstrap_admin`/`officer_headers` below for how
    Officer/Admin test accounts are created instead."""
    r = client.post("/api/v1/auth/register", json={"email": email, "password": password, "full_name": email.split("@")[0], "role": role})
    assert r.status_code == 200, r.text
    token = r.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}, r.json()["data"]["user"]["id"]


def _login(client, email, password="Password123"):
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    token = r.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _bootstrap_admin(email="admin@test.gov.in", password="Password123"):
    """Create the very first Admin account directly against the DB, bypassing
    the API entirely. This mirrors how app/seed.py provisions the first real
    Admin account in local/demo environments — since Admin/Officer accounts
    can only otherwise be created BY an existing Admin (POST /api/v1/users),
    something has to plant the first one without going through that gate."""
    from app.core.security import hash_password
    from app.models.user import User, UserRole

    db = TestingSessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            return
        db.add(User(email=email, hashed_password=hash_password(password), full_name="Test Admin", role=UserRole.ADMIN))
        db.commit()
    finally:
        db.close()


@pytest.fixture
def admin_headers(client):
    _bootstrap_admin()
    return _login(client, "admin@test.gov.in")


@pytest.fixture
def officer_headers(client, admin_headers):
    """Officer accounts are provisioned by an Admin via POST /api/v1/users —
    exactly the flow a real Admin would use, not a backdoor."""
    r = client.post(
        "/api/v1/users",
        json={"email": "officer@test.gov.in", "password": "Password123", "full_name": "Test Officer", "role": "PROCUREMENT_OFFICER"},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    return _login(client, "officer@test.gov.in")


@pytest.fixture
def bidder_user_headers(client):
    headers, _ = register(client, "bidderuser@test.com", "BIDDER")
    return headers


@pytest.fixture
def sample_bidder(client, admin_headers):
    r = client.post(
        "/api/v1/bidders",
        json={
            "company_name": "Test Bidder Pvt Ltd", "legal_name": "Test Bidder Pvt Ltd",
            "pan_number": "TESTB1234C", "gstin": "07TESTB1234C1Z5", "cin": "U31900DL2015PTC280099",
            "udyam_number": "UDYAM-DL-01-0009999", "registered_address": "Test Industrial Area, Delhi",
        },
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    return r.json()["data"]


@pytest.fixture
def sample_tender(client, admin_headers):
    # Tender creation is Admin-only (Procurement Officer's role is reviewing/
    # verifying/evaluating, not creating/publishing tenders) — see
    # app/api/v1/tenders.py::create_tender.
    r = client.post(
        "/api/v1/tenders",
        json={
            "tender_number": "TEST/2026/001", "gem_tender_id": "GEM/2026/B/000001", "title": "Test Tender for Widgets",
            "tender_type": "OPEN_TENDER", "tender_category": "GOODS", "tender_mode": "ONLINE", "bid_system": "SINGLE_PACKET",
            "location": "New Delhi, Delhi", "bid_validity_days": 90,
            "published_at": "2026-01-01T00:00:00Z", "deadline": "2026-12-31T00:00:00Z",
            "requirements": [
                {"requirement_type": "GST", "description": "GST required", "is_mandatory": True, "evidence_type": "GST", "weight": 1},
                {"requirement_type": "PAN", "description": "PAN required", "is_mandatory": True, "evidence_type": "PAN", "weight": 1},
                {"requirement_type": "UDYAM", "description": "Udyam required", "is_mandatory": True, "evidence_type": "UDYAM", "weight": 1},
                {"requirement_type": "LOCAL_CONTENT", "description": "Local content >= 50%", "is_mandatory": True, "evidence_type": "LOCAL_CONTENT", "threshold": 50, "weight": 2},
            ],
        },
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    return r.json()["data"]


@pytest.fixture
def limited_tender(client, admin_headers):
    """A LIMITED_TENDER — unlike sample_tender (OPEN_TENDER), this is NOT
    auto-discoverable by every bidder; a bidder only sees/can act on it once
    explicitly linked via add_bidder_to_tender."""
    r = client.post(
        "/api/v1/tenders",
        json={
            "tender_number": "TEST/2026/LTD-001", "gem_tender_id": "GEM/2026/L/000001", "title": "Limited Tender for Specialized Equipment",
            "tender_type": "LIMITED_TENDER", "tender_category": "SERVICES", "tender_mode": "ONLINE", "bid_system": "SINGLE_PACKET",
            "location": "New Delhi, Delhi", "bid_validity_days": 90,
            "published_at": "2026-01-01T00:00:00Z", "deadline": "2026-12-31T00:00:00Z",
            "requirements": [],
        },
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    return r.json()["data"]


def upload_doc(client, headers, bidder_id, category, tender_id=None, content=b"dummy certificate content"):
    files = {"file": (f"{category.lower()}.txt", io.BytesIO(content), "text/plain")}
    data = {"category": category}
    if tender_id:
        data["tender_id"] = tender_id
    r = client.post(f"/api/v1/bidders/{bidder_id}/documents", data=data, files=files, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["data"]


@pytest.fixture
def bidder_with_documents(client, officer_headers, admin_headers, sample_bidder, sample_tender):
    client.post(f"/api/v1/tenders/{sample_tender['id']}/bidders/{sample_bidder['id']}", headers=admin_headers)
    docs = {}
    for cat in ("GST", "PAN", "UDYAM"):
        doc = upload_doc(client, officer_headers, sample_bidder["id"], cat, sample_tender["id"])
        client.post(f"/api/v1/documents/{doc['id']}/extract", headers=officer_headers)
        docs[cat] = doc
    return {"bidder": sample_bidder, "tender": sample_tender, "documents": docs}


def submit_bid(client, headers, tender_id, bidder_id, **kwargs):
    r = client.post(f"/api/v1/tenders/{tender_id}/bidders/{bidder_id}/bid-submission", json=kwargs, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["data"]
