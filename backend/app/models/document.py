from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class Document(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "documents"

    bidder_id: Mapped[str] = mapped_column(ForeignKey("bidders.id"), nullable=False, index=True)
    tender_id: Mapped[str | None] = mapped_column(ForeignKey("tenders.id"), nullable=True, index=True)
    category: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    # GST, PAN, UDYAM, INCOME_TAX, MCA, STARTUP_INDIA, NSIC, EPFO, ESIC,
    # OEM_AUTHORIZATION, LOCAL_CONTENT, FINANCIAL, OTHER
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    file_hash_sha256: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    uploaded_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="UPLOADED")
    # UPLOADED, EXTRACTED, VERIFIED, FAILED, EXPIRED, MISSING_INFORMATION, REQUIRES_REVIEW
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    bidder = relationship("Bidder", back_populates="documents")
    extraction = relationship("DocumentExtraction", back_populates="document", uselist=False, cascade="all, delete-orphan")
    verification_results = relationship("VerificationResult", back_populates="document", cascade="all, delete-orphan")
    forensic_analysis = relationship("ForensicAnalysis", back_populates="document", uselist=False, cascade="all, delete-orphan")
    fingerprint = relationship("DocumentFingerprint", back_populates="document", uselist=False, cascade="all, delete-orphan")


class DocumentExtraction(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "document_extractions"

    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), nullable=False, unique=True, index=True)
    extraction_provider: Mapped[str] = mapped_column(String(60), default="MockDocumentProvider")
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    registration_number: Mapped[str | None] = mapped_column(String(60), nullable=True)
    pan: Mapped[str | None] = mapped_column(String(20), nullable=True)
    gstin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    cin: Mapped[str | None] = mapped_column(String(30), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    turnover_crore: Mapped[float | None] = mapped_column(Float, nullable=True)
    issue_date: Mapped[str | None] = mapped_column(String(30), nullable=True)
    validity_date: Mapped[str | None] = mapped_column(String(30), nullable=True)
    document_number: Mapped[str | None] = mapped_column(String(60), nullable=True)
    raw_extracted_fields: Mapped[dict] = mapped_column(JSON, default=dict)
    extraction_confidence: Mapped[float] = mapped_column(default=0.9)

    document = relationship("Document", back_populates="extraction")
