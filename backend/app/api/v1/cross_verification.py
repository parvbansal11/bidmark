from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_officer
from app.engines.cross_check_engine import run_cross_check
from app.models.user import User
from app.models.verification import CrossCheckResult, Discrepancy
from app.schemas.verification import CrossCheckResultOut, DiscrepancyOut
from app.services.audit_service import log_action
from app.utils.responses import success

router = APIRouter(prefix="/api/v1/verification", tags=["Cross Verification"])


@router.post("/cross-check/{bidder_id}/{tender_id}")
def run_cross_check_route(bidder_id: str, tender_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    try:
        result = run_cross_check(db, bidder_id, tender_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    log_action(
        db, action="CROSS_DOCUMENT_VERIFICATION", actor=current_user, entity_type="Bidder", entity_id=bidder_id,
        bidder_id=bidder_id, tender_id=tender_id,
        description=f"Cross-document verification run: {len(result['cross_checks'])} checks, {len(result['discrepancies'])} discrepancies",
    )
    return success(
        {
            "cross_checks": [CrossCheckResultOut.model_validate(c).model_dump() for c in result["cross_checks"]],
            "discrepancies": [DiscrepancyOut.model_validate(d).model_dump() for d in result["discrepancies"]],
        },
        "Cross-document verification completed",
    )


@router.get("/cross-check/{bidder_id}/{tender_id}")
def get_cross_check_route(bidder_id: str, tender_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    checks = db.query(CrossCheckResult).filter(CrossCheckResult.bidder_id == bidder_id, CrossCheckResult.tender_id == tender_id).all()
    discrepancies = db.query(Discrepancy).filter(Discrepancy.bidder_id == bidder_id, Discrepancy.tender_id == tender_id).all()
    return success(
        {
            "cross_checks": [CrossCheckResultOut.model_validate(c).model_dump() for c in checks],
            "discrepancies": [DiscrepancyOut.model_validate(d).model_dump() for d in discrepancies],
        },
        "Cross-document verification results",
    )
