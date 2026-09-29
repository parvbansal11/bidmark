from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import enforce_bidder_scope, get_current_user, get_own_bidder_id, require_admin, require_officer, require_oversight
from app.models.audit import AuditLog
from app.models.case import BidCase, Clarification
from app.models.tender import Tender
from app.models.user import User, UserRole
from app.services import case_service as cs
from app.services.audit_service import verify_chain
from app.utils.responses import ApiError, success

router = APIRouter(prefix="/api/v1/cases", tags=["Cases"])
clar_router = APIRouter(prefix="/api/v1/clarifications", tags=["Cases"])


class DispositionIn(BaseModel):
    finding_id: str
    outcome: str = Field(pattern="^(UPHELD|DISMISSED)$")
    note: str = ""


class ClarificationIn(BaseModel):
    question: str = Field(min_length=10)
    finding_id: str | None = None
    requested_category: str | None = None
    due_days: int = Field(3, ge=1, le=30)


class AnswerIn(BaseModel):
    text: str = Field(min_length=2)
    document_id: str | None = None


class DecisionIn(BaseModel):
    decision: str = Field(pattern="^(QUALIFIED|DISQUALIFIED)$")
    reason: str


class ReopenIn(BaseModel):
    reason: str


def _run(fn, *args, **kw):
    try:
        return fn(*args, **kw)
    except cs.WorkflowError as e:
        raise ApiError(e.code, e.message, status_code=e.status)


def _case(db: Session, case_id: str) -> BidCase:
    case = db.query(BidCase).filter(BidCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@router.get("/queue")
def queue(tender_id: str | None = None, db: Session = Depends(get_db), user: User = Depends(require_oversight)):
    return success(cs.queue(db, user, tender_id), "Review queue")


@router.get("/mine")
def my_cases(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    bidder_id = get_own_bidder_id(user, db)
    if not bidder_id:
        raise HTTPException(status_code=403, detail="Only bidder accounts have their own cases")
    cases = db.query(BidCase).filter(BidCase.bidder_id == bidder_id).order_by(BidCase.updated_at.desc()).all()
    return success([cs.bidder_view(db, c) for c in cases], "Your cases")


@router.get("/{case_id}")
def get_case(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    case = _case(db, case_id)
    if user.role == UserRole.BIDDER:
        enforce_bidder_scope(user, case.bidder_id, db)
        return success(cs.bidder_view(db, case), "Case")
    return success(cs.view(db, case), "Case")


@router.post("/{tender_id}/{bidder_id}/submit")
def submit(tender_id: str, bidder_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    enforce_bidder_scope(user, bidder_id, db)
    if not db.query(Tender).filter(Tender.id == tender_id).first():
        raise HTTPException(status_code=404, detail="Tender not found")
    case = cs.get_or_create(db, tender_id, bidder_id)
    _run(cs.submit, db, case, user)
    return success(cs.bidder_view(db, case) if user.role == UserRole.BIDDER else cs.view(db, case), "Bid submitted and screened")


@router.post("/{case_id}/screen")
def rescreen(case_id: str, db: Session = Depends(get_db), user: User = Depends(require_officer)):
    case = _case(db, case_id)
    if case.stage == "DRAFT":
        raise ApiError("INVALID_TRANSITION", "The bidder has not submitted yet.", status_code=409)
    _run(cs.screen, db, case, user)
    return success(cs.view(db, case), "Case re-screened")


@router.post("/{case_id}/start-review")
def start_review(case_id: str, db: Session = Depends(get_db), user: User = Depends(require_officer)):
    case = _case(db, case_id)
    _run(cs.start_review, db, case, user)
    return success(cs.view(db, case), "Review started")


@router.post("/{case_id}/dispositions")
def dispose(case_id: str, payload: DispositionIn, db: Session = Depends(get_db), user: User = Depends(require_officer)):
    case = _case(db, case_id)
    if case.stage == "DECIDED":
        raise ApiError("INVALID_TRANSITION", "The case is decided. An Admin must reopen it first.", status_code=409)
    _run(cs.dispose, db, case, user, payload.finding_id, payload.outcome, payload.note)
    return success(cs.view(db, case), "Finding ruled on")


@router.post("/{case_id}/clarifications")
def ask(case_id: str, payload: ClarificationIn, db: Session = Depends(get_db), user: User = Depends(require_officer)):
    case = _case(db, case_id)
    _run(cs.request_clarification, db, case, user, payload.question, payload.finding_id, payload.requested_category, payload.due_days)
    return success(cs.view(db, case), "Clarification requested")


@router.post("/{case_id}/decision")
def decide(case_id: str, payload: DecisionIn, db: Session = Depends(get_db), user: User = Depends(require_officer)):
    case = _case(db, case_id)
    _run(cs.decide, db, case, user, payload.decision, payload.reason)
    return success(cs.view(db, case), "Decision recorded")


@router.post("/{case_id}/reopen")
def reopen(case_id: str, payload: ReopenIn, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    case = _case(db, case_id)
    _run(cs.reopen, db, case, user, payload.reason)
    return success(cs.view(db, case), "Case reopened")


@router.get("/{case_id}/timeline")
def timeline(case_id: str, db: Session = Depends(get_db), user: User = Depends(require_oversight)):
    case = _case(db, case_id)
    rows = (db.query(AuditLog)
            .filter(or_(AuditLog.entity_id == case.id,
                        (AuditLog.bidder_id == case.bidder_id) & (AuditLog.tender_id == case.tender_id)))
            .order_by(AuditLog.seq.asc()).all())
    return success({
        "chain": verify_chain(db),
        "events": [{"seq": r.seq, "at": r.recorded_at, "action": r.action, "actor_role": r.actor_role, "actor_id": r.actor_id,
                    "description": r.description, "metadata": r.metadata_json, "row_hash": r.row_hash} for r in rows],
    }, "Case timeline")


@clar_router.post("/{clarification_id}/answer")
def answer(clarification_id: str, payload: AnswerIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    c = db.query(Clarification).filter(Clarification.id == clarification_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Clarification not found")
    case = _case(db, c.case_id)
    if user.role != UserRole.BIDDER:
        raise HTTPException(status_code=403, detail="Only the bidder answers a clarification")
    enforce_bidder_scope(user, case.bidder_id, db)
    _run(cs.answer_clarification, db, c, user, payload.text, payload.document_id)
    return success(cs.bidder_view(db, case), "Clarification answered")
