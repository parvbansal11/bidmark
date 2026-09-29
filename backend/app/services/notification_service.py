"""
Notification service: creates and reads bidder-facing notifications.

Every notification created here MUST be safe for a bidder to read directly:
plain language, no internal engine/AI terminology, and never a reference to
another bidder's data. See app/services/bidder_portal_service.py for the
broader translation layer this feeds into (Action Required items etc.).
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.bid import BidSubmission
from app.models.document import Document
from app.models.notification import Notification
from app.models.tender import Tender, TenderBidder

DOCUMENT_VALIDITY_WARNING_DAYS = 30
DEADLINE_WARNING_DAYS = 7


def notify(
    db: Session,
    bidder_id: str,
    type: str,
    title: str,
    message: str,
    tender_id: str | None = None,
    dedupe_key: str | None = None,
) -> Notification | None:
    """Create an event-triggered notification. If dedupe_key is given and a
    notification with that key already exists, no duplicate is created."""
    if dedupe_key:
        existing = db.query(Notification).filter(Notification.dedupe_key == dedupe_key).first()
        if existing:
            return None
    n = Notification(
        bidder_id=bidder_id, tender_id=tender_id, type=type, title=title, message=message, dedupe_key=dedupe_key,
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return n


def _tz_aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def sync_derived_notifications(db: Session, bidder_id: str) -> None:
    """Idempotently materialize time-based notifications (deadline
    approaching, document expiring soon) for a bidder, computed at read time.
    Safe to call on every portal page load."""
    now = datetime.now(timezone.utc)

    # Deadline approaching for tenders this bidder participates in.
    tender_ids = [l.tender_id for l in db.query(TenderBidder).filter(TenderBidder.bidder_id == bidder_id).all()]
    if tender_ids:
        tenders = db.query(Tender).filter(Tender.id.in_(tender_ids)).all()
        for t in tenders:
            if not t.deadline:
                continue
            deadline = _tz_aware(t.deadline)
            days_left = (deadline - now).days
            if 0 <= days_left <= DEADLINE_WARNING_DAYS:
                notify(
                    db, bidder_id, "DEADLINE_APPROACHING",
                    "Submission deadline approaching",
                    f"The bid submission deadline for '{t.title}' is in {days_left} day(s).",
                    tender_id=t.id,
                    dedupe_key=f"deadline:{bidder_id}:{t.id}:{days_left}",
                )

    # Documents expiring soon (based on extracted validity_date, where present).
    docs = (
        db.query(Document)
        .filter(Document.bidder_id == bidder_id, Document.is_deleted == False)  # noqa: E712
        .all()
    )
    for doc in docs:
        validity = getattr(doc.extraction, "validity_date", None) if doc.extraction else None
        if not validity:
            continue
        try:
            validity_dt = datetime.fromisoformat(validity).replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            continue
        days_left = (validity_dt - now).days
        if 0 <= days_left <= DOCUMENT_VALIDITY_WARNING_DAYS:
            notify(
                db, bidder_id, "DOCUMENT_EXPIRING",
                "Document expiring soon",
                f"Your {doc.category.replace('_', ' ').title()} document will expire in {days_left} day(s). Please renew and re-upload it.",
                tender_id=doc.tender_id,
                dedupe_key=f"expiring:{doc.id}:{days_left}",
            )


def list_notifications(db: Session, bidder_id: str, unread_only: bool = False) -> list[Notification]:
    sync_derived_notifications(db, bidder_id)
    query = db.query(Notification).filter(Notification.bidder_id == bidder_id)
    if unread_only:
        query = query.filter(Notification.is_read == False)  # noqa: E712
    return query.order_by(Notification.created_at.desc()).all()


def mark_read(db: Session, bidder_id: str, notification_id: str) -> Notification | None:
    n = db.query(Notification).filter(Notification.id == notification_id, Notification.bidder_id == bidder_id).first()
    if not n:
        return None
    n.is_read = True
    db.commit()
    db.refresh(n)
    return n


def mark_all_read(db: Session, bidder_id: str) -> int:
    count = (
        db.query(Notification)
        .filter(Notification.bidder_id == bidder_id, Notification.is_read == False)  # noqa: E712
        .update({"is_read": True})
    )
    db.commit()
    return count
