def test_register_creates_user_and_returns_token(client):
    r = client.post("/api/v1/auth/register", json={"email": "a@test.com", "password": "Password123", "full_name": "A", "role": "BIDDER"})
    assert r.status_code == 200
    assert r.json()["data"]["access_token"]
    assert r.json()["data"]["user"]["role"] == "BIDDER"


def test_register_duplicate_email_rejected(client):
    client.post("/api/v1/auth/register", json={"email": "dup@test.com", "password": "Password123", "full_name": "A", "role": "BIDDER"})
    r = client.post("/api/v1/auth/register", json={"email": "dup@test.com", "password": "Password123", "full_name": "A", "role": "BIDDER"})
    assert r.status_code == 409


def test_login_with_wrong_password_rejected(client):
    client.post("/api/v1/auth/register", json={"email": "b@test.com", "password": "Password123", "full_name": "B", "role": "BIDDER"})
    r = client.post("/api/v1/auth/login", json={"email": "b@test.com", "password": "WrongPassword"})
    assert r.status_code == 401


def test_me_endpoint_requires_valid_token(client):
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 401
    r = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert r.status_code == 401


def test_bidder_role_cannot_create_tender(client, bidder_user_headers):
    r = client.post("/api/v1/tenders", json={"tender_number": "X/1", "title": "Should fail", "requirements": []}, headers=bidder_user_headers)
    assert r.status_code == 403


TENDER_PAYLOAD = {
    "tender_number": "X/2", "gem_tender_id": "GEM/2026/B/X2", "title": "Should work",
    "tender_type": "OPEN_TENDER", "tender_category": "GOODS", "tender_mode": "ONLINE", "bid_system": "SINGLE_PACKET",
    "location": "New Delhi, Delhi", "bid_validity_days": 90,
    "published_at": "2026-01-01T00:00:00Z", "deadline": "2026-12-31T00:00:00Z",
    "requirements": [],
}


def test_admin_role_can_create_tender(client, admin_headers):
    # Tender creation/publishing is Admin-only.
    r = client.post("/api/v1/tenders", json=TENDER_PAYLOAD, headers=admin_headers)
    assert r.status_code == 200, r.text


def test_officer_role_cannot_create_tender(client, officer_headers):
    # Procurement Officer's role is reviewing/verifying/evaluating bidders -
    # not creating or publishing tenders. That is Admin-only.
    r = client.post("/api/v1/tenders", json={**TENDER_PAYLOAD, "tender_number": "X/3"}, headers=officer_headers)
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# DEMO-ONLY registration rule: public registration MAY create an Admin or
# Procurement Officer account through the same form a Bidder uses, but only
# when the email address ends with the configured privileged domain
# (settings.PRIVILEGED_ROLE_EMAIL_DOMAIN, "cpcl.gov.in" by default). Bidder
# registration remains unrestricted. See app/api/v1/auth.py::register.
# ---------------------------------------------------------------------------

def test_register_bidder_with_any_email_succeeds(client):
    r = client.post(
        "/api/v1/auth/register",
        json={"email": "testbidder@gmail.com", "password": "Password123", "full_name": "Test Bidder", "role": "BIDDER"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["user"]["role"] == "BIDDER"


def test_register_admin_with_privileged_domain_email_succeeds(client):
    r = client.post(
        "/api/v1/auth/register",
        json={"email": "admin@cpcl.gov.in", "password": "Password123", "full_name": "Demo Admin"},
    )
    assert r.status_code == 200, r.text
    # No role sent at all -> defaults to BIDDER, so send it explicitly:
    r = client.post(
        "/api/v1/auth/register",
        json={"email": "admin2@cpcl.gov.in", "password": "Password123", "full_name": "Demo Admin 2", "role": "ADMIN"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["user"]["role"] == "ADMIN"


def test_register_officer_with_privileged_domain_email_succeeds(client):
    r = client.post(
        "/api/v1/auth/register",
        json={"email": "officer@cpcl.gov.in", "password": "Password123", "full_name": "Demo Officer", "role": "PROCUREMENT_OFFICER"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["user"]["role"] == "PROCUREMENT_OFFICER"


def test_register_admin_with_non_privileged_domain_email_rejected(client):
    r = client.post(
        "/api/v1/auth/register",
        json={"email": "admin@gmail.com", "password": "Password123", "full_name": "Wannabe Admin", "role": "ADMIN"},
    )
    assert r.status_code == 422, r.text
    assert "@cpcl.gov.in" in r.json()["error"]["message"]
    # It must not have been created at all, not even as a downgraded role.
    login = client.post("/api/v1/auth/login", json={"email": "admin@gmail.com", "password": "Password123"})
    assert login.status_code == 401


def test_register_officer_with_non_privileged_domain_email_rejected(client):
    r = client.post(
        "/api/v1/auth/register",
        json={"email": "officer@gmail.com", "password": "Password123", "full_name": "Wannabe Officer", "role": "PROCUREMENT_OFFICER"},
    )
    assert r.status_code == 422, r.text
    assert "@cpcl.gov.in" in r.json()["error"]["message"]


def test_registered_admin_and_officer_can_sign_in_and_reach_role_gated_actions(client):
    """End-to-end: register via the public form with a privileged-domain
    email, sign in with those exact credentials, and confirm the resulting
    session actually has the right permissions (not just the right label)."""
    admin_email, officer_email, password = "e2e-admin@cpcl.gov.in", "e2e-officer@cpcl.gov.in", "Password123"
    r = client.post("/api/v1/auth/register", json={"email": admin_email, "password": password, "full_name": "E2E Admin", "role": "ADMIN"})
    assert r.status_code == 200, r.text
    r = client.post("/api/v1/auth/register", json={"email": officer_email, "password": password, "full_name": "E2E Officer", "role": "PROCUREMENT_OFFICER"})
    assert r.status_code == 200, r.text

    admin_login = client.post("/api/v1/auth/login", json={"email": admin_email, "password": password})
    assert admin_login.status_code == 200
    assert admin_login.json()["data"]["user"]["role"] == "ADMIN"
    admin_h = {"Authorization": f"Bearer {admin_login.json()['data']['access_token']}"}
    assert client.post("/api/v1/tenders", json={**TENDER_PAYLOAD, "tender_number": "X/E2E"}, headers=admin_h).status_code == 200

    officer_login = client.post("/api/v1/auth/login", json={"email": officer_email, "password": password})
    assert officer_login.status_code == 200
    assert officer_login.json()["data"]["user"]["role"] == "PROCUREMENT_OFFICER"
    officer_h = {"Authorization": f"Bearer {officer_login.json()['data']['access_token']}"}
    # Officer still cannot create tenders (that boundary is unchanged by this rule).
    assert client.post("/api/v1/tenders", json={**TENDER_PAYLOAD, "tender_number": "X/E2E-2"}, headers=officer_h).status_code == 403


def test_auth_config_exposes_the_privileged_domain(client):
    r = client.get("/api/v1/auth/config")
    assert r.status_code == 200
    assert r.json()["data"]["privileged_role_email_domain"] == "cpcl.gov.in"


def test_only_admin_can_provision_officer_or_admin_accounts(client, admin_headers, bidder_user_headers):
    # Admin can.
    r = client.post(
        "/api/v1/users",
        json={"email": "new-officer@test.gov.in", "password": "Password123", "full_name": "New Officer", "role": "PROCUREMENT_OFFICER"},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["role"] == "PROCUREMENT_OFFICER"

    # A bidder (or anyone non-admin) cannot.
    r2 = client.post(
        "/api/v1/users",
        json={"email": "sneaky-officer@test.gov.in", "password": "Password123", "full_name": "Sneaky", "role": "PROCUREMENT_OFFICER"},
        headers=bidder_user_headers,
    )
    assert r2.status_code == 403


def test_empty_privileged_domain_disables_staff_self_registration(client, monkeypatch):
    # Production sets PRIVILEGED_ROLE_EMAIL_DOMAIN="" so the public endpoint can only create bidders.
    from app.core.config import settings
    monkeypatch.setattr(settings, "PRIVILEGED_ROLE_EMAIL_DOMAIN", "")
    for role in ("ADMIN", "PROCUREMENT_OFFICER", "AUDITOR"):
        res = client.post("/api/v1/auth/register", json={"email": f"x-{role.lower()}@cpcl.gov.in", "password": "Password123", "full_name": "X", "role": role})
        assert res.status_code == 403, role
        assert res.json()["error"]["code"] == "STAFF_SELF_REGISTRATION_DISABLED"
    res = client.post("/api/v1/auth/register", json={"email": "seller@example.com", "password": "Password123", "full_name": "Seller", "role": "BIDDER"})
    assert res.status_code in (200, 201)
