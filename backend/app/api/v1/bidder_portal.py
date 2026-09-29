"""
Bidder Portal API, the single, self-scoped surface a BIDDER-role account
uses. Every endpoint here resolves the bidder implicitly from the
authenticated user's own linked Bidder profile; none of them accept a
bidder_id path parameter, which removes any possibility of one bidder
requesting another bidder's data by guessing/enumerating an id.

Everything returned here has already passed through the translation layer in
app/services/bidder_portal_service.py, no raw engine/AI/forensic language,
no cross-bidder references, no confidential procurement intelligence.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_bidder
from app.models.user import User
from app.schemas.bidder import BidderCorrectionRequest
from app.services import bidder_portal_service as portal
from app.services import notification_service
from app.services.audit_service import log_action
from app.utils.responses import success

router = APIRouter(prefix="/api/v1/portal", tags=["Bidder Portal"])


def _bidder_or_404(db: Session, user: User):
    try:
        return portal.get_own_bidder(db, user)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/dashboard")
def get_dashboard(db: Session = Depends(get_db), current_user: User = Depends(require_bidder)):
    bidder = _bidder_or_404(db, current_user)
    return success(portal.dashboard(db, bidder), "Bidder dashboard retrieved")


@router.get("/tenders")
def get_my_tenders(status: str | None = None, db: Session = Depends(get_db), current_user: User = Depends(require_bidder)):
    bidder = _bidder_or_404(db, current_user)
    return success(portal.list_my_tenders(db, bidder, status), "My tenders retrieved")


@router.get("/documents")
def get_my_documents(db: Session = Depends(get_db), current_user: User = Depends(require_bidder)):
    bidder = _bidder_or_404(db, current_user)
    return success(portal.list_my_documents(db, bidder), "My documents retrieved")


@router.get("/compliance")
def get_compliance_status(db: Session = Depends(get_db), current_user: User = Depends(require_bidder)):
    bidder = _bidder_or_404(db, current_user)
    return success(portal.compliance_status(db, bidder), "Compliance status retrieved")


@router.get("/compliance/{tender_id}")
def get_compliance_detail(tender_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_bidder)):
    bidder = _bidder_or_404(db, current_user)
    from app.models.tender import Tender

    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    if not portal.is_tender_visible(db, bidder.id, tender):
        raise HTTPException(status_code=404, detail="You are not eligible to view this tender")
    # Opening a tender's compliance/detail view is treated as genuine
    # engagement: this is what makes the bidder show up under the Officer's
    # Tender Dashboard / Bidder 360 view for review, without requiring a
    # manual "add bidder" step for an openly-published tender.
    portal.ensure_enrolled(db, bidder, tender)
    return success(portal.compliance_detail_for_tender(db, bidder, tender_id), "Compliance detail retrieved")


@router.get("/action-items")
def get_action_items(db: Session = Depends(get_db), current_user: User = Depends(require_bidder)):
    bidder = _bidder_or_404(db, current_user)
    return success(portal.action_items(db, bidder), "Action items retrieved")


@router.get("/submissions")
def get_submissions(db: Session = Depends(get_db), current_user: User = Depends(require_bidder)):
    bidder = _bidder_or_404(db, current_user)
    return success(portal.submissions(db, bidder), "Submissions retrieved")


@router.get("/notifications")
def get_notifications(unread_only: bool = False, db: Session = Depends(get_db), current_user: User = Depends(require_bidder)):
    bidder = _bidder_or_404(db, current_user)
    notes = notification_service.list_notifications(db, bidder.id, unread_only)
    return success(
        [
            {"id": n.id, "type": n.type, "title": n.title, "message": n.message, "is_read": n.is_read, "tender_id": n.tender_id, "created_at": n.created_at}
            for n in notes
        ],
        "Notifications retrieved",
    )


@router.post("/notifications/{notification_id}/read")
def mark_notification_read(notification_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_bidder)):
    bidder = _bidder_or_404(db, current_user)
    n = notification_service.mark_read(db, bidder.id, notification_id)
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    return success({"id": n.id, "is_read": n.is_read}, "Notification marked as read")


@router.post("/notifications/read-all")
def mark_all_notifications_read(db: Session = Depends(get_db), current_user: User = Depends(require_bidder)):
    bidder = _bidder_or_404(db, current_user)
    count = notification_service.mark_all_read(db, bidder.id)
    return success({"marked_read": count}, "Notifications marked as read")


@router.get("/profile")
def get_profile(db: Session = Depends(get_db), current_user: User = Depends(require_bidder)):
    bidder = _bidder_or_404(db, current_user)
    from app.schemas.bidder import BidderOut

    return success(BidderOut.model_validate(bidder).model_dump(), "Profile retrieved")


@router.post("/profile/request-correction")
def request_profile_correction(
    payload: BidderCorrectionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_bidder),
):
    bidder = _bidder_or_404(db, current_user)
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
    return success({"field": payload.field}, "Correction request submitted for review")
