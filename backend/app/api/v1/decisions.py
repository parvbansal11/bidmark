from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import enforce_bidder_scope, get_current_user, require_officer
from app.models.decision import OfficerDecision
from app.models.user import User
from app.schemas.decision import DecisionCreate, DecisionOut
from app.services.audit_service import log_action
from app.services.notification_service import notify
from app.utils.responses import success

router = APIRouter(prefix="/api/v1/decisions", tags=["Decisions"])


@router.post("/{bidder_id}/{tender_id}")
def submit_decision(bidder_id: str, tender_id: str, payload: DecisionCreate, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    decision = OfficerDecision(
        bidder_id=bidder_id, tender_id=tender_id, officer_id=current_user.id,
        decision=payload.decision, reason=payload.reason, decided_at=datetime.now(timezone.utc),
    )
    db.add(decision)
    db.commit()
    db.refresh(decision)
    log_action(
        db, action="FINAL_DECISION", actor=current_user, entity_type="OfficerDecision", entity_id=decision.id,
        bidder_id=bidder_id, tender_id=tender_id, description=f"Officer decision: {payload.decision} — {payload.reason}",
    )
    status_message = {
        "QUALIFIED": "Your bid has been marked as qualified for this tender.",
        "DISQUALIFIED": "Your bid was not qualified for this tender. Contact the procuring department for details.",
        "PENDING_REVIEW": "Your bid is under further review by the procurement team.",
    }.get(payload.decision, "The status of your bid for this tender has changed.")
    notify(db, bidder_id, "TENDER_STATUS_CHANGED", "Bid status updated", status_message, tender_id=tender_id)
    return success(DecisionOut.model_validate(decision).model_dump(), "Decision recorded")


@router.get("/{bidder_id}/{tender_id}")
def get_decisions(bidder_id: str, tender_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    enforce_bidder_scope(current_user, bidder_id, db)
    decisions = (
        db.query(OfficerDecision)
        .filter(OfficerDecision.bidder_id == bidder_id, OfficerDecision.tender_id == tender_id)
        .order_by(OfficerDecision.created_at.desc())
        .all()
    )
    return success([DecisionOut.model_validate(d).model_dump() for d in decisions], "Decisions retrieved")
