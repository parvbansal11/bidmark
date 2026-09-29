from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_officer
from app.models.user import User
from app.services.workflow_orchestrator import run_full_verification
from app.utils.responses import success

router = APIRouter(prefix="/api/v1/verification", tags=["Verification Workflow"])


@router.post("/run/{bidder_id}/{tender_id}")
def run_verification(bidder_id: str, tender_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    try:
        result = run_full_verification(db, bidder_id, tender_id, actor=current_user)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return success(result, "Automated verification workflow completed")
