from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import enforce_bidder_scope, get_current_user, get_own_bidder_id, require_admin, require_officer
from app.models.bidder import Bidder
from app.models.user import User, UserRole
from app.schemas.bidder import (
    BIDDER_BLOCKING_STATUSES,
    BidderCorrectionRequest,
    BidderCreate,
    BidderModerationAction,
    BidderOut,
    BidderSelfUpdate,
    BidderUpdate,
)
from app.services.audit_service import log_action
from app.utils.responses import success

router = APIRouter(prefix="/api/v1/bidders", tags=["Bidders"])


def _sync_user_access(db: Session, bidder: Bidder) -> None:
    """Keep the bidder's linked login account in step with their moderation
    status: SUSPENDED/BANNED immediately deactivates the account (the auth
    layer's is_active check then blocks them on their very next request, not
    just at their next login), any other status re-activates it."""
    if not bidder.user_id:
        return
    user = db.query(User).filter(User.id == bidder.user_id).first()
    if not user:
        return
    should_be_active = bidder.status not in BIDDER_BLOCKING_STATUSES
    if user.is_active != should_be_active:
        user.is_active = should_be_active
        db.commit()


def _moderate(db: Session, bidder_id: str, new_status: str, action: str, current_user: User, reason: str | None) -> Bidder:
    bidder = db.query(Bidder).filter(Bidder.id == bidder_id).first()
    if not bidder:
        raise HTTPException(status_code=404, detail="Bidder not found")
    bidder.status = new_status
    db.commit()
    db.refresh(bidder)
    _sync_user_access(db, bidder)
    log_action(
        db, action=action, actor=current_user, entity_type="Bidder", entity_id=bidder.id, bidder_id=bidder.id,
        description=f"Bidder {bidder.company_name} marked {new_status}" + (f" — reason: {reason}" if reason else ""),
    )
    return bidder


@router.post("")
def create_bidder(payload: BidderCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    # NOTE: manual bidder creation is intentionally restricted to Admin. Bidder
    # profiles are normally created automatically at self-registration
    # (see app/api/v1/auth.py::register). There is no "Add Bidder" UI action
    # anywhere in the product for any role.
    bidder = Bidder(**payload.model_dump())
    db.add(bidder)
    db.commit()
    db.refresh(bidder)
    log_action(db, action="BIDDER_CREATED", actor=current_user, entity_type="Bidder", entity_id=bidder.id, bidder_id=bidder.id, description=f"Bidder profile created: {bidder.company_name}")
    return success(BidderOut.model_validate(bidder).model_dump(), "Bidder created")


@router.get("")
def list_bidders(
    q: str | None = None,
    gstin: str | None = None,
    pan: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Bidder)
    if current_user.role == UserRole.BIDDER:
        # A bidder account may only ever see its own profile in this list.
        own_id = get_own_bidder_id(current_user, db)
        query = query.filter(Bidder.id == own_id) if own_id else query.filter(Bidder.id == "__none__")
    if q:
        query = query.filter(Bidder.company_name.ilike(f"%{q}%"))
    if gstin:
        query = query.filter(Bidder.gstin == gstin)
    if pan:
        query = query.filter(Bidder.pan_number == pan)
    bidders = query.order_by(Bidder.created_at.desc()).all()
    return success([BidderOut.model_validate(b).model_dump() for b in bidders], "Bidders retrieved")


@router.get("/{bidder_id}")
def get_bidder(bidder_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    enforce_bidder_scope(current_user, bidder_id, db)
    bidder = db.query(Bidder).filter(Bidder.id == bidder_id).first()
    if not bidder:
        raise HTTPException(status_code=404, detail="Bidder not found")
    return success(BidderOut.model_validate(bidder).model_dump(), "Bidder retrieved")


@router.put("/{bidder_id}")
def update_bidder(bidder_id: str, payload: BidderUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    enforce_bidder_scope(current_user, bidder_id, db)
    bidder = db.query(Bidder).filter(Bidder.id == bidder_id).first()
    if not bidder:
        raise HTTPException(status_code=404, detail="Bidder not found")

    updates = payload.model_dump(exclude_unset=True)
    if current_user.role == UserRole.BIDDER:
        # Bidders cannot self-edit official identifiers or status — validate
        # against the restricted self-service schema instead.
        restricted = BidderSelfUpdate(**{k: v for k, v in updates.items() if k in BidderSelfUpdate.model_fields})
        disallowed = set(updates.keys()) - set(BidderSelfUpdate.model_fields.keys())
        if disallowed:
            raise HTTPException(
                status_code=403,
                detail=f"Field(s) {sorted(disallowed)} cannot be self-edited. Use the Request Correction action instead.",
            )
        updates = restricted.model_dump(exclude_unset=True)

    for field, value in updates.items():
        setattr(bidder, field, value)
    db.commit()
    db.refresh(bidder)
    if "status" in updates:
        _sync_user_access(db, bidder)
    log_action(db, action="BIDDER_UPDATED", actor=current_user, entity_type="Bidder", entity_id=bidder.id, bidder_id=bidder.id, description=f"Bidder profile updated: {bidder.company_name}")
    return success(BidderOut.model_validate(bidder).model_dump(), "Bidder updated")


@router.post("/{bidder_id}/flag")
def flag_bidder(bidder_id: str, payload: BidderModerationAction, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    """Mark a bidder for closer attention. Non-blocking — the bidder can
    still log in and use the system; this is purely a visible marker for
    other Officers/Admins reviewing this bidder."""
    bidder = _moderate(db, bidder_id, "FLAGGED", "BIDDER_FLAGGED", current_user, payload.reason)
    return success(BidderOut.model_validate(bidder).model_dump(), "Bidder flagged")


@router.post("/{bidder_id}/suspend")
def suspend_bidder(bidder_id: str, payload: BidderModerationAction, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    """Temporarily block a bidder's access pending investigation. Reversible
    via the reactivate action below."""
    bidder = _moderate(db, bidder_id, "SUSPENDED", "BIDDER_SUSPENDED", current_user, payload.reason)
    return success(BidderOut.model_validate(bidder).model_dump(), "Bidder suspended")


@router.post("/{bidder_id}/ban")
def ban_bidder(bidder_id: str, payload: BidderModerationAction, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    """Permanently bar a bidder confirmed to be fraudulent or in violation of
    procurement rules. Blocks login and every authenticated request
    immediately (see _sync_user_access) and is recorded in the audit trail."""
    bidder = _moderate(db, bidder_id, "BANNED", "BIDDER_BANNED", current_user, payload.reason)
    return success(BidderOut.model_validate(bidder).model_dump(), "Bidder banned")


@router.post("/{bidder_id}/reactivate")
def reactivate_bidder(bidder_id: str, payload: BidderModerationAction, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    """Lift a flag/suspension/ban and restore normal access. Kept available
    (rather than making bans a dead end) so a mistaken action can be
    corrected without losing the bidder's history — the reversal itself is
    also audit-logged."""
    bidder = _moderate(db, bidder_id, "ACTIVE", "BIDDER_REACTIVATED", current_user, payload.reason)
    return success(BidderOut.model_validate(bidder).model_dump(), "Bidder reactivated")


@router.post("/{bidder_id}/request-correction")
def request_correction(
    bidder_id: str,
    payload: BidderCorrectionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """A Bidder requests a change to a sensitive/official identifier field.
    This never edits the record directly — it is logged for a Procurement
    Officer / Admin to review and action manually."""
    enforce_bidder_scope(current_user, bidder_id, db)
    bidder = db.query(Bidder).filter(Bidder.id == bidder_id).first()
    if not bidder:
        raise HTTPException(status_code=404, detail="Bidder not found")
    log_action(
        db,
        action="BIDDER_CORRECTION_REQUESTED",
        actor=current_user,
        entity_type="Bidder",
        entity_id=bidder.id,
        bidder_id=bidder.id,
        description=(
            f"Correction requested for field '{payload.field}': "
            f"'{payload.current_value or ''}' -> '{payload.requested_value}'"
            + (f" (reason: {payload.reason})" if payload.reason else "")
        ),
    )
    return success({"bidder_id": bidder_id, "field": payload.field}, "Correction request submitted for review")
