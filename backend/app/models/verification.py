from sqlalchemy import Boolean, DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class VerificationResult(Base, UUIDMixin, TimestampMixin):
    """Result of verifying a single document (govt mock check + internal rules)."""

    __tablename__ = "verification_results"

    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), nullable=False, index=True)
    verification_type: Mapped[str] = mapped_column(String(60), nullable=False)  # e.g. GST, PAN ...
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    # VERIFIED, FAILED, EXPIRED, MISSING_INFORMATION, REQUIRES_REVIEW
    government_source: Mapped[str] = mapped_column(String(60), default="MOCK_GOVERNMENT_API")
    is_mock: Mapped[bool] = mapped_column(Boolean, default=True)
    reference_id: Mapped[str | None] = mapped_column(String(60), nullable=True)
    verified_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    reasons: Mapped[dict] = mapped_column(JSON, default=list)

    document = relationship("Document", back_populates="verification_results")


class CrossCheckResult(Base, UUIDMixin, TimestampMixin):
    """One field-level cross-document consistency check, e.g. company_name across PAN/GST/MCA."""

    __tablename__ = "cross_check_results"

    bidder_id: Mapped[str] = mapped_column(ForeignKey("bidders.id"), nullable=False, index=True)
    tender_id: Mapped[str] = mapped_column(ForeignKey("tenders.id"), nullable=False, index=True)
    field: Mapped[str] = mapped_column(String(60), nullable=False)  # company_name, pan, address, dates, turnover...
    relation: Mapped[str] = mapped_column(String(60), nullable=False)  # e.g. PAN<->GST
    sources: Mapped[list] = mapped_column(JSON, default=list)
    values: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    # MATCH, MINOR_VARIATION, MAJOR_MISMATCH, NOT_APPLICABLE
    requires_review: Mapped[bool] = mapped_column(Boolean, default=False)


class Discrepancy(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "discrepancies"

    bidder_id: Mapped[str] = mapped_column(ForeignKey("bidders.id"), nullable=False, index=True)
    tender_id: Mapped[str] = mapped_column(ForeignKey("tenders.id"), nullable=False, index=True)
    cross_check_result_id: Mapped[str | None] = mapped_column(ForeignKey("cross_check_results.id"), nullable=True)
    category: Mapped[str] = mapped_column(String(60), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), default="MEDIUM")  # LOW, MEDIUM, HIGH
    affected_requirement_type: Mapped[str | None] = mapped_column(String(60), nullable=True)
    score_impact: Mapped[float] = mapped_column(default=0.0)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    # Pins into source documents: [{document_id, category, field, page, bbox, value}]
    evidence: Mapped[list] = mapped_column(JSON, default=list)
    code: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
