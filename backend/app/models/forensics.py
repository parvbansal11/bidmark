from sqlalchemy import Boolean, ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class ForensicAnalysis(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "forensic_analyses"

    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), nullable=False, unique=True, index=True)
    forensic_risk_score: Mapped[int] = mapped_column(default=0)  # 0-100
    risk_level: Mapped[str] = mapped_column(String(20), default="LOW")  # LOW, MEDIUM, HIGH
    signals: Mapped[list] = mapped_column(JSON, default=list)
    evidence: Mapped[list] = mapped_column(JSON, default=list)
    requires_human_review: Mapped[bool] = mapped_column(Boolean, default=False)
    # Which checks ran and which could not (UNMEASURED is never reported as clean).
    checks: Mapped[list] = mapped_column(JSON, default=list)
    # Metadata, revision count, signatures and fonts as read from the file.
    structure: Mapped[dict] = mapped_column(JSON, default=dict)

    document = relationship("Document", back_populates="forensic_analysis")


class DocumentFingerprint(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "document_fingerprints"

    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), nullable=False, unique=True, index=True)
    bidder_id: Mapped[str] = mapped_column(ForeignKey("bidders.id"), nullable=False, index=True)
    file_hash: Mapped[str] = mapped_column(String(64), index=True)
    normalized_text_hash: Mapped[str] = mapped_column(String(64), index=True)
    structural_features: Mapped[dict] = mapped_column(JSON, default=dict)
    metadata_features: Mapped[dict] = mapped_column(JSON, default=dict)
    document_type: Mapped[str] = mapped_column(String(40))
    tfidf_vector: Mapped[dict] = mapped_column(JSON, default=dict)  # sparse {term: weight}

    document = relationship("Document", back_populates="fingerprint")


class FingerprintComparison(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "fingerprint_comparisons"

    document_a_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), nullable=False, index=True)
    document_b_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), nullable=False, index=True)
    bidder_a_id: Mapped[str] = mapped_column(ForeignKey("bidders.id"), nullable=False, index=True)
    bidder_b_id: Mapped[str] = mapped_column(ForeignKey("bidders.id"), nullable=False, index=True)
    similarity_score: Mapped[float] = mapped_column(default=0.0)  # 0-1
    level: Mapped[str] = mapped_column(String(20), default="LOW")  # LOW, MEDIUM, HIGH
    common_sections: Mapped[list] = mapped_column(JSON, default=list)
    requires_review: Mapped[bool] = mapped_column(Boolean, default=False)
