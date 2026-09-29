from sqlalchemy import Boolean, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class BehavioralFlag(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "behavioral_flags"

    bidder_id: Mapped[str] = mapped_column(ForeignKey("bidders.id"), nullable=False, index=True)
    tender_id: Mapped[str | None] = mapped_column(ForeignKey("tenders.id"), nullable=True, index=True)
    category: Mapped[str] = mapped_column(String(60), nullable=False)
    # SUBMISSION_TIMING, DOCUMENT_BEHAVIOR, CROSS_BIDDER, LIFECYCLE, HISTORICAL
    indicator: Mapped[str] = mapped_column(String(255), nullable=False)
    evidence: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[str] = mapped_column(String(20), default="low")  # low, medium, high
    score_impact: Mapped[int] = mapped_column(default=0)
    requires_human_review: Mapped[bool] = mapped_column(Boolean, default=True)

    report_id: Mapped[str | None] = mapped_column(ForeignKey("behavioral_risk_reports.id"), nullable=True)
    report = relationship("BehavioralRiskReport", back_populates="flags")


class BehavioralRiskReport(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "behavioral_risk_reports"

    bidder_id: Mapped[str] = mapped_column(ForeignKey("bidders.id"), nullable=False, index=True)
    tender_id: Mapped[str] = mapped_column(ForeignKey("tenders.id"), nullable=False, index=True)
    behavioral_risk_score: Mapped[int] = mapped_column(default=0)
    risk_level: Mapped[str] = mapped_column(String(20), default="LOW")
    requires_human_review: Mapped[bool] = mapped_column(Boolean, default=False)
    disclaimer: Mapped[str] = mapped_column(
        Text,
        default="Behavioral indicators are signals for further review and do not establish collusion, fraud or misconduct.",
    )

    flags = relationship("BehavioralFlag", back_populates="report", cascade="all, delete-orphan")
