from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import require_officer
from app.models.user import User
from app.schemas.copilot import CopilotQuestion
from app.services.audit_service import log_action
from app.services.copilot_service import ask_copilot
from app.utils.responses import success

router = APIRouter(prefix="/api/v1/copilot", tags=["Copilot"])


@router.get("/status")
def status(current_user: User = Depends(require_officer)):
    """How answers are produced. Always the deterministic case assistant: no external AI service."""
    return success({"mode": "deterministic", "model": None, "provider": settings.AI_PROVIDER})


@router.post("/ask")
def ask(payload: CopilotQuestion, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    result = ask_copilot(db, payload.bidder_id, payload.tender_id, payload.question, payload.compare_bidder_id)
    log_action(
        db, action="AI_ANALYSIS", actor=current_user, entity_type="CopilotQuery", bidder_id=payload.bidder_id, tender_id=payload.tender_id,
        description=f"Officer asked Ask Bidmark: '{payload.question}'",
    )
    return success(result, "Copilot answered")
