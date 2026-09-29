"""
BIDMARK Verification Architecture, persistent result model.

Stores the three-module verdicts, fusion result, detected inconsistencies,
and explainable AI flags produced by the bidmark_engine for one
(bidder, tender) pair.

Consent / privacy audit trail: every piece of data consumed by the engine
is recorded in `consent_audit` so officers and auditors can see exactly
what was accessed, from which source, and under what authorization.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class BidmarkAnalysis(Base, UUIDMixin, TimestampMixin):
    """
    Full BIDMARK output for one (bidder, tender) pair.

    Verdict values: VERIFIED | FLAGGED | NEEDS_REVIEW
    Fusion verdict: RECOMMEND_APPROVAL | RECOMMEND_REVIEW | RECOMMEND_REJECTION
    (These are AI recommendations only, the Procurement Officer makes the
    actual APPROVE / REQUEST_CLARIFICATION / REJECT decision.)
    """

    __tablename__ = "bidmark_analyses"

    bidder_id: Mapped[str] = mapped_column(
        ForeignKey("bidders.id"), nullable=False, index=True
    )
    tender_id: Mapped[str] = mapped_column(
        ForeignKey("tenders.id"), nullable=False, index=True
    )

    # ── Module 1: Entity Registration Intelligence ──────────────────────────
    entity_verdict: Mapped[str] = mapped_column(
        String(30), nullable=False, default="NEEDS_REVIEW"
    )
    # VERIFIED | FLAGGED | NEEDS_REVIEW
    entity_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    entity_summary: Mapped[str] = mapped_column(Text, default="")
    entity_checks: Mapped[dict] = mapped_column(JSON, default=list)
    # [{check, status, source, value, expected, note}]

    # ── Module 2: Behavioural / Risk Intelligence ────────────────────────────
    compliance_verdict: Mapped[str] = mapped_column(
        String(30), nullable=False, default="NEEDS_REVIEW"
    )
    compliance_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    compliance_summary: Mapped[str] = mapped_column(Text, default="")
    compliance_checks: Mapped[dict] = mapped_column(JSON, default=list)

    # ── Module 3: Document Intelligence + DigiLocker ─────────────────────────
    document_verdict: Mapped[str] = mapped_column(
        String(30), nullable=False, default="NEEDS_REVIEW"
    )
    document_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    document_summary: Mapped[str] = mapped_column(Text, default="")
    document_checks: Mapped[dict] = mapped_column(JSON, default=list)

    # ── Data Science Verdict Fusion ───────────────────────────────────────────
    fusion_verdict: Mapped[str] = mapped_column(
        String(40), nullable=False, default="RECOMMEND_REVIEW"
    )
    # RECOMMEND_APPROVAL | RECOMMEND_REVIEW | RECOMMEND_REJECTION
    fusion_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    fusion_explanation: Mapped[str] = mapped_column(Text, default="")

    # ── Detected Inconsistencies ─────────────────────────────────────────────
    detected_inconsistencies: Mapped[dict] = mapped_column(JSON, default=list)
    # [{what, where, why, severity, evidence, source}]

    # ── Explainable AI Flags ─────────────────────────────────────────────────
    explainable_flags: Mapped[dict] = mapped_column(JSON, default=list)
    # [{flag, what, why, which_source, how_serious, what_to_review}]

    # ── Privacy / Consent Audit Trail ────────────────────────────────────────
    consent_audit: Mapped[dict] = mapped_column(JSON, default=list)
    # [{data_type, source, authorization, accessed_at, purpose}]

    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # relationships
    bidder = relationship("Bidder", foreign_keys=[bidder_id])
    tender = relationship("Tender", foreign_keys=[tender_id])
