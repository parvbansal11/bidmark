from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class Notification(Base, UUIDMixin, TimestampMixin):
    """Bidder-facing notification. Always plain, non-technical language — never
    raw engine/AI/forensic terminology and never a reference to another bidder.

    Two kinds populate this table:
      1. Event-triggered: created once, at the moment of the event (document
         verified, officer decision recorded, bid submitted), via
         notification_service.notify().
      2. Derived: computed idempotently at read time for time-based conditions
         (deadline approaching, document expiring) via notification_service's
         sync_derived_notifications(), using `dedupe_key` to avoid duplicates.
    """

    __tablename__ = "notifications"

    bidder_id: Mapped[str] = mapped_column(ForeignKey("bidders.id"), nullable=False, index=True)
    tender_id: Mapped[str | None] = mapped_column(ForeignKey("tenders.id"), nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(60), nullable=False)
    # DEADLINE_APPROACHING, DOCUMENT_EXPIRING, DOCUMENT_VERIFIED, DOCUMENT_ISSUE,
    # ADDITIONAL_DOCUMENT_REQUESTED, TENDER_STATUS_CHANGED, BID_SUBMITTED
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    dedupe_key: Mapped[str | None] = mapped_column(String(160), index=True, nullable=True)
