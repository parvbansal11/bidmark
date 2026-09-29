from sqlalchemy import ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class AuditLog(Base, UUIDMixin, TimestampMixin):
    """Append-only audit trail. The application layer only ever inserts rows here."""

    __tablename__ = "audit_logs"

    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    actor_role: Mapped[str | None] = mapped_column(String(30), nullable=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    # LOGIN, DOCUMENT_UPLOAD, DOCUMENT_VERIFICATION, OCR_EXTRACTION, AI_ANALYSIS,
    # SCORE_CHANGE, OFFICER_REVIEW, FINAL_DECISION, CONFIGURATION_CHANGE, ...
    entity_type: Mapped[str | None] = mapped_column(String(60), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    bidder_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    tender_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    description: Mapped[str] = mapped_column(String(500), default="")
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
