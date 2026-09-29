from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class OfficerDecision(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "officer_decisions"

    bidder_id: Mapped[str] = mapped_column(ForeignKey("bidders.id"), nullable=False, index=True)
    tender_id: Mapped[str] = mapped_column(ForeignKey("tenders.id"), nullable=False, index=True)
    officer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    decision: Mapped[str] = mapped_column(String(30), nullable=False)  # QUALIFIED, DISQUALIFIED, PENDING_REVIEW
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    decided_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=True)
