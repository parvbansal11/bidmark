def test_create_bidder(sample_bidder):
    assert sample_bidder["company_name"] == "Test Bidder Pvt Ltd"
    assert sample_bidder["status"] == "ACTIVE"


def test_list_and_get_bidder(client, officer_headers, sample_bidder):
    r = client.get("/api/v1/bidders", headers=officer_headers)
    assert r.status_code == 200
    assert any(b["id"] == sample_bidder["id"] for b in r.json()["data"])

    r = client.get(f"/api/v1/bidders/{sample_bidder['id']}", headers=officer_headers)
    assert r.status_code == 200
    assert r.json()["data"]["id"] == sample_bidder["id"]


def test_update_bidder(client, officer_headers, sample_bidder):
    r = client.put(f"/api/v1/bidders/{sample_bidder['id']}", json={"contact_phone": "9999999999"}, headers=officer_headers)
    assert r.status_code == 200
    assert r.json()["data"]["contact_phone"] == "9999999999"


def test_create_tender_with_requirements(sample_tender):
    assert sample_tender["tender_number"] == "TEST/2026/001"
    assert len(sample_tender["requirements"]) == 4
    types = {r["requirement_type"] for r in sample_tender["requirements"]}
    assert {"GST", "PAN", "UDYAM", "LOCAL_CONTENT"} <= types


def test_create_tender_with_duplicate_reference_returns_409_not_500(client, admin_headers, sample_tender):
    # Regression test: a duplicate tender_number/gem_tender_id used to hit an
    # unhandled SQLite UNIQUE constraint and crash with a 500. It must now be
    # caught and reported as a clean 409 Conflict.
    payload = {
        "tender_number": sample_tender["tender_number"], "gem_tender_id": "GEM/2026/B/999999", "title": "Duplicate reference number",
        "tender_type": "OPEN_TENDER", "tender_category": "GOODS", "tender_mode": "ONLINE", "bid_system": "SINGLE_PACKET",
        "location": "New Delhi, Delhi", "bid_validity_days": 90,
        "published_at": "2026-01-01T00:00:00Z", "deadline": "2026-12-31T00:00:00Z", "requirements": [],
    }
    r = client.post("/api/v1/tenders", json=payload, headers=admin_headers)
    assert r.status_code == 409

    payload["tender_number"] = "TEST/2026/SOME-OTHER-NUMBER"
    payload["gem_tender_id"] = sample_tender["gem_tender_id"]
    r = client.post("/api/v1/tenders", json=payload, headers=admin_headers)
    assert r.status_code == 409


def test_add_requirement_to_existing_tender(client, officer_headers, admin_headers, sample_tender):
    # Adding requirements is part of tender configuration — Admin-only, same
    # as creating the tender itself.
    r = client.post(
        f"/api/v1/tenders/{sample_tender['id']}/requirements",
        json={"requirement_type": "DEBARMENT", "description": "No debarment", "is_mandatory": True, "evidence_type": "DEBARMENT"},
        headers=admin_headers,
    )
    assert r.status_code == 200
    r = client.get(f"/api/v1/tenders/{sample_tender['id']}/requirements", headers=officer_headers)
    assert len(r.json()["data"]) == 5


def test_officer_cannot_add_requirement(client, officer_headers, sample_tender):
    r = client.post(
        f"/api/v1/tenders/{sample_tender['id']}/requirements",
        json={"requirement_type": "DEBARMENT", "description": "No debarment", "is_mandatory": True, "evidence_type": "DEBARMENT"},
        headers=officer_headers,
    )
    assert r.status_code == 403


def test_link_bidder_to_tender(client, officer_headers, admin_headers, sample_bidder, sample_tender):
    # Linking/inviting a bidder to a tender is an Admin (tender-management)
    # action; Officer cannot do it.
    forbidden = client.post(f"/api/v1/tenders/{sample_tender['id']}/bidders/{sample_bidder['id']}", headers=officer_headers)
    assert forbidden.status_code == 403

    r = client.post(f"/api/v1/tenders/{sample_tender['id']}/bidders/{sample_bidder['id']}", headers=admin_headers)
    assert r.status_code == 200
    r = client.get(f"/api/v1/tenders/{sample_tender['id']}/bidders", headers=officer_headers)
    assert any(b["id"] == sample_bidder["id"] for b in r.json()["data"])
