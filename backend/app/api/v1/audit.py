from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_officer
from app.models.audit import AuditLog
from app.models.user import User
from app.utils.responses import success

router = APIRouter(prefix="/api/v1/audit", tags=["Audit"])


def _serialize(log: AuditLog) -> dict:
    return {
        "id": log.id,
        "actor_id": log.actor_id,
        "actor_role": log.actor_role,
        "action": log.action,
        "entity_type": log.entity_type,
        "entity_id": log.entity_id,
        "bidder_id": log.bidder_id,
        "tender_id": log.tender_id,
        "description": log.description,
        "metadata": log.metadata_json,
        "created_at": log.created_at.isoformat(),
    }


@router.get("/bidder/{bidder_id}")
def get_bidder_audit_trail(bidder_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    logs = db.query(AuditLog).filter(AuditLog.bidder_id == bidder_id).order_by(AuditLog.created_at.asc()).all()
    return success([_serialize(l) for l in logs], "Bidder audit trail retrieved")


@router.get("/{bidder_id}/{tender_id}")
def get_audit_trail(bidder_id: str, tender_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.bidder_id == bidder_id)
        .filter(or_(AuditLog.tender_id == tender_id, AuditLog.tender_id.is_(None)))
        .order_by(AuditLog.created_at.asc())
        .all()
    )
    return success([_serialize(l) for l in logs], "Audit trail retrieved")
