from sqlalchemy import Date, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class Bidder(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "bidders"

    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)

    company_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    legal_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pan_number: Mapped[str | None] = mapped_column(String(20), index=True, nullable=True)
    gstin: Mapped[str | None] = mapped_column(String(20), index=True, nullable=True)
    cin: Mapped[str | None] = mapped_column(String(30), nullable=True)
    udyam_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    registered_address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    incorporation_date: Mapped[Date | None] = mapped_column(Date, nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="ACTIVE")

    user = relationship("User", back_populates="bidder_profile")
    documents = relationship("Document", back_populates="bidder", cascade="all, delete-orphan")
    bid_submissions = relationship("BidSubmission", back_populates="bidder", cascade="all, delete-orphan")
