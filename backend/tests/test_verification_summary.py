"""Verification summary: only verified requirements count as verified, and it stays apart from risk and the decision gate."""
import inspect
from types import SimpleNamespace as NS

from app.services import assistant, verification_summary
from app.services.verification_summary import check_status, summarise
from tests.test_assistant import ask, case_view
from tests.test_case_workflow import _setup_tampered_case

REQS = [
    NS(id="r-gst", requirement_type="GST", evidence_type="GST"),
    NS(id="r-mca", requirement_type="MCA", evidence_type="MCA"),
    NS(id="r-oem", requirement_type="OEM_AUTHORIZATION", evidence_type="OEM_AUTHORIZATION"),
    NS(id="r-turn", requirement_type="TURNOVER", evidence_type="FINANCIAL"),
    NS(id="r-deb", requirement_type="DEBARMENT", evidence_type="OTHER"),
    NS(id="r-pan", requirement_type="PAN", evidence_type="PAN"),
]
DOCS = {"GST", "MCA", "OEM_AUTHORIZATION", "FINANCIAL"}


def evals(**status):
    """Every requirement verified unless overridden; PAN is not applicable, as for an optional check with no document."""
    base = {"GST": "VERIFIED", "MCA": "VERIFIED", "OEM_AUTHORIZATION": "VERIFIED", "TURNOVER": "VERIFIED", "DEBARMENT": "VERIFIED", "PAN": "NOT_APPLICABLE"}
    base.update(status)
    return [NS(requirement_id=r.id, requirement_type=r.requirement_type, status=base[r.requirement_type]) for r in REQS]


def finding(severity="HIGH", category="OEM_AUTHORIZATION", outcome=None):
    return {"id": f"f-{severity}-{outcome}", "code": "OVERLAPPING_TEXT", "severity": severity, "category": category,
            "evidence": {}, "disposition": {"outcome": outcome} if outcome else None}


def test_open_forensic_finding_makes_the_check_review_required_not_verified_or_failed():
    s = summarise(REQS, evals(), DOCS, [finding()])
    assert (s["applicable"], s["verified"], s["requires_review"], s["non_compliant"], s["pending"]) == (5, 4, 1, 0, 0)
    assert s["submission"] == {"expected": 4, "submitted": 4}


def test_review_pending_and_failed_are_never_counted_as_verified():
    s = summarise(REQS, evals(GST="REQUIRES_REVIEW", MCA="PENDING", TURNOVER="FAILED"), DOCS, [])
    assert (s["verified"], s["requires_review"], s["pending"], s["non_compliant"]) == (2, 1, 1, 1)
    assert s["verified"] + s["requires_review"] + s["pending"] + s["non_compliant"] == s["applicable"]


def test_not_applicable_requirements_stay_out_of_the_denominator():
    assert summarise(REQS, evals(), DOCS, [])["applicable"] == 5
    assert summarise(REQS, evals(PAN="VERIFIED"), DOCS | {"PAN"}, [])["applicable"] == 6


def test_fully_verified_bidder():
    s = summarise(REQS, evals(), DOCS, [])
    assert s["verified"] == s["applicable"] == 5 and not (s["requires_review"] or s["non_compliant"] or s["pending"])


def test_upheld_high_finding_is_non_compliant_and_dismissed_finding_is_ignored():
    assert summarise(REQS, evals(), DOCS, [finding(outcome="UPHELD")])["non_compliant"] == 1
    assert summarise(REQS, evals(), DOCS, [finding(outcome="DISMISSED")])["verified"] == 5
    assert check_status("VERIFIED", [finding(severity="INFO")]) == "VERIFIED"
    assert check_status("VERIFIED", [finding(severity="LOW")]) == "VERIFIED"


def test_submission_completeness_is_independent_of_verification():
    s = summarise(REQS, evals(OEM_AUTHORIZATION="PENDING"), DOCS - {"OEM_AUTHORIZATION"}, [])
    assert s["submission"] == {"expected": 4, "submitted": 3}
    assert s["pending"] == 1
    # Documents all submitted does not make an unverified check verified.
    assert summarise(REQS, evals(OEM_AUTHORIZATION="PENDING"), DOCS, [])["verified"] == 4


def test_no_bidder_specific_values_are_hardcoded():
    src = inspect.getsource(verification_summary) + inspect.getsource(assistant)
    assert "Coastal" not in src and "Hydraulics" not in src


def test_case_view_and_ask_bidmark_share_the_corrected_semantics(client, officer_headers, sample_tender):
    _, bidder_id, case_id = _setup_tampered_case(client, sample_tender)
    view = case_view(client, officer_headers, case_id)
    v = view["verification"]
    assert v["applicable"] == v["verified"] + v["requires_review"] + v["non_compliant"] + v["pending"]
    assert v["verified"] < v["applicable"]
    # The decision gate is its own rule: open high findings block the decision whatever the verification counts say.
    assert view["undisposed_high"]

    out = ask(client, officer_headers, bidder_id, sample_tender["id"], "Is this bidder compliant?")
    assert out["intent"] == "COMPLIANCE_STATUS"
    text = out["answer"]
    assert "100" not in text and "score" not in text
    assert f"{v['verified']} of {v['applicable']} applicable checks" in text
    assert "verification is not complete" in text.lower()
    assert f"{len(view['undisposed_high'])} finding" in text and "officer rulings" in text

    score = ask(client, officer_headers, bidder_id, sample_tender["id"], "What is the compliance score?")["answer"]
    assert "out of 100" not in score and f"{v['verified']} of {v['applicable']}" in score
