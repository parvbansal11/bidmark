"""Submission telemetry: which device and network each bidder action came from.

Raw IP addresses are never stored. The server keeps a salted hash of the full
address and of its /24 network, which is enough to tell that two "competing"
bidders uploaded from the same place and useless for anything else.
"""
from sqlalchemy import ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class SubmissionEvent(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "submission_events"

    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    bidder_id: Mapped[str | None] = mapped_column(ForeignKey("bidders.id"), nullable=True, index=True)
    tender_id: Mapped[str | None] = mapped_column(ForeignKey("tenders.id"), nullable=True, index=True)
    event: Mapped[str] = mapped_column(String(40), index=True)  # LOGIN, DOCUMENT_UPLOAD, BID_SUBMIT, CLARIFICATION_REPLY
    ip_hash: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    network_hash: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    device_hash: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(300), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(60), nullable=True)
    # Form interaction summary sent by the client: paste_count, keystrokes, fill_ms, fields.
    interaction: Mapped[dict] = mapped_column(JSON, default=dict)
    paste_count: Mapped[int] = mapped_column(Integer, default=0)
