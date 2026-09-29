"""One call per role that returns the landing screen, most urgent work first."""
from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, get_own_bidder_id
from app.models.audit import AuditLog
from app.models.bidder import Bidder
from app.models.case import BidCase, Clarification, FindingDisposition
from app.models.document import Document
from app.models.tender import Tender
from app.models.user import User, UserRole
from app.services import bidder_portal_service as portal
from app.services import case_service as cs
from app.services.audit_service import verify_chain
from app.utils.responses import success

router = APIRouter(prefix="/api/v1/home", tags=["Home"])


def _bidder(db: Session, user: User) -> dict:
    bidder_id = get_own_bidder_id(user, db)
    bidder = db.query(Bidder).filter(Bidder.id == bidder_id).first() if bidder_id else None
    if not bidder:
        return {"role": "BIDDER", "profile_complete": False, "tasks": [{"code": "COMPLETE_PROFILE", "label": "Complete your company profile"}]}
    cases = [cs.bidder_view(db, c) for c in db.query(BidCase).filter(BidCase.bidder_id == bidder.id).order_by(BidCase.updated_at.desc())]
    case_tenders = {c["tender_id"] for c in cases}
    open_tenders = [t for t in db.query(Tender).filter(Tender.status == "ACTIVE") if portal.is_tender_visible(db, bidder.id, t)]
    soon = datetime.now(timezone.utc).date() + timedelta(days=60)
    expiring = []
    for d in db.query(Document).filter(Document.bidder_id == bidder.id, Document.is_deleted == False):  # noqa: E712
        v = d.extraction.validity_date if d.extraction else None
        if v and v[:10] <= soon.isoformat():
            expiring.append({"document_id": d.id, "category": d.category, "valid_until": v[:10], "expired": v[:10] < datetime.now(timezone.utc).date().isoformat()})
    profile_fields = ["legal_name", "pan_number", "gstin", "registered_address", "contact_phone"]
    missing_profile = [f for f in profile_fields if not getattr(bidder, f)]
    tasks = []
    if missing_profile:
        tasks.append({"code": "COMPLETE_PROFILE", "label": f"Add {len(missing_profile)} missing profile field(s)", "fields": missing_profile})
    for c in cases:
        if c["next_action"]["code"] not in ("WAIT", "VIEW_OUTCOME"):
            tasks.append({**c["next_action"], "case_id": c["id"], "tender_id": c["tender_id"], "tender_title": c["tender_title"]})
    for e in expiring:
        tasks.append({"code": "RENEW_DOCUMENT", "label": f"{e['category']} {'expired' if e['expired'] else 'expires'} on {e['valid_until']}", **e})
    return {
        "role": "BIDDER", "bidder_id": bidder.id, "company_name": bidder.company_name, "status": bidder.status,
        "profile_complete": not missing_profile, "tasks": tasks, "cases": cases,
        "open_tenders": [{"id": t.id, "tender_number": t.tender_number, "title": t.title, "deadline": t.deadline.isoformat() if t.deadline else None,
                          "already_bidding": t.id in case_tenders} for t in open_tenders],
        "expiring_documents": expiring,
    }


def _officer(db: Session, user: User) -> dict:
    rows = cs.queue(db, user)
    active = [r for r in rows if r["stage"] != "DECIDED"]
    lanes = Counter(r["lane"] for r in active)
    rings = sum(1 for r in active if r["in_ring"])
    waiting = db.query(Clarification).filter(Clarification.status == "OPEN").count()
    decided_today = db.query(BidCase).filter(BidCase.decided_at >= datetime.now(timezone.utc) - timedelta(days=1)).count()
    return {
        "role": user.role.value,
        "stats": {"to_review": len(active), "escalated": lanes.get("ESCALATED", 0), "standard": lanes.get("STANDARD", 0),
                  "fast_track": lanes.get("FAST_TRACK", 0), "sla_breached": sum(1 for r in active if r["sla_breached"]),
                  "linked_bidders": rings, "awaiting_bidder": waiting, "decided_last_24h": decided_today},
        "queue": active[:25],
        "tasks": [{"code": r["next_action"]["code"], "label": f"{r['bidder_name']}: {r['next_action']['label']}", "case_id": r["case_id"],
                   "lane": r["lane"]} for r in active if r["next_action"]["code"] not in ("WAIT", "DONE")][:10],
    }


def _admin(db: Session, user: User) -> dict:
    tenders = db.query(Tender).all()
    users = Counter(u.role.value for u in db.query(User).all())
    cases = db.query(BidCase).all()
    no_requirements = [t for t in tenders if not t.requirements]
    return {
        "role": "ADMIN",
        "stats": {"tenders": len(tenders), "tenders_by_status": dict(Counter(t.status for t in tenders)),
                  "users_by_role": dict(users), "cases_by_stage": dict(Counter(c.stage for c in cases))},
        "tasks": [{"code": "ADD_REQUIREMENTS", "label": f"{t.tender_number} has no eligibility requirements", "tender_id": t.id} for t in no_requirements],
        "rules": sorted(({"code": k, **v} for k, v in cs.rule_reliability(db).items()), key=lambda r: r["precision"])[:10],
        "audit_chain": verify_chain(db),
        "officer_view": _officer(db, user)["stats"],
    }


def _auditor(db: Session, user: User) -> dict:
    chain = verify_chain(db)
    decisions = db.query(AuditLog).filter(AuditLog.action == "FINAL_DECISION").order_by(AuditLog.seq.desc()).limit(50).all()
    against = [d for d in decisions if (d.metadata_json or {}).get("against_ai")]
    dismissed_high = (db.query(AuditLog).filter(AuditLog.action == "FINDING_DISPOSITION").order_by(AuditLog.seq.desc()).limit(200).all())
    dismissed_high = [d for d in dismissed_high if (d.metadata_json or {}).get("outcome") == "DISMISSED" and (d.metadata_json or {}).get("severity") == "HIGH"]
    tasks = []
    if not chain["intact"]:
        tasks.append({"code": "CHAIN_BROKEN", "label": f"Audit chain broken at entry {chain['broken_at']}: {chain['problem']}"})
    tasks += [{"code": "REVIEW_OVERRIDE", "label": f"Decision against the AI recommendation: {d.description[:80]}", "audit_seq": d.seq,
               "case_id": d.entity_id} for d in against[:10]]
    tasks += [{"code": "REVIEW_DISMISSAL", "label": f"High finding dismissed: {d.description[:80]}", "audit_seq": d.seq,
               "case_id": d.entity_id} for d in dismissed_high[:10]]
    return {
        "role": "AUDITOR", "audit_chain": chain,
        "stats": {"decisions": len(decisions), "against_ai": len(against), "high_findings_dismissed": len(dismissed_high),
                  "dispositions": db.query(FindingDisposition).count()},
        "tasks": tasks,
        "recent_decisions": [{"seq": d.seq, "at": d.recorded_at, "description": d.description, "case_id": d.entity_id,
                              "row_hash": d.row_hash, **(d.metadata_json or {})} for d in decisions[:20]],
    }


@router.get("")
def home(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    handler = {UserRole.BIDDER: _bidder, UserRole.PROCUREMENT_OFFICER: _officer, UserRole.ADMIN: _admin, UserRole.AUDITOR: _auditor}[user.role]
    data = handler(db, user)
    data["user"] = {"id": user.id, "name": user.full_name, "email": user.email, "role": user.role.value}
    return success(data, "Home")
