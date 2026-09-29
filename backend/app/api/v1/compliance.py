from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import enforce_bidder_scope, get_current_user, require_officer
from app.engines.compliance_engine import evaluate_compliance
from app.models.bidder import Bidder
from app.models.compliance import ComplianceReport
from app.models.tender import Tender
from app.models.user import User
from app.schemas.compliance import AIRecommendationOut, ComplianceReportOut
from app.services.audit_service import log_action
from app.services.pdf_service import build_compliance_report_pdf
from app.services.recommendation_service import build_recommendation
from app.utils.responses import success

router = APIRouter(prefix="/api/v1/compliance", tags=["Compliance"])


@router.post("/evaluate/{bidder_id}/{tender_id}")
def evaluate(bidder_id: str, tender_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    try:
        report = evaluate_compliance(db, bidder_id, tender_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    log_action(
        db, action="SCORE_CHANGE", actor=current_user, entity_type="ComplianceReport", entity_id=report.id,
        bidder_id=bidder_id, tender_id=tender_id,
        description=f"Compliance evaluated: score={report.overall_score}, risk={report.risk_level}",
    )
    return success(ComplianceReportOut.model_validate(report).model_dump(), "Compliance evaluation completed")


@router.get("/report/{bidder_id}/{tender_id}")
def get_report(bidder_id: str, tender_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    enforce_bidder_scope(current_user, bidder_id, db)
    report = (
        db.query(ComplianceReport)
        .filter(ComplianceReport.bidder_id == bidder_id, ComplianceReport.tender_id == tender_id)
        .order_by(ComplianceReport.created_at.desc())
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="No compliance report found. Run evaluation first.")
    return success(ComplianceReportOut.model_validate(report).model_dump(), "Compliance report retrieved")


@router.get("/report/{bidder_id}/{tender_id}/pdf")
def download_compliance_report_pdf(bidder_id: str, tender_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Downloadable PDF version of the compliance report, same data as the
    JSON report above, same RBAC boundary (a Bidder can only ever pull their
    own; Officers/Admin can pull any)."""
    enforce_bidder_scope(current_user, bidder_id, db)
    bidder = db.query(Bidder).filter(Bidder.id == bidder_id).first()
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not bidder or not tender:
        raise HTTPException(status_code=404, detail="Bidder or Tender not found")
    report = (
        db.query(ComplianceReport)
        .filter(ComplianceReport.bidder_id == bidder_id, ComplianceReport.tender_id == tender_id)
        .order_by(ComplianceReport.created_at.desc())
        .first()
    )
    pdf_bytes = build_compliance_report_pdf(bidder, tender, report)
    filename = f"compliance-report-{bidder.company_name.replace(' ', '_')}-{tender.tender_number}.pdf"
    log_action(db, action="COMPLIANCE_REPORT_DOWNLOADED", actor=current_user, entity_type="ComplianceReport", bidder_id=bidder_id, tender_id=tender_id, description=f"Compliance report PDF downloaded for {bidder.company_name}")
    return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{filename}"'})


@router.post("/recommendation/{bidder_id}/{tender_id}")
def recommendation(bidder_id: str, tender_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    try:
        rec = build_recommendation(db, bidder_id, tender_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    log_action(
        db, action="AI_ANALYSIS", actor=current_user, entity_type="AIRecommendation", bidder_id=bidder_id, tender_id=tender_id,
        description=f"AI recommendation generated: {rec['recommendation']} (confidence {rec['confidence']})",
    )
    return success(AIRecommendationOut(**rec).model_dump(), "AI recommendation generated")
