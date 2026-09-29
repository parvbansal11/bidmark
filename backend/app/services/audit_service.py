"""
Append-only audit trail writer. Every meaningful action in the system should
call log_action() so the audit trail (USP 9 / mandatory requirement #32) has a
complete record of what happened, when, and who performed it.
"""
from typing import Optional

from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.user import User


def log_action(
    db: Session,
    action: str,
    actor: Optional[User] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    bidder_id: Optional[str] = None,
    tender_id: Optional[str] = None,
    description: str = "",
    metadata: Optional[dict] = None,
    commit: bool = True,
) -> AuditLog:
    entry = AuditLog(
        actor_id=actor.id if actor else None,
        actor_role=actor.role.value if actor else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        bidder_id=bidder_id,
        tender_id=tender_id,
        description=description,
        metadata_json=metadata or {},
    )
    db.add(entry)
    if commit:
        db.commit()
        db.refresh(entry)
    return entry
