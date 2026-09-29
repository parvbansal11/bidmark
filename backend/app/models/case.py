"""The evaluation case: one bidder on one tender, from draft to decision."""
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class BidCase(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "bid_cases"
    __table_args__ = (UniqueConstraint("tender_id", "bidder_id", name="uq_case_tender_bidder"),)

    tender_id: Mapped[str] = mapped_column(ForeignKey("tenders.id"), nullable=False, index=True)
    bidder_id: Mapped[str] = mapped_column(ForeignKey("bidders.id"), nullable=False, index=True)
    stage: Mapped[str] = mapped_column(String(30), default="DRAFT", index=True)
    # FAST_TRACK: nothing above LOW, every check measured. STANDARD: needs review. ESCALATED: HIGH forensic or cartel finding.
    lane: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    priority: Mapped[float] = mapped_column(Float, default=0.0, index=True)
    assigned_officer_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    findings: Mapped[list] = mapped_column(JSON, default=list)
    summary: Mapped[dict] = mapped_column(JSON, default=dict)
    screened_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sla_due_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision: Mapped[str | None] = mapped_column(String(30), nullable=True)
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ai_recommendation: Mapped[str | None] = mapped_column(String(40), nullable=True)
    audit_anchor: Mapped[str | None] = mapped_column(String(64), nullable=True)


class Clarification(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "clarifications"

    case_id: Mapped[str] = mapped_column(ForeignKey("bid_cases.id"), nullable=False, index=True)
    finding_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    requested_category: Mapped[str | None] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="OPEN", index=True)  # OPEN, ANSWERED, CLOSED
    asked_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    due_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    response_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id"), nullable=True)
    answered_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class FindingDisposition(Base, UUIDMixin, TimestampMixin):
    """The officer's call on one finding. These are the labels that tell us
    which rules officers trust, and they are required before a decision."""

    __tablename__ = "finding_dispositions"

    case_id: Mapped[str] = mapped_column(ForeignKey("bid_cases.id"), nullable=False, index=True)
    finding_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    outcome: Mapped[str] = mapped_column(String(20), nullable=False)  # UPHELD, DISMISSED
    note: Mapped[str] = mapped_column(Text, default="")
    officer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    superseded: Mapped[bool] = mapped_column(Boolean, default=False)
