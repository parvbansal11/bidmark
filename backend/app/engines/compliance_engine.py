"""
Compliance engine, maps each tender requirement to the bidder's evidence and
produces a transparent, explainable ComplianceReport. Never returns a
mysterious score: every point is traceable to a requirement-level evaluation.

Score bands (see PS spec section 16):
  90-100 = LOW RISK
  70-89  = MEDIUM RISK
  0-69   = HIGH RISK
NOT_APPLICABLE requirements are excluded from both numerator and denominator.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.bid import BidSubmission
from app.models.bidder import Bidder
from app.models.compliance import ComplianceReport, RequirementEvaluation
from app.models.document import Document
from app.models.tender import Requirement
from app.models.verification import Discrepancy, VerificationResult
from app.providers.government.registry import GovernmentVerificationProvider

DOC_BACKED_TYPES = {
    "GST", "PAN", "UDYAM", "INCOME_TAX", "MCA", "STARTUP_INDIA", "NSIC",
    "EPFO", "ESIC", "OEM_AUTHORIZATION", "DIGILOCKER",
}

VERIFICATION_TO_COMPLIANCE_STATUS = {
    "VERIFIED": "VERIFIED",
    "FAILED": "FAILED",
    "EXPIRED": "FAILED",
    "MISSING_INFORMATION": "REQUIRES_REVIEW",
    "REQUIRES_REVIEW": "REQUIRES_REVIEW",
}


def _score_band(score: float) -> str:
    if score >= 90:
        return "LOW"
    if score >= 70:
        return "MEDIUM"
    return "HIGH"


def _latest_verification(db: Session, bidder_id: str, category: str) -> Optional[VerificationResult]:
    doc = (
        db.query(Document)
        .filter(Document.bidder_id == bidder_id, Document.category == category, Document.is_deleted == False)  # noqa: E712
        .order_by(Document.created_at.desc())
        .first()
    )
    if not doc:
        return None
    return (
        db.query(VerificationResult)
        .filter(VerificationResult.document_id == doc.id)
        .order_by(VerificationResult.created_at.desc())
        .first()
    )


def _evaluate_document_backed(db: Session, bidder: Bidder, req: Requirement) -> tuple[str, list, str]:
    vr = _latest_verification(db, bidder.id, req.requirement_type)
    if not vr:
        has_doc = (
            db.query(Document)
            .filter(Document.bidder_id == bidder.id, Document.category == req.requirement_type, Document.is_deleted == False)  # noqa: E712
            .first()
        )
        if has_doc:
            return "PENDING", [f"Document uploaded but not yet verified (status: {has_doc.status})."], (
                f"A {req.requirement_type} document has been uploaded but verification has not been run yet."
            )
        if req.is_mandatory:
            return "PENDING", [], f"No {req.requirement_type} document has been submitted for this mandatory requirement."
        return "NOT_APPLICABLE", [], f"No {req.requirement_type} document submitted; requirement is optional."

    status = VERIFICATION_TO_COMPLIANCE_STATUS.get(vr.status, "REQUIRES_REVIEW")
    evidence = [f"{req.requirement_type} verification via {vr.government_source} (mock) -> {vr.status}", f"Reference: {vr.reference_id}"]
    evidence.extend(vr.reasons or [])
    explanation = f"Latest {req.requirement_type} document verification returned status '{vr.status}'."
    return status, evidence, explanation


def _evaluate_debarment(db: Session, bidder: Bidder, req: Requirement) -> tuple[str, list, str]:
    result = GovernmentVerificationProvider.verify("DEBARMENT", bidder.cin or bidder.pan_number or bidder.id, {"company_name": bidder.company_name})
    is_debarred = result["data"].get("is_currently_debarred")
    if is_debarred:
        return "REQUIRES_REVIEW", [result["data"].get("message", "")], "Mock debarment registry flagged a record requiring manual review."
    return "VERIFIED", [result["data"].get("message", "")], "No active debarment record found (mock registry)."


def _evaluate_turnover(db: Session, bidder: Bidder, tender_id: str, req: Requirement) -> tuple[str, list, str]:
    bid = db.query(BidSubmission).filter(BidSubmission.bidder_id == bidder.id, BidSubmission.tender_id == tender_id).first()
    declared = bid.declared_turnover_crore if bid else None
    threshold = req.threshold or 0
    # The certificate is the evidence; the figure typed into the bid form is a claim.
    cert = (
        db.query(Document)
        .filter(Document.bidder_id == bidder.id, Document.category == "FINANCIAL", Document.is_deleted == False)  # noqa: E712
        .order_by(Document.created_at.desc())
        .first()
    )
    ext = cert.extraction if cert else None
    documented = ext.turnover_crore if ext and not (ext.raw_extracted_fields or {}).get("simulated") else None
    if documented is not None:
        evidence = [f"Turnover certificate shows ₹{documented} crore."]
        if declared is not None and abs(declared - documented) > 0.1 * max(declared, documented):
            evidence.append(f"The bid form declares ₹{declared} crore, which the certificate does not support.")
        if documented >= threshold:
            return "VERIFIED", evidence, f"Certified turnover meets the minimum of ₹{threshold} crore."
        return "FAILED", evidence, f"Certified turnover ₹{documented} crore is below the minimum of ₹{threshold} crore."
    if declared is None:
        return ("PENDING" if req.is_mandatory else "NOT_APPLICABLE"), [], "No turnover certificate or declared turnover on file for this bid."
    if declared >= threshold:
        return "REQUIRES_REVIEW", [f"Declared turnover ₹{declared} crore meets the minimum of ₹{threshold} crore, but no readable turnover certificate backs it."], "Turnover is declared, not evidenced."
    return "FAILED", [f"Declared turnover ₹{declared} crore is below the minimum of ₹{threshold} crore."], "Turnover requirement not satisfied."


def _evaluate_local_content(db: Session, bidder: Bidder, tender_id: str, req: Requirement) -> tuple[str, list, str]:
    bid = db.query(BidSubmission).filter(BidSubmission.bidder_id == bidder.id, BidSubmission.tender_id == tender_id).first()
    declared = bid.local_content_percent if bid else None
    threshold = req.threshold or 0
    result = GovernmentVerificationProvider.verify(
        "LOCAL_CONTENT", f"{bidder.id}-{tender_id}",
        {"declared_local_content_percent": declared, "required_local_content_percent": threshold},
    )
    meets = result["data"].get("meets_requirement")
    evidence = [result["data"].get("message") or f"Declared local content: {result['data'].get('declared_local_content_percent')}%"]
    if declared is None:
        return ("PENDING" if req.is_mandatory else "NOT_APPLICABLE"), [], "No declared local content percentage on file for this bid."
    return ("VERIFIED" if meets else "FAILED"), evidence, "Local content self-certification evaluated against tender threshold."


def _evaluate_custom(req: Requirement) -> tuple[str, list, str]:
    return "REQUIRES_REVIEW", [], f"'{req.description}' requires manual definition of automated evidence; flagged for officer review."


def evaluate_compliance(db: Session, bidder_id: str, tender_id: str) -> ComplianceReport:
    bidder = db.query(Bidder).filter(Bidder.id == bidder_id).first()
    if not bidder:
        raise ValueError("Bidder not found")
    requirements = db.query(Requirement).filter(Requirement.tender_id == tender_id).all()
    if not requirements:
        raise ValueError("Tender has no requirements defined")

    # Remove previous report(s) for a clean re-evaluation
    old_reports = db.query(ComplianceReport).filter(ComplianceReport.bidder_id == bidder_id, ComplianceReport.tender_id == tender_id).all()
    for r in old_reports:
        db.delete(r)
    db.commit()

    report = ComplianceReport(bidder_id=bidder_id, tender_id=tender_id, generated_at=datetime.now(timezone.utc))
    db.add(report)
    db.flush()

    total_weight = 0.0
    achieved_weight = 0.0
    counts = {"VERIFIED": 0, "FAILED": 0, "PENDING": 0, "NOT_APPLICABLE": 0, "REQUIRES_REVIEW": 0}
    critical_issues: list[str] = []

    for req in requirements:
        if req.requirement_type in DOC_BACKED_TYPES:
            status, evidence, explanation = _evaluate_document_backed(db, bidder, req)
        elif req.requirement_type == "DEBARMENT":
            status, evidence, explanation = _evaluate_debarment(db, bidder, req)
        elif req.requirement_type == "TURNOVER":
            status, evidence, explanation = _evaluate_turnover(db, bidder, tender_id, req)
        elif req.requirement_type == "LOCAL_CONTENT":
            status, evidence, explanation = _evaluate_local_content(db, bidder, tender_id, req)
        else:
            status, evidence, explanation = _evaluate_custom(req)

        counts[status] = counts.get(status, 0) + 1

        discrepancies = (
            db.query(Discrepancy)
            .filter(Discrepancy.bidder_id == bidder_id, Discrepancy.tender_id == tender_id, Discrepancy.affected_requirement_type == req.requirement_type)
            .all()
        )
        discrepancy_texts = [d.description for d in discrepancies]
        discrepancy_penalty = sum(d.score_impact for d in discrepancies)

        max_contribution = req.weight if req.is_mandatory else req.weight * 0.5
        if status == "NOT_APPLICABLE":
            score_contribution = 0.0
            max_contribution = 0.0
        elif status == "VERIFIED":
            score_contribution = max_contribution
        elif status == "REQUIRES_REVIEW":
            score_contribution = max_contribution * 0.5
        else:  # FAILED, PENDING
            score_contribution = 0.0

        if status != "NOT_APPLICABLE":
            total_weight += max_contribution
            achieved_weight += max(0.0, score_contribution)

        if status == "FAILED" and req.is_mandatory:
            critical_issues.append(f"Mandatory requirement failed: {req.requirement_type}, {explanation}")

        db.add(
            RequirementEvaluation(
                report_id=report.id,
                requirement_id=req.id,
                requirement_type=req.requirement_type,
                status=status,
                evidence=evidence,
                discrepancies=discrepancy_texts,
                explanation=explanation,
                score_contribution=round(score_contribution, 2),
                max_score_contribution=round(max_contribution, 2),
            )
        )

    # Overall discrepancy penalty (non-attributed, e.g. profile-wide name/address mismatch)
    all_discrepancies = db.query(Discrepancy).filter(Discrepancy.bidder_id == bidder_id, Discrepancy.tender_id == tender_id).all()
    unattributed_penalty = sum(d.score_impact for d in all_discrepancies if not d.affected_requirement_type)

    raw_score = (achieved_weight / total_weight * 100) if total_weight > 0 else 0.0
    overall_score = max(0.0, min(100.0, raw_score + unattributed_penalty))
    overall_score = round(overall_score, 1)

    report.overall_score = overall_score
    report.risk_level = _score_band(overall_score)
    report.verified_count = counts["VERIFIED"]
    report.failed_count = counts["FAILED"]
    report.pending_count = counts["PENDING"]
    report.requires_review_count = counts["REQUIRES_REVIEW"]
    report.not_applicable_count = counts["NOT_APPLICABLE"]
    report.critical_issues = critical_issues

    db.commit()
    db.refresh(report)
    return report
