"""
Object-level RBAC tests: a BIDDER-role account must never be able to reach
another bidder's data, PO-only intelligence (forensics/behavior/cross-bidder/
audit/dashboard), or bidder-management actions — even by calling the API
directly with a valid token. These lock in the fixes made when the platform's
role-based access control was audited and hardened.
"""
from tests.conftest import register


def _second_bidder_with_own_login(client, admin_headers):
    """Registers a second BIDDER user (auto-creates a linked Bidder profile
    via self-registration) and returns (bidder_headers, bidder_id)."""
    headers, user_id = register(client, "secondbidder@test.com", "BIDDER")
    r = client.get("/api/v1/bidders", headers=headers)
    assert r.status_code == 200
    bidder_id = r.json()["data"][0]["id"]
    return headers, bidder_id


def test_bidder_cannot_create_bidder(client, bidder_user_headers):
    r = client.post("/api/v1/bidders", json={"company_name": "Should fail"}, headers=bidder_user_headers)
    assert r.status_code == 403


def test_officer_cannot_create_bidder_either(client, officer_headers):
    r = client.post("/api/v1/bidders", json={"company_name": "Should also fail"}, headers=officer_headers)
    assert r.status_code == 403


def test_admin_can_create_bidder(client, admin_headers):
    r = client.post("/api/v1/bidders", json={"company_name": "Admin Created Bidder"}, headers=admin_headers)
    assert r.status_code == 200


def test_bidder_list_only_shows_own_profile(client, bidder_user_headers, admin_headers):
    _second_bidder_with_own_login(client, admin_headers)
    r = client.get("/api/v1/bidders", headers=bidder_user_headers)
    assert r.status_code == 200
    assert len(r.json()["data"]) == 1


def test_bidder_cannot_view_another_bidders_profile(client, admin_headers):
    _, other_bidder_id = _second_bidder_with_own_login(client, admin_headers)
    my_headers, _ = register(client, "thirdbidder@test.com", "BIDDER")
    r = client.get(f"/api/v1/bidders/{other_bidder_id}", headers=my_headers)
    assert r.status_code == 403


def test_bidder_cannot_update_another_bidders_profile(client, admin_headers):
    _, other_bidder_id = _second_bidder_with_own_login(client, admin_headers)
    my_headers, _ = register(client, "fourthbidder@test.com", "BIDDER")
    r = client.put(f"/api/v1/bidders/{other_bidder_id}", json={"contact_phone": "1234567890"}, headers=my_headers)
    assert r.status_code == 403


def test_bidder_cannot_self_edit_official_identifiers(client, bidder_user_headers):
    r = client.get("/api/v1/bidders", headers=bidder_user_headers)
    own_id = r.json()["data"][0]["id"]
    r = client.put(f"/api/v1/bidders/{own_id}", json={"pan_number": "ZZNEW1234Z"}, headers=bidder_user_headers)
    assert r.status_code == 403

    r = client.put(f"/api/v1/bidders/{own_id}", json={"contact_phone": "9998887777"}, headers=bidder_user_headers)
    assert r.status_code == 200
    assert r.json()["data"]["contact_phone"] == "9998887777"


def test_bidder_can_request_correction(client, bidder_user_headers):
    r = client.get("/api/v1/bidders", headers=bidder_user_headers)
    own_id = r.json()["data"][0]["id"]
    r = client.post(
        f"/api/v1/bidders/{own_id}/request-correction",
        json={"field": "gstin", "current_value": "OLDGSTIN", "requested_value": "NEWGSTIN", "reason": "Typo"},
        headers=bidder_user_headers,
    )
    assert r.status_code == 200


def test_bidder_cannot_access_another_bidders_documents(client, admin_headers, officer_headers):
    _, other_bidder_id = _second_bidder_with_own_login(client, admin_headers)
    my_headers, _ = register(client, "fifthbidder@test.com", "BIDDER")
    r = client.get(f"/api/v1/bidders/{other_bidder_id}/documents", headers=my_headers)
    assert r.status_code == 403


def test_bidder_cannot_access_forensics_behavior_crossbidder_audit_dashboard(client, bidder_user_headers, sample_bidder, sample_tender):
    for path in (
        f"/api/v1/forensics/document/does-not-matter",
        f"/api/v1/behavior/report/{sample_bidder['id']}/{sample_tender['id']}",
        f"/api/v1/cross-bidder/graph/{sample_tender['id']}",
        f"/api/v1/red-flag-cascade/{sample_bidder['id']}/{sample_tender['id']}",
        f"/api/v1/audit/bidder/{sample_bidder['id']}",
        f"/api/v1/audit/{sample_bidder['id']}/{sample_tender['id']}",
        "/api/v1/dashboard/overview",
        "/api/v1/dashboard/review-queue",
        "/api/v1/dashboard/risk-summary",
    ):
        r = client.get(path, headers=bidder_user_headers)
        assert r.status_code == 403, f"{path} should be forbidden for a bidder, got {r.status_code}"


def test_bidder_cannot_trigger_compliance_evaluation_or_recommendation(client, bidder_user_headers, sample_bidder, sample_tender):
    r = client.post(f"/api/v1/compliance/evaluate/{sample_bidder['id']}/{sample_tender['id']}", headers=bidder_user_headers)
    assert r.status_code == 403
    r = client.post(f"/api/v1/compliance/recommendation/{sample_bidder['id']}/{sample_tender['id']}", headers=bidder_user_headers)
    assert r.status_code == 403


def test_bidder_cannot_read_another_bidders_compliance_report(client, admin_headers, officer_headers, sample_tender):
    _, other_bidder_id = _second_bidder_with_own_login(client, admin_headers)
    client.post(f"/api/v1/tenders/{sample_tender['id']}/bidders/{other_bidder_id}", headers=admin_headers)
    my_headers, _ = register(client, "sixthbidder@test.com", "BIDDER")
    r = client.get(f"/api/v1/compliance/report/{other_bidder_id}/{sample_tender['id']}", headers=my_headers)
    assert r.status_code == 403


def test_bidder_portal_is_self_scoped_and_requires_bidder_role(client, bidder_user_headers, officer_headers):
    r = client.get("/api/v1/portal/dashboard", headers=bidder_user_headers)
    assert r.status_code == 200
    assert "welcome_name" in r.json()["data"]

    # Officer cannot use the bidder-only portal endpoints.
    r = client.get("/api/v1/portal/dashboard", headers=officer_headers)
    assert r.status_code == 403


def test_bidder_portal_never_leaks_forensic_or_ai_terms(client, bidder_user_headers):
    r = client.get("/api/v1/portal/dashboard", headers=bidder_user_headers)
    assert r.status_code == 200
    payload_text = str(r.json()).lower()
    for banned in ("forensic", "behavioral", "risk_score", "confidence", "ai_recommendation", "cross-bidder", "cross_bidder"):
        assert banned not in payload_text


def test_bid_submission_scoped_to_own_bidder(client, admin_headers, officer_headers, sample_tender):
    _, other_bidder_id = _second_bidder_with_own_login(client, admin_headers)
    my_headers, _ = register(client, "seventhbidder@test.com", "BIDDER")
    r = client.post(
        f"/api/v1/tenders/{sample_tender['id']}/bidders/{other_bidder_id}/bid-submission",
        json={"quoted_price": 100},
        headers=my_headers,
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Bidder moderation: Officer/Admin can flag/suspend/ban/reactivate a bidder;
# a banned/suspended bidder is immediately locked out.
# ---------------------------------------------------------------------------

def test_bidder_cannot_flag_suspend_or_ban_bidders(client, bidder_user_headers, admin_headers):
    r = client.post("/api/v1/bidders", json={"company_name": "Moderation Target"}, headers=admin_headers)
    target_id = r.json()["data"]["id"]
    for action in ("flag", "suspend", "ban", "reactivate"):
        resp = client.post(f"/api/v1/bidders/{target_id}/{action}", json={"reason": "test"}, headers=bidder_user_headers)
        assert resp.status_code == 403, f"bidder should not be able to {action} another bidder"


def test_officer_can_flag_and_reactivate_bidder(client, officer_headers, admin_headers):
    r = client.post("/api/v1/bidders", json={"company_name": "Flag Target"}, headers=admin_headers)
    bidder_id = r.json()["data"]["id"]

    r = client.post(f"/api/v1/bidders/{bidder_id}/flag", json={"reason": "Inconsistent documents"}, headers=officer_headers)
    assert r.status_code == 200
    assert r.json()["data"]["status"] == "FLAGGED"

    r = client.post(f"/api/v1/bidders/{bidder_id}/reactivate", json={}, headers=officer_headers)
    assert r.status_code == 200
    assert r.json()["data"]["status"] == "ACTIVE"


def test_officer_can_suspend_bidder_and_block_login_immediately(client, officer_headers, admin_headers):
    reg_headers, _ = register(client, "suspendme@test.com", "BIDDER")
    r = client.get("/api/v1/bidders", headers=reg_headers)
    bidder_id = r.json()["data"][0]["id"]

    r = client.post(f"/api/v1/bidders/{bidder_id}/suspend", json={"reason": "Under investigation"}, headers=officer_headers)
    assert r.status_code == 200
    assert r.json()["data"]["status"] == "SUSPENDED"

    # The account is deactivated immediately — not just on next login. The
    # bidder's existing token should now be rejected on any authenticated call.
    r = client.get("/api/v1/portal/dashboard", headers=reg_headers)
    assert r.status_code == 401

    # And a fresh login attempt is rejected too.
    r = client.post("/api/v1/auth/login", json={"email": "suspendme@test.com", "password": "Password123"})
    assert r.status_code == 403


def test_officer_can_permanently_ban_bidder(client, officer_headers, admin_headers):
    reg_headers, _ = register(client, "banme@test.com", "BIDDER")
    r = client.get("/api/v1/bidders", headers=reg_headers)
    bidder_id = r.json()["data"][0]["id"]

    r = client.post(f"/api/v1/bidders/{bidder_id}/ban", json={"reason": "Confirmed fraudulent GSTIN"}, headers=officer_headers)
    assert r.status_code == 200
    assert r.json()["data"]["status"] == "BANNED"

    r = client.post("/api/v1/auth/login", json={"email": "banme@test.com", "password": "Password123"})
    assert r.status_code == 403

    # The ban is recorded in the audit trail.
    audit = client.get(f"/api/v1/audit/bidder/{bidder_id}", headers=officer_headers)
    assert audit.status_code == 200
    actions = [entry["action"] for entry in audit.json()["data"]]
    assert "BIDDER_BANNED" in actions


# ---------------------------------------------------------------------------
# Tender discovery / eligibility: OPEN_TENDER is auto-visible to every
# bidder once published; LIMITED_TENDER requires an explicit invite.
# ---------------------------------------------------------------------------

def test_open_tender_is_auto_discoverable_by_any_bidder(client, sample_tender, bidder_user_headers):
    """sample_tender is an OPEN_TENDER. A bidder who was never explicitly
    added to it should still see it in My Tenders and be able to view its
    compliance detail — this is the fix for 'admin creates a tender and it
    never shows up for the bidder'."""
    r = client.get("/api/v1/portal/tenders", headers=bidder_user_headers)
    assert r.status_code == 200
    tender_ids = [t["tender_id"] for t in r.json()["data"]]
    assert sample_tender["id"] in tender_ids

    r2 = client.get(f"/api/v1/portal/compliance/{sample_tender['id']}", headers=bidder_user_headers)
    assert r2.status_code == 200


def test_limited_tender_is_not_visible_until_invited(client, limited_tender, bidder_user_headers, admin_headers):
    r = client.get("/api/v1/portal/tenders", headers=bidder_user_headers)
    tender_ids = [t["tender_id"] for t in r.json()["data"]]
    assert limited_tender["id"] not in tender_ids

    r2 = client.get(f"/api/v1/portal/compliance/{limited_tender['id']}", headers=bidder_user_headers)
    assert r2.status_code == 404

    # Once Admin explicitly links the bidder, it becomes visible.
    own = client.get("/api/v1/bidders", headers=bidder_user_headers).json()["data"][0]
    client.post(f"/api/v1/tenders/{limited_tender['id']}/bidders/{own['id']}", headers=admin_headers)

    r3 = client.get("/api/v1/portal/tenders", headers=bidder_user_headers)
    tender_ids = [t["tender_id"] for t in r3.json()["data"]]
    assert limited_tender["id"] in tender_ids


def test_bidder_opening_tender_becomes_visible_to_officer(client, sample_tender, bidder_user_headers, officer_headers):
    """The other half of the discovery fix: once a bidder has viewed/engaged
    with an open tender, the Officer-facing tender dashboard must show them
    (this is what makes their uploaded documents reachable from the normal
    Officer workflow, not just from the flat Bidders list)."""
    own = client.get("/api/v1/bidders", headers=bidder_user_headers).json()["data"][0]

    # Before the bidder has looked at the tender, the officer dashboard for
    # it has no bidders at all.
    before = client.get(f"/api/v1/dashboard/tenders/{sample_tender['id']}", headers=officer_headers)
    assert before.status_code == 200
    assert own["id"] not in [b["bidder_id"] for b in before.json()["data"]["bidders"]]

    # The bidder opens the tender (this is what PortalTenderDetailPage does).
    opened = client.get(f"/api/v1/portal/compliance/{sample_tender['id']}", headers=bidder_user_headers)
    assert opened.status_code == 200

    after = client.get(f"/api/v1/dashboard/tenders/{sample_tender['id']}", headers=officer_headers)
    assert own["id"] in [b["bidder_id"] for b in after.json()["data"]["bidders"]]


def test_officer_can_see_documents_bidder_uploaded_via_portal(client, sample_tender, bidder_user_headers, officer_headers):
    """End-to-end reproduction of the reported bug: bidder uploads through
    the portal, officer must be able to see it via the ordinary bidder
    document listing (the same endpoint the Officer UI's BidderProfilePage
    uses)."""
    import io

    own = client.get("/api/v1/bidders", headers=bidder_user_headers).json()["data"][0]
    files = {"file": ("gst.txt", io.BytesIO(b"gst certificate content"), "text/plain")}
    data = {"category": "GST", "tender_id": sample_tender["id"]}
    up = client.post(f"/api/v1/bidders/{own['id']}/documents", data=data, files=files, headers=bidder_user_headers)
    assert up.status_code == 200

    officer_view = client.get(f"/api/v1/bidders/{own['id']}/documents", headers=officer_headers)
    assert officer_view.status_code == 200
    categories = [d["category"] for d in officer_view.json()["data"]]
    assert "GST" in categories
