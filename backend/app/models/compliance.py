from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class ComplianceReport(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "compliance_reports"

    bidder_id: Mapped[str] = mapped_column(ForeignKey("bidders.id"), nullable=False, index=True)
    tender_id: Mapped[str] = mapped_column(ForeignKey("tenders.id"), nullable=False, index=True)
    overall_score: Mapped[float] = mapped_column(default=0.0)
    risk_level: Mapped[str] = mapped_column(String(20), default="HIGH")  # LOW, MEDIUM, HIGH
    verified_count: Mapped[int] = mapped_column(default=0)
    failed_count: Mapped[int] = mapped_column(default=0)
    pending_count: Mapped[int] = mapped_column(default=0)
    requires_review_count: Mapped[int] = mapped_column(default=0)
    not_applicable_count: Mapped[int] = mapped_column(default=0)
    critical_issues: Mapped[list] = mapped_column(JSON, default=list)
    generated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=True)

    requirement_evaluations = relationship(
        "RequirementEvaluation", back_populates="report", cascade="all, delete-orphan"
    )


class RequirementEvaluation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "requirement_evaluations"

    report_id: Mapped[str] = mapped_column(ForeignKey("compliance_reports.id"), nullable=False, index=True)
    requirement_id: Mapped[str] = mapped_column(ForeignKey("requirements.id"), nullable=False, index=True)
    requirement_type: Mapped[str] = mapped_column(String(60), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    # VERIFIED, FAILED, PENDING, NOT_APPLICABLE, REQUIRES_REVIEW
    evidence: Mapped[list] = mapped_column(JSON, default=list)
    discrepancies: Mapped[list] = mapped_column(JSON, default=list)
    explanation: Mapped[str] = mapped_column(Text, default="")
    score_contribution: Mapped[float] = mapped_column(default=0.0)
    max_score_contribution: Mapped[float] = mapped_column(default=0.0)

    report = relationship("ComplianceReport", back_populates="requirement_evaluations")
