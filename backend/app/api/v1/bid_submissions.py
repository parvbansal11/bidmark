"""
Bid submission endpoints.

Lets a BIDDER (or an officer/admin acting on their behalf) record the
commercial/declared details of a bid against a tender: quoted price, declared
local content percentage, declared turnover, and submission timestamp. These
values feed the compliance engine (LOCAL_CONTENT / TURNOVER requirement
evaluation) and the behavioral engine (submission-timing analysis).

This does not itself perform any verification — it simply records what the
bidder declared. Verification happens against uploaded documents and the
Mock Government Verification API Gateway, exactly as for any other evidence.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import enforce_bidder_scope, get_current_user, require_any
from app.models.bidder import Bidder
from app.models.bid import BidSubmission
from app.models.tender import Tender, TenderBidder
from app.models.user import User, UserRole
from app.schemas.bid import BidSubmissionCreate, BidSubmissionOut
from app.services import bidder_portal_service as portal
from app.services import case_service as cases
from app.services import telemetry_service as telemetry
from app.services.audit_service import log_action
from app.services.notification_service import notify
from app.services.pdf_service import build_bid_receipt_pdf
from app.utils.responses import success

router = APIRouter(prefix="/api/v1/tenders", tags=["Bid Submissions"])
logger = logging.getLogger(__name__)


@router.post("/{tender_id}/bidders/{bidder_id}/bid-submission")
def create_or_update_bid_submission(
    tender_id: str,
    bidder_id: str,
    payload: BidSubmissionCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any),
):
    enforce_bidder_scope(current_user, bidder_id, db)
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    bidder = db.query(Bidder).filter(Bidder.id == bidder_id).first()
    if not tender or not bidder:
        raise HTTPException(status_code=404, detail="Tender or Bidder not found")

    if current_user.role == UserRole.BIDDER:
        if not portal.is_tender_visible(db, bidder_id, tender):
            raise HTTPException(status_code=403, detail="You are not eligible to bid on this tender")
        if tender.deadline:
            deadline = tender.deadline if tender.deadline.tzinfo else tender.deadline.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > deadline:
                raise HTTPException(status_code=403, detail="The submission deadline for this tender has passed; the record is now read-only")

    link = db.query(TenderBidder).filter(TenderBidder.tender_id == tender_id, TenderBidder.bidder_id == bidder_id).first()
    if not link:
        link = TenderBidder(tender_id=tender_id, bidder_id=bidder_id, invited_at=datetime.now(timezone.utc))
        db.add(link)

    submission = (
        db.query(BidSubmission)
        .filter(BidSubmission.tender_id == tender_id, BidSubmission.bidder_id == bidder_id)
        .first()
    )
    data = payload.model_dump()
    if data.get("submitted_at") is None:
        data["submitted_at"] = datetime.now(timezone.utc)

    created = submission is None
    if submission is None:
        submission = BidSubmission(tender_id=tender_id, bidder_id=bidder_id, **data)
        db.add(submission)
    else:
        for field, value in data.items():
            setattr(submission, field, value)

    if current_user.role == UserRole.BIDDER:
        telemetry.record(db, request, "BID_SUBMIT", user_id=current_user.id, bidder_id=bidder_id, tender_id=tender_id, commit=False)
    db.commit()
    if current_user.role == UserRole.BIDDER:
        case = cases.get_or_create(db, tender_id, bidder_id)
        if case.stage == "DRAFT":
            try:
                cases.submit(db, case, current_user)
            except Exception:  # the bid is saved either way; an officer can re-run screening
                logger.exception("screening failed for case %s", case.id)
                db.rollback()
    db.refresh(submission)
    log_action(
        db,
        action="BID_SUBMITTED" if created else "BID_SUBMISSION_UPDATED",
        actor=current_user,
        entity_type="BidSubmission",
        entity_id=submission.id,
        tender_id=tender_id,
        bidder_id=bidder_id,
        description=f"Bid submission {'recorded' if created else 'updated'} for {bidder.company_name} on tender {tender.title}",
    )
    if created:
        notify(db, bidder_id, "BID_SUBMITTED", "Bid submitted successfully", f"Your bid for '{tender.title}' has been submitted successfully.", tender_id=tender_id)
    return success(BidSubmissionOut.model_validate(submission).model_dump(), "Bid submission recorded" if created else "Bid submission updated")


@router.get("/{tender_id}/bidders/{bidder_id}/bid-submission")
def get_bid_submission(
    tender_id: str,
    bidder_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enforce_bidder_scope(current_user, bidder_id, db)
    submission = (
        db.query(BidSubmission)
        .filter(BidSubmission.tender_id == tender_id, BidSubmission.bidder_id == bidder_id)
        .first()
    )
    if not submission:
        raise HTTPException(status_code=404, detail="No bid submission found for this bidder on this tender")
    return success(BidSubmissionOut.model_validate(submission).model_dump(), "Bid submission retrieved")


@router.get("/{tender_id}/bidders/{bidder_id}/bid-submission/receipt.pdf")
def download_bid_receipt_pdf(
    tender_id: str,
    bidder_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enforce_bidder_scope(current_user, bidder_id, db)
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    bidder = db.query(Bidder).filter(Bidder.id == bidder_id).first()
    submission = (
        db.query(BidSubmission)
        .filter(BidSubmission.tender_id == tender_id, BidSubmission.bidder_id == bidder_id)
        .first()
    )
    if not tender or not bidder or not submission:
        raise HTTPException(status_code=404, detail="No bid submission found for this bidder on this tender")
    pdf_bytes = build_bid_receipt_pdf(bidder, tender, submission)
    filename = f"bid-receipt-{bidder.company_name.replace(' ', '_')}-{tender.tender_number}.pdf"
    log_action(db, action="BID_RECEIPT_DOWNLOADED", actor=current_user, entity_type="BidSubmission", entity_id=submission.id, bidder_id=bidder_id, tender_id=tender_id, description="Bid submission receipt PDF downloaded")
    return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{filename}"'})
