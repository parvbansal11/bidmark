from sqlalchemy.orm import Session

from app.models.compliance import ComplianceReport, RequirementEvaluation
from app.models.forensics import ForensicAnalysis
from app.models.behavior import BehavioralRiskReport
from app.models.document import Document
from app.models.verification import Discrepancy
from app.providers.ai.factory import get_ai_provider


def build_recommendation(db: Session, bidder_id: str, tender_id: str) -> dict:
    report = (
        db.query(ComplianceReport)
        .filter(ComplianceReport.bidder_id == bidder_id, ComplianceReport.tender_id == tender_id)
        .order_by(ComplianceReport.created_at.desc())
        .first()
    )
    if not report:
        raise ValueError("No compliance report found. Run /compliance/evaluate first.")

    evaluations = db.query(RequirementEvaluation).filter(RequirementEvaluation.report_id == report.id).all()
    failed = [e.requirement_type for e in evaluations if e.status == "FAILED"]
    requires_review = [e.requirement_type for e in evaluations if e.status == "REQUIRES_REVIEW"]
    pending = [e.requirement_type for e in evaluations if e.status == "PENDING"]

    discrepancies = db.query(Discrepancy).filter(Discrepancy.bidder_id == bidder_id, Discrepancy.tender_id == tender_id).all()

    doc_ids = [d.id for d in db.query(Document).filter(Document.bidder_id == bidder_id, Document.is_deleted == False).all()]  # noqa: E712
    forensic_reports = db.query(ForensicAnalysis).filter(ForensicAnalysis.document_id.in_(doc_ids)).all() if doc_ids else []
    forensic_risk_level = "LOW"
    if any(f.risk_level == "HIGH" for f in forensic_reports):
        forensic_risk_level = "HIGH"
    elif any(f.risk_level == "MEDIUM" for f in forensic_reports):
        forensic_risk_level = "MEDIUM"

    behavioral_report = (
        db.query(BehavioralRiskReport)
        .filter(BehavioralRiskReport.bidder_id == bidder_id, BehavioralRiskReport.tender_id == tender_id)
        .order_by(BehavioralRiskReport.created_at.desc())
        .first()
    )
    behavioral_risk_level = behavioral_report.risk_level if behavioral_report else "LOW"

    debarment_flagged = any(e.requirement_type == "DEBARMENT" and e.status == "REQUIRES_REVIEW" for e in evaluations)

    context = {
        "overall_score": report.overall_score,
        "risk_level": report.risk_level,
        "failed_requirements": failed,
        "requires_review_requirements": requires_review,
        "pending_requirements": pending,
        "discrepancies": [{"description": d.description, "severity": d.severity} for d in discrepancies],
        "forensic_risk_level": forensic_risk_level,
        "behavioral_risk_level": behavioral_risk_level,
        "debarment_flagged": debarment_flagged,
    }

    provider = get_ai_provider()
    return provider.build_recommendation(context)
