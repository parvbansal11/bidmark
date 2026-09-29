from sqlalchemy import DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class BidSubmission(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "bid_submissions"

    tender_id: Mapped[str] = mapped_column(ForeignKey("tenders.id"), nullable=False, index=True)
    bidder_id: Mapped[str] = mapped_column(ForeignKey("bidders.id"), nullable=False, index=True)
    quoted_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    local_content_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    declared_turnover_crore: Mapped[float | None] = mapped_column(Float, nullable=True)
    submitted_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="SUBMITTED")  # DRAFT, SUBMITTED, WITHDRAWN

    tender = relationship("Tender", back_populates="bid_submissions")
    bidder = relationship("Bidder", back_populates="bid_submissions")
