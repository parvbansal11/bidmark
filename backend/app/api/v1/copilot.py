from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import require_officer
from app.models.user import User
from app.providers.ai.base import CopilotUnavailable
from app.schemas.copilot import CopilotQuestion
from app.services.audit_service import log_action
from app.services.copilot_service import ask_copilot
from app.utils.responses import ApiError, success

router = APIRouter(prefix="/api/v1/copilot", tags=["Copilot"])


@router.get("/status")
def status(current_user: User = Depends(require_officer)):
    """Which answer source is configured. Says nothing about credentials beyond the mode."""
    llm = settings.AI_PROVIDER == "llm"
    return success({"mode": "llm" if llm else "templated", "model": settings.LLM_MODEL if llm else None})


@router.post("/ask")
def ask(payload: CopilotQuestion, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    try:
        result = ask_copilot(db, payload.bidder_id, payload.tender_id, payload.question, payload.compare_bidder_id)
    except CopilotUnavailable:
        raise ApiError("COPILOT_UNAVAILABLE", "Bidmark Assistant is temporarily unavailable.", status_code=503)
    log_action(
        db, action="AI_ANALYSIS", actor=current_user, entity_type="CopilotQuery", bidder_id=payload.bidder_id, tender_id=payload.tender_id,
        description=f"Officer asked copilot: '{payload.question}'",
    )
    return success(result, "Copilot answered")
