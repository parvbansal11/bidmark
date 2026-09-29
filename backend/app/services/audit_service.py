"""Append-only, hash-chained audit trail.

Every row carries the hash of the row before it. Anyone holding the latest
hash (printed on decision records and exportable by the Auditor) can later
prove that no earlier entry was edited, reordered or removed.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.user import User

GENESIS = "0" * 64
_TAIL = "audit_tail"


def canonical(row: AuditLog) -> str:
    return json.dumps({
        "seq": row.seq, "recorded_at": row.recorded_at, "actor_id": row.actor_id, "actor_role": row.actor_role,
        "action": row.action, "entity_type": row.entity_type, "entity_id": row.entity_id,
        "bidder_id": row.bidder_id, "tender_id": row.tender_id, "description": row.description,
        "metadata": row.metadata_json or {},
    }, sort_keys=True, separators=(",", ":"), default=str)


def row_digest(prev_hash: str, row: AuditLog) -> str:
    return hashlib.sha256((prev_hash + canonical(row)).encode()).hexdigest()


def _tail(db: Session) -> tuple[int, str]:
    if _TAIL in db.info:
        return db.info[_TAIL]
    last = db.query(AuditLog).filter(AuditLog.seq.isnot(None)).order_by(AuditLog.seq.desc()).first()
    return (last.seq, last.row_hash) if last else (0, GENESIS)


@event.listens_for(Session, "after_rollback")
def _forget_tail(session):
    session.info.pop(_TAIL, None)


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
    seq, prev = _tail(db)
    entry = AuditLog(
        actor_id=actor.id if actor else None,
        actor_role=actor.role.value if actor else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        bidder_id=bidder_id,
        tender_id=tender_id,
        description=description[:500],
        metadata_json=json.loads(json.dumps(metadata or {}, default=str)),
        seq=seq + 1,
        recorded_at=datetime.now(timezone.utc).isoformat(timespec="microseconds"),
        prev_hash=prev,
    )
    entry.row_hash = row_digest(prev, entry)
    db.add(entry)
    db.info[_TAIL] = (entry.seq, entry.row_hash)
    if commit:
        db.commit()
        db.refresh(entry)
    return entry


def verify_chain(db: Session) -> dict:
    rows = db.query(AuditLog).filter(AuditLog.seq.isnot(None)).order_by(AuditLog.seq.asc()).all()
    prev, expected_seq = GENESIS, 1
    for r in rows:
        problem = None
        if r.seq != expected_seq:
            problem = f"Entry {expected_seq} is missing; the chain jumps to {r.seq}."
        elif r.prev_hash != prev:
            problem = f"Entry {r.seq} does not point at the entry before it."
        elif row_digest(prev, r) != r.row_hash:
            problem = f"Entry {r.seq} was changed after it was written."
        if problem:
            return {"intact": False, "entries": len(rows), "broken_at": r.seq if r.seq == expected_seq else expected_seq,
                    "entry_id": r.id, "problem": problem}
        prev, expected_seq = r.row_hash, r.seq + 1
    return {"intact": True, "entries": len(rows), "head_seq": expected_seq - 1, "head_hash": prev}
