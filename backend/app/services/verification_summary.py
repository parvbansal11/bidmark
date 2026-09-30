"""
Verification summary: how many of a tender's applicable requirements are actually
verified, kept apart from submission completeness, risk and the decision gate.

A requirement counts as verified only when the compliance report verified it and
no open or upheld finding on the same evidence says otherwise. Review required,
non-compliant and pending are never counted as verified, and requirements the
tender does not apply (NOT_APPLICABLE) stay out of the denominator. The same
rules drive the compliance passport on the case page, so the two cannot disagree.

No weighting is applied. Requirements are not assumed to be equal, so the summary
reports counts ("4 of 5 verified"), not a percentage score.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.compliance import ComplianceReport, RequirementEvaluation
from app.models.document import Document
from app.models.tender import Requirement

# Which document category a finding concerns, when the finding itself does not say.
CODE_CATEGORY = {
    "GSTIN_CHECKSUM": "GST", "GSTIN_PAN_MISMATCH": "GST", "GSTIN_STATE_MISMATCH": "GST",
    "PAN_HOLDER_TYPE": "PAN", "PAN_NAME_INITIAL": "PAN",
    "CIN_YEAR_VS_INCORPORATION": "MCA", "CIN_STATE_MISMATCH": "MCA",
}

# Evidence type for requirements checked against a registry rather than a submitted document.
NO_SUBMISSION = {"OTHER"}

VERIFIED, REVIEW, NON_COMPLIANT, PENDING = "VERIFIED", "REQUIRES_REVIEW", "NON_COMPLIANT", "PENDING"


def _categories(f: dict, requirements: dict[str, Requirement]) -> set[str]:
    out = {f["category"]} if f.get("category") else set()
    ev = f.get("evidence") or {}
    out |= {p["category"] for p in ev.get("pins") or [] if p.get("category")}
    if f.get("code") in CODE_CATEGORY:
        out.add(CODE_CATEGORY[f["code"]])
    req = requirements.get(ev.get("requirement_id") or "")
    if req:
        out.add(req.evidence_type)
    return out


def check_status(evaluation_status: str, findings: list[dict]) -> str:
    """One applicable requirement: the recorded evaluation, overlaid with findings on its evidence."""
    base = {"VERIFIED": VERIFIED, "FAILED": NON_COMPLIANT, "REQUIRES_REVIEW": REVIEW}.get(evaluation_status, PENDING)
    live = [f for f in findings if f.get("severity") != "INFO" and (f.get("disposition") or {}).get("outcome") != "DISMISSED"]
    upheld = any(f["severity"] == "HIGH" and (f.get("disposition") or {}).get("outcome") == "UPHELD" for f in live)
    open_finding = any(f["severity"] in ("HIGH", "MEDIUM") and not f.get("disposition") for f in live)
    if base in (VERIFIED, PENDING):
        return NON_COMPLIANT if upheld else REVIEW if open_finding else base
    if base == REVIEW and upheld:
        return NON_COMPLIANT
    return base


def summarise(requirements: list[Requirement], evaluations: list[RequirementEvaluation],
              document_categories: set[str], findings: list[dict]) -> dict:
    by_id = {r.id: r for r in requirements}
    by_type = {r.requirement_type: r for r in requirements}
    checks = []
    for e in evaluations:
        if e.status == "NOT_APPLICABLE":
            continue
        req = by_id.get(e.requirement_id) or by_type.get(e.requirement_type)
        evidence_type = req.evidence_type if req else e.requirement_type
        related = [f for f in findings
                   if (req and (f.get("evidence") or {}).get("requirement_id") == req.id) or evidence_type in _categories(f, by_id)]
        checks.append({
            "requirement_type": e.requirement_type, "status": check_status(e.status, related),
            "evidence_expected": evidence_type not in NO_SUBMISSION,
            "evidence_submitted": evidence_type not in NO_SUBMISSION and evidence_type in document_categories,
        })
    count = lambda s: sum(1 for c in checks if c["status"] == s)  # noqa: E731
    expected = [c for c in checks if c["evidence_expected"]]
    return {
        "applicable": len(checks), "verified": count(VERIFIED), "requires_review": count(REVIEW),
        "non_compliant": count(NON_COMPLIANT), "pending": count(PENDING),
        "submission": {"expected": len(expected), "submitted": sum(1 for c in expected if c["evidence_submitted"])},
        "checks": checks,
    }


def for_case(db: Session, bidder_id: str, tender_id: str, findings: list[dict]) -> dict | None:
    """None until a compliance report exists: nothing unverified is reported as verified."""
    report = (db.query(ComplianceReport).filter(ComplianceReport.bidder_id == bidder_id, ComplianceReport.tender_id == tender_id)
              .order_by(ComplianceReport.created_at.desc()).first())
    if not report:
        return None
    evaluations = db.query(RequirementEvaluation).filter(RequirementEvaluation.report_id == report.id).all()
    requirements = db.query(Requirement).filter(Requirement.tender_id == tender_id).all()
    categories = {d.category for d in db.query(Document).filter(Document.bidder_id == bidder_id, Document.is_deleted == False)}  # noqa: E712
    return summarise(requirements, evaluations, categories, findings)
