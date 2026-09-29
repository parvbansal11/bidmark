"""
Aggregation logic backing the dashboard, review-queue, risk-summary and
Bidder 360 investigation view. Read-only — never mutates state.
"""
from sqlalchemy.orm import Session

from app.engines.red_flag_cascade import build_red_flag_cascade
from app.models.behavior import BehavioralRiskReport
from app.models.bidder import Bidder
from app.models.compliance import ComplianceReport, RequirementEvaluation
from app.models.decision import OfficerDecision
from app.models.document import Document
from app.models.forensics import ForensicAnalysis
from app.models.tender import Requirement, Tender, TenderBidder
from app.models.verification import CrossCheckResult, Discrepancy, VerificationResult
from app.services.recommendation_service import build_recommendation


def _latest_report(db: Session, bidder_id: str, tender_id: str):
    return (
        db.query(ComplianceReport)
        .filter(ComplianceReport.bidder_id == bidder_id, ComplianceReport.tender_id == tender_id)
        .order_by(ComplianceReport.created_at.desc())
        .first()
    )


def _forensic_summary(db: Session, bidder_id: str) -> dict:
    doc_ids = [d.id for d in db.query(Document).filter(Document.bidder_id == bidder_id, Document.is_deleted == False).all()]  # noqa: E712
    if not doc_ids:
        return {"risk_level": "LOW", "max_score": 0, "flagged_documents": 0}
    analyses = db.query(ForensicAnalysis).filter(ForensicAnalysis.document_id.in_(doc_ids)).all()
    if not analyses:
        return {"risk_level": "LOW", "max_score": 0, "flagged_documents": 0}
    max_score = max(a.forensic_risk_score for a in analyses)
    level = "HIGH" if any(a.risk_level == "HIGH" for a in analyses) else ("MEDIUM" if any(a.risk_level == "MEDIUM" for a in analyses) else "LOW")
    flagged = sum(1 for a in analyses if a.requires_human_review)
    return {"risk_level": level, "max_score": max_score, "flagged_documents": flagged}


def overview(db: Session) -> dict:
    total_tenders = db.query(Tender).count()
    active_tenders = db.query(Tender).filter(Tender.status == "ACTIVE").count()
    total_bidders = db.query(Bidder).count()
    reports = db.query(ComplianceReport).all()
    verified_bidders = len({r.bidder_id for r in reports if r.risk_level == "LOW" and r.failed_count == 0})
    requires_review = len({(r.bidder_id, r.tender_id) for r in reports if r.requires_review_count > 0 or r.risk_level == "MEDIUM"})
    high_risk = len({(r.bidder_id, r.tender_id) for r in reports if r.risk_level == "HIGH"})
    pending_documents = db.query(Document).filter(Document.status.in_(["UPLOADED", "EXTRACTED"]), Document.is_deleted == False).count()  # noqa: E712

    return {
        "total_tenders": total_tenders,
        "active_tenders": active_tenders,
        "total_bidders": total_bidders,
        "verified_bidders": verified_bidders,
        "requires_review": requires_review,
        "high_risk": high_risk,
        "pending_documents": pending_documents,
    }


def tender_dashboard(db: Session, tender_id: str) -> dict:
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise ValueError("Tender not found")

    links = db.query(TenderBidder).filter(TenderBidder.tender_id == tender_id).all()
    bidder_rows = []
    scores = []
    for link in links:
        bidder = db.query(Bidder).filter(Bidder.id == link.bidder_id).first()
        if not bidder:
            continue
        report = _latest_report(db, bidder.id, tender_id)
        behavior = (
            db.query(BehavioralRiskReport)
            .filter(BehavioralRiskReport.bidder_id == bidder.id, BehavioralRiskReport.tender_id == tender_id)
            .order_by(BehavioralRiskReport.created_at.desc())
            .first()
        )
        forensic = _forensic_summary(db, bidder.id)
        doc_count = db.query(Document).filter(Document.bidder_id == bidder.id, Document.is_deleted == False).count()  # noqa: E712
        decision = (
            db.query(OfficerDecision)
            .filter(OfficerDecision.bidder_id == bidder.id, OfficerDecision.tender_id == tender_id)
            .order_by(OfficerDecision.created_at.desc())
            .first()
        )
        ai_recommendation = None
        if report:
            try:
                ai_recommendation = build_recommendation(db, bidder.id, tender_id)["recommendation"]
            except ValueError:
                ai_recommendation = None

        if report:
            scores.append(report.overall_score)

        bidder_rows.append({
            "bidder_id": bidder.id,
            "company_name": bidder.company_name,
            "compliance_score": report.overall_score if report else None,
            "risk_level": report.risk_level if report else "PENDING",
            "documents": doc_count,
            "compliance_status": {
                "verified": report.verified_count if report else 0,
                "failed": report.failed_count if report else 0,
                "pending": report.pending_count if report else 0,
                "requires_review": report.requires_review_count if report else 0,
            },
            "forensic_risk": forensic["risk_level"],
            "behavior_risk": behavior.risk_level if behavior else "LOW",
            "ai_recommendation": ai_recommendation,
            "officer_decision": decision.decision if decision else None,
        })

    return {
        "tender": {
            "id": tender.id,
            "tender_number": tender.tender_number,
            "title": tender.title,
            "department": tender.department,
            "deadline": tender.deadline.isoformat() if tender.deadline else None,
            "requirements": db.query(Requirement).filter(Requirement.tender_id == tender_id).count(),
            "total_bidders": len(bidder_rows),
            "average_compliance": round(sum(scores) / len(scores), 1) if scores else None,
            "high_risk_bidders": sum(1 for b in bidder_rows if b["risk_level"] == "HIGH"),
            "review_queue": sum(1 for b in bidder_rows if b["risk_level"] in ("MEDIUM", "HIGH") or b["ai_recommendation"] == "REQUIRES_REVIEW"),
        },
        "bidders": bidder_rows,
    }


def bidder_360(db: Session, bidder_id: str, tender_id: str) -> dict:
    bidder = db.query(Bidder).filter(Bidder.id == bidder_id).first()
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not bidder or not tender:
        raise ValueError("Bidder or Tender not found")

    report = _latest_report(db, bidder_id, tender_id)
    evaluations = db.query(RequirementEvaluation).filter(RequirementEvaluation.report_id == report.id).all() if report else []
    documents = db.query(Document).filter(Document.bidder_id == bidder_id, Document.is_deleted == False).all()  # noqa: E712
    verification_results = db.query(VerificationResult).filter(VerificationResult.document_id.in_([d.id for d in documents])).all() if documents else []
    cross_checks = db.query(CrossCheckResult).filter(CrossCheckResult.bidder_id == bidder_id, CrossCheckResult.tender_id == tender_id).all()
    discrepancies = db.query(Discrepancy).filter(Discrepancy.bidder_id == bidder_id, Discrepancy.tender_id == tender_id).all()
    forensic_analyses = db.query(ForensicAnalysis).filter(ForensicAnalysis.document_id.in_([d.id for d in documents])).all() if documents else []
    behavior = (
        db.query(BehavioralRiskReport)
        .filter(BehavioralRiskReport.bidder_id == bidder_id, BehavioralRiskReport.tender_id == tender_id)
        .order_by(BehavioralRiskReport.created_at.desc())
        .first()
    )
    decision = (
        db.query(OfficerDecision)
        .filter(OfficerDecision.bidder_id == bidder_id, OfficerDecision.tender_id == tender_id)
        .order_by(OfficerDecision.created_at.desc())
        .first()
    )
    try:
        ai_recommendation = build_recommendation(db, bidder_id, tender_id)
    except ValueError:
        ai_recommendation = None

    cascade = build_red_flag_cascade(db, bidder_id, tender_id)

    return {
        "bidder": {
            "id": bidder.id, "company_name": bidder.company_name, "legal_name": bidder.legal_name,
            "pan_number": bidder.pan_number, "gstin": bidder.gstin, "cin": bidder.cin,
            "registered_address": bidder.registered_address, "status": bidder.status,
        },
        "tender": {"id": tender.id, "title": tender.title, "tender_number": tender.tender_number},
        "compliance_report": {
            "overall_score": report.overall_score, "risk_level": report.risk_level,
            "verified_count": report.verified_count, "failed_count": report.failed_count,
            "pending_count": report.pending_count, "requires_review_count": report.requires_review_count,
            "critical_issues": report.critical_issues,
            "requirement_evaluations": [
                {
                    "requirement_type": e.requirement_type, "status": e.status, "evidence": e.evidence,
                    "discrepancies": e.discrepancies, "explanation": e.explanation,
                    "score_contribution": e.score_contribution, "max_score_contribution": e.max_score_contribution,
                }
                for e in evaluations
            ],
        } if report else None,
        "government_verification": [
            {"verification_type": v.verification_type, "status": v.status, "reference_id": v.reference_id, "is_mock": v.is_mock, "details": v.details}
            for v in verification_results
        ],
        "documents": [
            {"id": d.id, "category": d.category, "original_filename": d.original_filename, "status": d.status}
            for d in documents
        ],
        "cross_document_checks": [
            {"field": c.field, "relation": c.relation, "sources": c.sources, "values": c.values, "status": c.status, "requires_review": c.requires_review}
            for c in cross_checks
        ],
        "discrepancies": [
            {"category": d.category, "description": d.description, "severity": d.severity, "score_impact": d.score_impact}
            for d in discrepancies
        ],
        "forensic_risk": [
            {"document_id": f.document_id, "forensic_risk_score": f.forensic_risk_score, "risk_level": f.risk_level, "signals": f.signals, "evidence": f.evidence}
            for f in forensic_analyses
        ],
        "behavioral_risk": {
            "score": behavior.behavioral_risk_score, "risk_level": behavior.risk_level,
            "flags": [{"category": fl.category, "indicator": fl.indicator, "evidence": fl.evidence, "confidence": fl.confidence} for fl in behavior.flags],
        } if behavior else None,
        "red_flag_cascade": cascade,
        "ai_recommendation": ai_recommendation,
        "officer_decision": {
            "decision": decision.decision, "reason": decision.reason, "officer_id": decision.officer_id,
            "decided_at": decision.decided_at.isoformat() if decision.decided_at else None,
        } if decision else None,
    }


def review_queue(db: Session) -> list[dict]:
    reports = db.query(ComplianceReport).all()
    queue = []
    seen = set()
    for r in reports:
        key = (r.bidder_id, r.tender_id)
        if key in seen:
            continue
        if r.risk_level in ("MEDIUM", "HIGH") or r.requires_review_count > 0 or r.failed_count > 0:
            seen.add(key)
            bidder = db.query(Bidder).filter(Bidder.id == r.bidder_id).first()
            tender = db.query(Tender).filter(Tender.id == r.tender_id).first()
            queue.append({
                "bidder_id": r.bidder_id, "bidder_name": bidder.company_name if bidder else None,
                "tender_id": r.tender_id, "tender_title": tender.title if tender else None,
                "risk_level": r.risk_level, "overall_score": r.overall_score,
                "failed_count": r.failed_count, "requires_review_count": r.requires_review_count,
                "reason": "High risk" if r.risk_level == "HIGH" else ("Requirements require review" if r.requires_review_count else "Failed requirement(s)"),
            })
    return sorted(queue, key=lambda x: (x["risk_level"] != "HIGH", -x["overall_score"]))


def risk_summary(db: Session) -> dict:
    reports = db.query(ComplianceReport).all()
    risk_distribution = {"LOW": 0, "MEDIUM": 0, "HIGH": 0}
    score_bins = {"0-49": 0, "50-69": 0, "70-89": 0, "90-100": 0}
    for r in reports:
        risk_distribution[r.risk_level] = risk_distribution.get(r.risk_level, 0) + 1
        s = r.overall_score
        if s < 50:
            score_bins["0-49"] += 1
        elif s < 70:
            score_bins["50-69"] += 1
        elif s < 90:
            score_bins["70-89"] += 1
        else:
            score_bins["90-100"] += 1

    failure_frequency: dict[str, int] = {}
    for e in db.query(RequirementEvaluation).filter(RequirementEvaluation.status == "FAILED").all():
        failure_frequency[e.requirement_type] = failure_frequency.get(e.requirement_type, 0) + 1

    verification_status: dict[str, int] = {}
    for v in db.query(VerificationResult).all():
        verification_status[v.status] = verification_status.get(v.status, 0) + 1

    forensic_distribution = {"LOW": 0, "MEDIUM": 0, "HIGH": 0}
    for f in db.query(ForensicAnalysis).all():
        forensic_distribution[f.risk_level] = forensic_distribution.get(f.risk_level, 0) + 1

    behavioral_distribution = {"LOW": 0, "MEDIUM": 0, "HIGH": 0}
    for b in db.query(BehavioralRiskReport).all():
        behavioral_distribution[b.risk_level] = behavioral_distribution.get(b.risk_level, 0) + 1

    return {
        "risk_distribution": risk_distribution,
        "compliance_score_distribution": score_bins,
        "requirement_failure_frequency": failure_frequency,
        "verification_status_distribution": verification_status,
        "document_forensic_risk_distribution": forensic_distribution,
        "behavioral_risk_distribution": behavioral_distribution,
    }
