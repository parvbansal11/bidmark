"""Ask Bidmark answers from case records only: no model, no invented facts, same permissions as the case."""
import importlib.util

import pytest

from app.services.assistant import SUGGESTIONS, UNKNOWN, classify
from tests.test_case_workflow import NAME, _bid, _make_bidder, _setup_tampered_case


def ask(client, headers, bidder_id, tender_id, question):
    r = client.post("/api/v1/copilot/ask", json={"bidder_id": bidder_id, "tender_id": tender_id, "question": question}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["data"]


def case_view(client, headers, case_id):
    return client.get(f"/api/v1/cases/{case_id}", headers=headers).json()["data"]


@pytest.mark.parametrize("question, intent", [
    ("Why was this bidder flagged?", "FLAG_REASON"),
    ("What compliance checks failed?", "FAILED_CHECKS"),
    ("Which high findings are unresolved?", "HIGH_FINDINGS"),
    ("Show evidence for the OEM finding.", "FINDING_EVIDENCE"),
    ("Why are these bidders linked?", "LINKED_BIDDERS"),
    ("What documents require review?", "DOCUMENT_FINDINGS"),
    ("What statutory checks are pending?", "PENDING_CHECKS"),
    ("What is blocking the final decision?", "DECISION_BLOCKERS"),
    ("Summarise this bidder for officer review.", "BIDDER_SUMMARY"),
    ("What changed after the officer ruling?", "AUDIT_SUMMARY"),
    ("Is this bidder blacklisted?", "DEBARMENT_STATUS"),
    ("What is the compliance score?", "COMPLIANCE_SCORE"),
    ("Why is the risk level high?", "RISK_REASON"),
])
def test_questions_route_to_intents(question, intent):
    assert classify(question) == intent


def test_no_language_model_is_wired():
    from app.core.config import settings
    assert settings.AI_PROVIDER == "deterministic"
    assert importlib.util.find_spec("app.providers.ai.llm_provider") is None
    assert not hasattr(settings, "LLM_API_KEY")


def test_unsupported_question_does_not_guess(client, officer_headers, sample_tender):
    _, bidder_id, _ = _setup_tampered_case(client, sample_tender)
    out = ask(client, officer_headers, bidder_id, sample_tender["id"], "What will the weather be in Chennai tomorrow?")
    assert out["intent"] == "UNKNOWN" and out["answer"] == UNKNOWN
    assert out["citations"] == [] and out["suggestions"] == SUGGESTIONS


def test_answers_come_from_this_case_and_citations_resolve(client, officer_headers, sample_tender):
    headers, bidder_id, case_id = _setup_tampered_case(client, sample_tender)
    view = case_view(client, officer_headers, case_id)
    finding_ids = {f["id"] for f in view["findings"]}
    docs = {d["id"] for d in client.get(f"/api/v1/bidders/{bidder_id}/documents", headers=officer_headers).json()["data"]}

    flagged = ask(client, officer_headers, bidder_id, sample_tender["id"], "Why was this bidder flagged?")
    assert NAME in flagged["answer"] and "OEM authorisation" in flagged["answer"]

    evidence = ask(client, officer_headers, bidder_id, sample_tender["id"], "Show evidence for the OEM finding.")
    assert evidence["citations"]
    for c in evidence["citations"]:
        if c["type"] == "finding":
            assert c["id"] in finding_ids
        if c.get("document_id"):
            assert c["document_id"] in docs
    assert any(c["type"] == "document" and c["page"] for c in evidence["citations"])


def test_high_findings_and_decision_blockers_match_the_gate(client, officer_headers, sample_tender):
    _, bidder_id, case_id = _setup_tampered_case(client, sample_tender)
    tender_id = sample_tender["id"]
    open_high = case_view(client, officer_headers, case_id)["undisposed_high"]
    assert open_high

    highs = ask(client, officer_headers, bidder_id, tender_id, "Which high findings are unresolved?")
    assert f"{len(open_high)} high finding" in highs["answer"]
    assert {c["id"] for c in highs["citations"] if c["type"] == "finding"} == set(open_high)

    blockers = ask(client, officer_headers, bidder_id, tender_id, "What is blocking the final decision?")
    assert "locked" in blockers["answer"] and {c["id"] for c in blockers["citations"]} == set(open_high)

    client.post(f"/api/v1/cases/{case_id}/start-review", headers=officer_headers)
    for fid in open_high:
        r = client.post(f"/api/v1/cases/{case_id}/dispositions", json={"finding_id": fid, "outcome": "UPHELD", "note": "Confirmed with the issuer."},
                        headers=officer_headers)
        assert r.status_code == 200, r.text

    clear = ask(client, officer_headers, bidder_id, tender_id, "What is blocking the final decision?")
    assert clear["answer"].startswith("Nothing blocks the decision")
    changed = ask(client, officer_headers, bidder_id, tender_id, "What changed after the officer ruling?")
    assert "upheld" in changed["answer"] and "0 high findings remain open" in changed["answer"]
    r = client.post(f"/api/v1/cases/{case_id}/decision", json={"decision": "DISQUALIFIED", "reason": "OEM validity was retyped."}, headers=officer_headers)
    assert r.status_code == 200, r.text


def test_linked_bidder_answer_matches_relationship_evidence(client, officer_headers, sample_tender):
    device = {"X-Device-Id": "same-browser-fingerprint"}
    h1, b1 = _make_bidder(client, "one@test.com", "Ring One Pvt Ltd", "AABCR1111A")
    h2, b2 = _make_bidder(client, "two@test.com", "Ring Two Pvt Ltd", "AABCR2222B")
    _bid(client, h1, sample_tender["id"], b1, 400000, device)
    _bid(client, h2, sample_tender["id"], b2, 430000, device)
    intel = client.get(f"/api/v1/tenders/{sample_tender['id']}/intelligence", headers=officer_headers).json()["data"]
    link_types = {l["type"] for l in intel["links"] if b1 in (l["a"], l["b"])}

    out = ask(client, officer_headers, b1, sample_tender["id"], "Why are these bidders linked?")
    assert "Ring Two Pvt Ltd" in out["answer"] and f"{len(link_types)} shared signal" in out["answer"]
    if "SHARED_DEVICE" in link_types:
        assert "same device" in out["answer"]
    assert {"type": "relationship", "id": b2, "bidder_id": b2, "label": "Link with Ring Two Pvt Ltd"} in out["citations"]


def test_only_officers_and_admins_can_ask(client, officer_headers, admin_headers, bidder_user_headers, sample_tender):
    headers, bidder_id, _ = _setup_tampered_case(client, sample_tender)
    body = {"bidder_id": bidder_id, "tender_id": sample_tender["id"], "question": "Why was this bidder flagged?"}
    # A bidder, even about its own bid, cannot read officer findings through the assistant.
    assert client.post("/api/v1/copilot/ask", json=body, headers=headers).status_code == 403
    assert client.post("/api/v1/copilot/ask", json=body, headers=bidder_user_headers).status_code == 403
    assert client.post("/api/v1/copilot/ask", json=body, headers=admin_headers).status_code == 200
    status = client.get("/api/v1/copilot/status", headers=officer_headers).json()["data"]
    assert status["mode"] == "deterministic" and status["model"] is None
