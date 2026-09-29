from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_officer
from app.models.user import User
from app.services.dashboard_service import bidder_360, overview, review_queue, risk_summary, tender_dashboard
from app.utils.responses import success

router = APIRouter(prefix="/api/v1/dashboard", tags=["Dashboard"])


@router.get("/overview")
def get_overview(db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    return success(overview(db), "Dashboard overview retrieved")


@router.get("/tenders/{tender_id}")
def get_tender_dashboard(tender_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    try:
        return success(tender_dashboard(db, tender_id), "Tender dashboard retrieved")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/bidders/{bidder_id}/{tender_id}")
def get_bidder_360(bidder_id: str, tender_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    try:
        return success(bidder_360(db, bidder_id, tender_id), "Bidder 360 view retrieved")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/review-queue")
def get_review_queue(db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    return success(review_queue(db), "Review queue retrieved")


@router.get("/risk-summary")
def get_risk_summary(db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    return success(risk_summary(db), "Risk summary retrieved")
