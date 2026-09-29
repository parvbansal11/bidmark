from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_officer
from app.engines.behavioral_engine import analyze_behavior
from app.models.behavior import BehavioralRiskReport
from app.models.user import User
from app.schemas.behavior import BehavioralRiskReportOut
from app.services.audit_service import log_action
from app.utils.responses import success

router = APIRouter(prefix="/api/v1/behavior", tags=["Behavior"])


@router.post("/analyze/{bidder_id}/{tender_id}")
def analyze(bidder_id: str, tender_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    try:
        report = analyze_behavior(db, bidder_id, tender_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    log_action(
        db, action="AI_ANALYSIS", actor=current_user, entity_type="BehavioralRiskReport", entity_id=report.id,
        bidder_id=bidder_id, tender_id=tender_id, description=f"Behavioral risk analysis run: score={report.behavioral_risk_score} ({report.risk_level})",
    )
    return success(BehavioralRiskReportOut.model_validate(report).model_dump(), "Behavioral risk analysis completed")


@router.get("/report/{bidder_id}/{tender_id}")
def get_report(bidder_id: str, tender_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    report = (
        db.query(BehavioralRiskReport)
        .filter(BehavioralRiskReport.bidder_id == bidder_id, BehavioralRiskReport.tender_id == tender_id)
        .order_by(BehavioralRiskReport.created_at.desc())
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="No behavioral risk report found. Run analysis first.")
    return success(BehavioralRiskReportOut.model_validate(report).model_dump(), "Behavioral risk report retrieved")
