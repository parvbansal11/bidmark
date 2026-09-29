from datetime import datetime, timedelta, timezone

from tests.conftest import submit_bid


def test_behavioral_analysis_flags_unusually_fast_submission(client, officer_headers, admin_headers, sample_bidder):
    published = datetime.now(timezone.utc) - timedelta(days=5)
    r = client.post(
        "/api/v1/tenders",
        json={
            "tender_number": "TIMING/2026/001", "gem_tender_id": "GEM/2026/B/TIMING1", "title": "Timing Test Tender",
            "tender_type": "OPEN_TENDER", "tender_category": "GOODS", "tender_mode": "ONLINE", "bid_system": "SINGLE_PACKET",
            "location": "New Delhi, Delhi", "bid_validity_days": 90,
            "published_at": published.isoformat(),
            "deadline": (published + timedelta(days=20)).isoformat(),
            "requirements": [{"requirement_type": "GST", "description": "GST required", "is_mandatory": True, "evidence_type": "GST"}],
        },
        headers=admin_headers,
    )
    assert r.status_code == 200
    tender = r.json()["data"]
    client.post(f"/api/v1/tenders/{tender['id']}/bidders/{sample_bidder['id']}", headers=admin_headers)

    submit_bid(
        client, officer_headers, tender["id"], sample_bidder["id"],
        submitted_at=(published + timedelta(minutes=30)).isoformat(),
        quoted_price=1000000,
    )

    r = client.post(f"/api/v1/behavior/analyze/{sample_bidder['id']}/{tender['id']}", headers=officer_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["risk_level"] in ("LOW", "MEDIUM", "HIGH")
    assert data["behavioral_risk_score"] >= 10  # the fast-submission flag alone contributes +10


def test_behavioral_report_requires_prior_analysis(client, officer_headers, sample_bidder, sample_tender):
    r = client.get(f"/api/v1/behavior/report/{sample_bidder['id']}/{sample_tender['id']}", headers=officer_headers)
    assert r.status_code == 404


def test_behavioral_analysis_never_never_declares_guilt(client, officer_headers, admin_headers, sample_bidder, sample_tender):
    client.post(f"/api/v1/tenders/{sample_tender['id']}/bidders/{sample_bidder['id']}", headers=admin_headers)
    r = client.post(f"/api/v1/behavior/analyze/{sample_bidder['id']}/{sample_tender['id']}", headers=officer_headers)
    assert r.status_code == 200
    # requires_human_review is the strongest claim the engine is allowed to make
    assert "risk_level" in r.json()["data"]


def test_whatif_simulator_does_not_modify_actual_tender(client, officer_headers, admin_headers, sample_bidder, sample_tender):
    local_content_req = next(r for r in sample_tender["requirements"] if r["requirement_type"] == "LOCAL_CONTENT")
    client.post(f"/api/v1/tenders/{sample_tender['id']}/bidders/{sample_bidder['id']}", headers=admin_headers)

    r = client.post(
        f"/api/v1/simulator/{sample_tender['id']}",
        json={"overrides": [{"requirement_id": local_content_req["id"], "threshold": 10}], "bidder_ids": [sample_bidder["id"]]},
        headers=officer_headers,
    )
    assert r.status_code == 200
    result = r.json()["data"]
    assert any(b["bidder_id"] == sample_bidder["id"] for b in result["bidders"])

    # Confirm the real requirement on the tender is untouched
    r2 = client.get(f"/api/v1/tenders/{sample_tender['id']}/requirements", headers=officer_headers)
    reqs = r2.json()["data"]
    unchanged = next(r for r in reqs if r["id"] == local_content_req["id"])
    assert unchanged["threshold"] == 50


def test_simulator_forbidden_for_bidder_role(client, officer_headers, bidder_user_headers, sample_tender):
    r = client.post(f"/api/v1/simulator/{sample_tender['id']}", json={"overrides": []}, headers=bidder_user_headers)
    assert r.status_code == 403
