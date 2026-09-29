"""The role workflow end to end over the API."""
import io

from app.demo import documents as D
from app.forensics.identifiers import make_gstin
from tests.conftest import TestingSessionLocal, register

NAME = "Nimbus Pumps Pvt Ltd"
PAN = "AABCN1234F"
GSTIN = make_gstin("07", PAN)


def _make_bidder(client, email, name=NAME, pan=PAN):
    from app.models.bidder import Bidder
    from app.models.user import User

    headers, _ = register(client, email, "BIDDER")
    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == email).first()
    b = db.query(Bidder).filter(Bidder.user_id == user.id).first()
    b.company_name = b.legal_name = name
    b.pan_number, b.gstin = pan, make_gstin("07", pan)
    b.registered_address = "Okhla Phase II, New Delhi, Delhi 110020"
    db.commit()
    bid = b.id
    db.close()
    return headers, bid


def _upload(client, headers, bidder_id, category, pdf, extra=None):
    files = {"file": (f"{category}.pdf", io.BytesIO(pdf), "application/pdf")}
    r = client.post(f"/api/v1/bidders/{bidder_id}/documents", data={"category": category}, files=files, headers={**headers, **(extra or {})})
    assert r.status_code == 200, r.text
    return r.json()["data"]["id"]


def _bid(client, headers, tender_id, bidder_id, price, extra=None):
    r = client.post(f"/api/v1/tenders/{tender_id}/bidders/{bidder_id}/bid-submission",
                    json={"quoted_price": price, "local_content_percent": 60, "declared_turnover_crore": 10},
                    headers={**headers, **(extra or {})})
    assert r.status_code == 200, r.text


def _case_id(client, headers):
    r = client.get("/api/v1/cases/mine", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["data"][0]["id"]


def _auditor(client, admin_headers):
    r = client.post("/api/v1/users", json={"email": "audit@test.gov.in", "password": "Password123", "full_name": "Auditor",
                                           "role": "AUDITOR"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    r = client.post("/api/v1/auth/login", json={"email": "audit@test.gov.in", "password": "Password123"})
    return {"Authorization": f"Bearer {r.json()['data']['access_token']}"}


def _setup_tampered_case(client, sample_tender):
    headers, bidder_id = _make_bidder(client, "nimbus@test.com")
    _upload(client, headers, bidder_id, "GST", D.gst(NAME, GSTIN, "Okhla Phase II, New Delhi, Delhi 110020", "01/04/2019").pdf)
    oem = D.oem(NAME, "Synthetic Pumps", "Pumps", "01/04/2024", "31/03/2025")
    _upload(client, headers, bidder_id, "OEM_AUTHORIZATION", D.retype(oem, "Valid Upto", "31/03/2027"))
    _bid(client, headers, sample_tender["id"], bidder_id, 500000)
    return headers, bidder_id, _case_id(client, headers)


def test_submit_screens_and_bidder_never_sees_forensic_findings(client, officer_headers, sample_tender):
    headers, _, case_id = _setup_tampered_case(client, sample_tender)
    officer_view = client.get(f"/api/v1/cases/{case_id}", headers=officer_headers).json()["data"]
    assert officer_view["stage"] == "SCREENED" and officer_view["lane"] == "ESCALATED"
    overlap = next(f for f in officer_view["findings"] if f["code"] == "OVERLAPPING_TEXT")
    assert overlap["document_id"] and overlap["bbox"] and overlap["evidence"]["covered_text"] == "31/03/2025"

    bidder_view = client.get(f"/api/v1/cases/{case_id}", headers=headers).json()["data"]
    assert "findings" not in bidder_view and bidder_view["stage"] == "UNDER_EVALUATION"


def test_decision_requires_a_ruling_on_every_high_finding(client, officer_headers, sample_tender):
    _, _, case_id = _setup_tampered_case(client, sample_tender)
    client.post(f"/api/v1/cases/{case_id}/start-review", headers=officer_headers)
    r = client.post(f"/api/v1/cases/{case_id}/decision", json={"decision": "QUALIFIED", "reason": "Looks fine to me overall."}, headers=officer_headers)
    assert r.status_code == 409 and r.json()["error"]["code"] == "FINDINGS_UNRESOLVED"

    case = client.get(f"/api/v1/cases/{case_id}", headers=officer_headers).json()["data"]
    first = case["undisposed_high"][0]
    r = client.post(f"/api/v1/cases/{case_id}/dispositions", json={"finding_id": first, "outcome": "DISMISSED", "note": "ok"}, headers=officer_headers)
    assert r.status_code == 422

    for fid in case["undisposed_high"]:
        r = client.post(f"/api/v1/cases/{case_id}/dispositions",
                        json={"finding_id": fid, "outcome": "UPHELD", "note": "Confirmed on the source PDF."}, headers=officer_headers)
        assert r.status_code == 200, r.text
    r = client.post(f"/api/v1/cases/{case_id}/decision", json={"decision": "DISQUALIFIED", "reason": "OEM validity was retyped."}, headers=officer_headers)
    assert r.status_code == 200, r.text
    done = r.json()["data"]
    assert done["stage"] == "DECIDED" and done["audit_anchor"]

    rel = {row["code"]: row for row in client.get("/api/v1/rules/reliability", headers=officer_headers).json()["data"]}
    assert rel["OVERLAPPING_TEXT"]["upheld"] == 1


def test_clarification_loop_rescreens_on_reply(client, officer_headers, sample_tender):
    headers, bidder_id, case_id = _setup_tampered_case(client, sample_tender)
    r = client.post(f"/api/v1/cases/{case_id}/clarifications",
                    json={"question": "Please upload the OEM letter as issued by the manufacturer.", "requested_category": "OEM_AUTHORIZATION"},
                    headers=officer_headers)
    assert r.status_code == 200 and r.json()["data"]["stage"] == "CLARIFICATION_REQUESTED"

    mine = client.get(f"/api/v1/cases/{case_id}", headers=headers).json()["data"]
    assert mine["next_action"]["code"] == "ANSWER_CLARIFICATION"
    clean = D.oem(NAME, "Synthetic Pumps", "Pumps", "01/04/2025", "31/03/2027").pdf
    doc_id = _upload(client, headers, bidder_id, "OEM_AUTHORIZATION", clean)
    r = client.post(f"/api/v1/clarifications/{mine['clarifications'][0]['id']}/answer",
                    json={"text": "Uploaded the original letter.", "document_id": doc_id}, headers=headers)
    assert r.status_code == 200, r.text
    assert client.get(f"/api/v1/cases/{case_id}", headers=officer_headers).json()["data"]["stage"] == "IN_REVIEW"


def test_shared_device_links_bidders_even_the_one_who_bid_first(client, officer_headers, sample_tender):
    device = {"X-Device-Id": "same-browser-fingerprint"}
    h1, b1 = _make_bidder(client, "one@test.com", "Ring One Pvt Ltd", "AABCR1111A")
    h2, b2 = _make_bidder(client, "two@test.com", "Ring Two Pvt Ltd", "AABCR2222B")
    _bid(client, h1, sample_tender["id"], b1, 400000, device)
    _bid(client, h2, sample_tender["id"], b2, 430000, device)

    intel = client.get(f"/api/v1/tenders/{sample_tender['id']}/intelligence", headers=officer_headers).json()["data"]
    assert intel["rings"] and set(intel["rings"][0]["members"]) == {b1, b2}
    queue = client.get("/api/v1/cases/queue", headers=officer_headers).json()["data"]
    assert all(row["in_ring"] and row["lane"] == "ESCALATED" for row in queue)


def test_audit_chain_detects_an_edited_row(client, admin_headers, officer_headers, sample_tender):
    from app.models.audit import AuditLog

    _setup_tampered_case(client, sample_tender)
    auditor = _auditor(client, admin_headers)
    ok = client.get("/api/v1/audit/chain/verify", headers=auditor).json()["data"]
    assert ok["intact"] and ok["entries"] > 3

    db = TestingSessionLocal()
    row = db.query(AuditLog).filter(AuditLog.seq == 3).first()
    row.description = "quietly changed"
    db.commit()
    db.close()
    broken = client.get("/api/v1/audit/chain/verify", headers=auditor).json()["data"]
    assert broken == {**broken, "intact": False, "broken_at": 3}


def test_auditor_is_read_only_and_bidders_cannot_see_oversight(client, admin_headers, bidder_user_headers, sample_tender):
    auditor = _auditor(client, admin_headers)
    assert client.get("/api/v1/home", headers=auditor).json()["data"]["role"] == "AUDITOR"
    assert client.post("/api/v1/tenders", json={}, headers=auditor).status_code in (403, 422)
    assert client.get("/api/v1/audit/chain/verify", headers=bidder_user_headers).status_code == 403
    assert client.get("/api/v1/cases/queue", headers=bidder_user_headers).status_code == 403


def test_home_is_role_specific(client, admin_headers, officer_headers, bidder_user_headers, sample_tender):
    assert client.get("/api/v1/home", headers=admin_headers).json()["data"]["role"] == "ADMIN"
    officer = client.get("/api/v1/home", headers=officer_headers).json()["data"]
    assert officer["role"] == "PROCUREMENT_OFFICER" and "stats" in officer
    bidder = client.get("/api/v1/home", headers=bidder_user_headers).json()["data"]
    assert bidder["role"] == "BIDDER" and any(t["id"] == sample_tender["id"] for t in bidder["open_tenders"])


def test_evidence_endpoint_and_page_image(client, officer_headers, sample_tender):
    headers, bidder_id, case_id = _setup_tampered_case(client, sample_tender)
    case = client.get(f"/api/v1/cases/{case_id}", headers=officer_headers).json()["data"]
    doc_id = next(f["document_id"] for f in case["findings"] if f["code"] == "OVERLAPPING_TEXT")
    ev = client.get(f"/api/v1/documents/{doc_id}/evidence", headers=officer_headers).json()["data"]
    assert ev["page_sizes"] and ev["fields"]["valid_until"]["bbox"] and not ev["simulated"]
    png = client.get(f"/api/v1/documents/{doc_id}/pages/1.png", headers=officer_headers)
    assert png.status_code == 200 and png.content[:4] == b"\x89PNG"
