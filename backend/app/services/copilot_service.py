"""
Procurement Officer Copilot (USP 8). Every answer is grounded strictly in
evidence already computed and stored by the platform, the copilot never
calls a government registry itself and never invents a fact.
"""
from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.case import BidCase
from app.models.behavior import BehavioralFlag
from app.models.compliance import ComplianceReport, RequirementEvaluation
from app.models.document import Document
from app.providers.ai.factory import get_ai_provider
from app.services.recommendation_service import build_recommendation


def _report_dict(db: Session, bidder_id: str, tender_id: str) -> dict:
    report = (
        db.query(ComplianceReport)
        .filter(ComplianceReport.bidder_id == bidder_id, ComplianceReport.tender_id == tender_id)
        .order_by(ComplianceReport.created_at.desc())
        .first()
    )
    if not report:
        return {}
    return {
        "overall_score": report.overall_score,
        "risk_level": report.risk_level,
        "failed_count": report.failed_count,
        "requires_review_count": report.requires_review_count,
        "pending_count": report.pending_count,
    }


def gather_evidence(db: Session, bidder_id: str, tender_id: str, compare_bidder_id: str | None = None) -> dict:
    report = _report_dict(db, bidder_id, tender_id)
    evaluations = (
        db.query(RequirementEvaluation)
        .join(ComplianceReport, RequirementEvaluation.report_id == ComplianceReport.id)
        .filter(ComplianceReport.bidder_id == bidder_id, ComplianceReport.tender_id == tender_id)
        .all()
    )
    failed_requirements = [e.requirement_type for e in evaluations if e.status == "FAILED"]

    flags = db.query(BehavioralFlag).filter(BehavioralFlag.bidder_id == bidder_id, BehavioralFlag.tender_id == tender_id).all()
    behavioral_flags = [{"indicator": f.indicator, "evidence": f.evidence} for f in flags]

    docs = db.query(Document).filter(Document.bidder_id == bidder_id, Document.is_deleted == False).all()  # noqa: E712
    documents_requiring_review = [f"{d.category} ({d.original_filename})" for d in docs if d.status == "REQUIRES_REVIEW"]

    recent_logs = (
        db.query(AuditLog)
        .filter(AuditLog.bidder_id == bidder_id)
        .order_by(AuditLog.created_at.desc())
        .limit(10)
        .all()
    )
    recent_audit_events = [f"{l.action}: {l.description}" for l in recent_logs]

    try:
        ai_recommendation = build_recommendation(db, bidder_id, tender_id)
    except ValueError:
        ai_recommendation = {}

    comparison = {}
    if compare_bidder_id:
        other_report = _report_dict(db, compare_bidder_id, tender_id)
        if report and other_report:
            diff = report.get("overall_score", 0) - other_report.get("overall_score", 0)
            comparison = {
                "summary": f"This bidder scored {report.get('overall_score')} vs {other_report.get('overall_score')} for the comparison bidder (difference: {diff:+.1f}).",
                "details": [f"Risk levels: {report.get('risk_level')} vs {other_report.get('risk_level')}"],
            }

    return {
        "compliance_report": report,
        "failed_requirements": failed_requirements,
        "behavioral_flags": behavioral_flags,
        "documents_requiring_review": documents_requiring_review,
        "recent_audit_events": recent_audit_events,
        "ai_recommendation": ai_recommendation,
        "comparison": comparison,
        "case": _case_evidence(db, bidder_id, tender_id),
    }


def _case_evidence(db: Session, bidder_id: str, tender_id: str) -> dict:
    case = db.query(BidCase).filter(BidCase.bidder_id == bidder_id, BidCase.tender_id == tender_id).first()
    if not case:
        return {}
    return {
        "stage": case.stage, "lane": case.lane, "recommendation": case.ai_recommendation,
        "rationale": (case.summary or {}).get("recommendation_rationale"),
        "findings": [{k: f.get(k) for k in ("id", "code", "severity", "source", "title", "detail", "category", "page")}
                     for f in (case.findings or []) if f.get("severity") != "INFO"],
    }


def ask_copilot(db: Session, bidder_id: str, tender_id: str, question: str, compare_bidder_id: str | None = None) -> dict:
    evidence = gather_evidence(db, bidder_id, tender_id, compare_bidder_id)
    provider = get_ai_provider()
    result = provider.answer_copilot_question(question, evidence)
    result["question"] = question
    result["disclaimer"] = "Answers are grounded only in evidence already recorded on the platform and are decision-support only."
    return result
