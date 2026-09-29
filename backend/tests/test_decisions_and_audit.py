def test_bidder_role_cannot_submit_officer_decision(client, bidder_user_headers, sample_bidder, sample_tender):
    r = client.post(
        f"/api/v1/decisions/{sample_bidder['id']}/{sample_tender['id']}",
        json={"decision": "QUALIFIED", "reason": "Looks fine"},
        headers=bidder_user_headers,
    )
    assert r.status_code == 403


def test_officer_can_submit_and_retrieve_decision(client, officer_headers, sample_bidder, sample_tender):
    r = client.post(
        f"/api/v1/decisions/{sample_bidder['id']}/{sample_tender['id']}",
        json={"decision": "PENDING_REVIEW", "reason": "Awaiting further document verification"},
        headers=officer_headers,
    )
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["decision"] == "PENDING_REVIEW"

    r2 = client.get(f"/api/v1/decisions/{sample_bidder['id']}/{sample_tender['id']}", headers=officer_headers)
    assert r2.status_code == 200
    assert any(d["id"] == data["id"] for d in r2.json()["data"])


def test_decision_rejects_disallowed_verdicts(client, officer_headers, sample_bidder, sample_tender):
    """The platform must never allow an AI-adjacent verdict like FRAUD or
    GUILTY to be recorded as an officer decision, only the three sanctioned
    outcomes are valid per the schema's Literal type."""
    r = client.post(
        f"/api/v1/decisions/{sample_bidder['id']}/{sample_tender['id']}",
        json={"decision": "FRAUDULENT", "reason": "n/a"},
        headers=officer_headers,
    )
    assert r.status_code == 422


def test_audit_trail_records_actions_end_to_end(client, officer_headers, admin_headers, sample_bidder, sample_tender):
    client.post(f"/api/v1/tenders/{sample_tender['id']}/bidders/{sample_bidder['id']}", headers=admin_headers)
    from tests.conftest import upload_doc

    doc = upload_doc(client, officer_headers, sample_bidder["id"], "GST", sample_tender["id"])
    client.post(f"/api/v1/documents/{doc['id']}/extract", headers=officer_headers)
    client.post(f"/api/v1/documents/{doc['id']}/verify", headers=officer_headers)

    r = client.get(f"/api/v1/audit/{sample_bidder['id']}/{sample_tender['id']}", headers=officer_headers)
    assert r.status_code == 200
    actions = {log["action"] for log in r.json()["data"]}
    assert {"BIDDER_ADDED_TO_TENDER", "DOCUMENT_UPLOAD", "OCR_EXTRACTION", "DOCUMENT_VERIFICATION"} <= actions


def test_bidder_wide_audit_trail_endpoint(client, officer_headers, sample_bidder):
    r = client.put(f"/api/v1/bidders/{sample_bidder['id']}", json={"contact_phone": "9998887777"}, headers=officer_headers)
    assert r.status_code == 200
    r = client.get(f"/api/v1/audit/bidder/{sample_bidder['id']}", headers=officer_headers)
    assert r.status_code == 200
    assert len(r.json()["data"]) >= 1
