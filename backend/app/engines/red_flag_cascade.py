"""
Red Flag Cascade (USP 5), turns each discrepancy/anomaly into an explainable
chain: source evidence -> anomaly -> affected requirement -> score impact ->
risk level -> review recommendation -> officer action. This is what makes the
AI's reasoning auditable end-to-end rather than a single opaque number.
"""
from sqlalchemy.orm import Session

from app.models.compliance import ComplianceReport
from app.models.decision import OfficerDecision
from app.models.verification import Discrepancy


def build_red_flag_cascade(db: Session, bidder_id: str, tender_id: str) -> list[dict]:
    discrepancies = db.query(Discrepancy).filter(Discrepancy.bidder_id == bidder_id, Discrepancy.tender_id == tender_id).all()
    report = (
        db.query(ComplianceReport)
        .filter(ComplianceReport.bidder_id == bidder_id, ComplianceReport.tender_id == tender_id)
        .order_by(ComplianceReport.created_at.desc())
        .first()
    )
    decision = (
        db.query(OfficerDecision)
        .filter(OfficerDecision.bidder_id == bidder_id, OfficerDecision.tender_id == tender_id)
        .order_by(OfficerDecision.created_at.desc())
        .first()
    )

    cascades = []
    for d in discrepancies:
        review_recommendation = "Requires Review" if d.severity in ("HIGH", "MEDIUM") else "Monitor"
        officer_action = f"{decision.decision} ({decision.reason})" if decision else "Pending Officer Review"
        cascades.append({
            "source_evidence": d.category,
            "anomaly": d.description,
            "affected_requirement": d.affected_requirement_type or "General compliance profile",
            "score_impact": d.score_impact,
            "risk_level": report.risk_level if report else "UNKNOWN",
            "review_recommendation": review_recommendation,
            "officer_action": officer_action,
        })
    return cascades
