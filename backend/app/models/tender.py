from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class Tender(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "tenders"

    tender_number: Mapped[str] = mapped_column(String(60), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str] = mapped_column(String(255), nullable=False, default="Chennai Petroleum Corporation Limited (CPCL)")
    organization: Mapped[str] = mapped_column(String(255), nullable=False, default="Ministry of Petroleum & Natural Gas")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    estimated_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    published_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=True)
    deadline: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="ACTIVE", index=True)  # ACTIVE, CLOSED, DRAFT
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    # Flagging & Moderation status
    is_flagged: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    flagged_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # GeM-specific tender metadata (added for full bid-lifecycle tracking)
    gem_tender_id: Mapped[str | None] = mapped_column(String(60), unique=True, index=True, nullable=True)
    tender_type: Mapped[str | None] = mapped_column(String(30), nullable=True)  # OPEN_TENDER, LIMITED_TENDER, SINGLE_TENDER
    tender_category: Mapped[str | None] = mapped_column(String(30), nullable=True)  # GOODS, SERVICES, WORKS
    tender_mode: Mapped[str | None] = mapped_column(String(30), nullable=True)  # ONLINE, OFFLINE, HYBRID
    bid_system: Mapped[str | None] = mapped_column(String(30), nullable=True)  # SINGLE_PACKET, TWO_PACKET
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)  # Location of Work/Supply
    bid_validity_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    requirements = relationship("Requirement", back_populates="tender", cascade="all, delete-orphan")
    bid_submissions = relationship("BidSubmission", back_populates="tender", cascade="all, delete-orphan")


class Requirement(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "requirements"

    tender_id: Mapped[str] = mapped_column(ForeignKey("tenders.id"), nullable=False, index=True)
    requirement_type: Mapped[str] = mapped_column(String(60), nullable=False)
    # e.g. GST, PAN, UDYAM, INCOME_TAX, MCA, STARTUP_INDIA, NSIC, EPFO, ESIC,
    # OEM_AUTHORIZATION, LOCAL_CONTENT, DEBARMENT, TURNOVER, DIGILOCKER, CUSTOM
    description: Mapped[str] = mapped_column(Text, nullable=False)
    is_mandatory: Mapped[bool] = mapped_column(Boolean, default=True)
    threshold: Mapped[float | None] = mapped_column(Float, nullable=True)  # e.g. 50 (%) or 10 (crore)
    threshold_unit: Mapped[str | None] = mapped_column(String(30), nullable=True)  # PERCENT, CRORE, BOOLEAN, NONE
    weight: Mapped[float] = mapped_column(Float, default=1.0)
    evidence_type: Mapped[str] = mapped_column(String(60), nullable=False)  # document category expected as evidence

    tender = relationship("Tender", back_populates="requirements")


class TenderBidder(Base, UUIDMixin, TimestampMixin):
    """Association between a tender and an invited/participating bidder."""

    __tablename__ = "tender_bidders"

    tender_id: Mapped[str] = mapped_column(ForeignKey("tenders.id"), nullable=False, index=True)
    bidder_id: Mapped[str] = mapped_column(ForeignKey("bidders.id"), nullable=False, index=True)
    invited_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=True)
