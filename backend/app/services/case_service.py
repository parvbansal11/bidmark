"""Evaluation workflow for one bidder on one tender.

    DRAFT -> SUBMITTED -> SCREENED -> IN_REVIEW -> DECIDED
                                        |   ^
                                        v   |
                          CLARIFICATION_REQUESTED -> CLARIFICATION_RECEIVED

Screening runs every engine and collapses their output into one list of
findings, each pinned to its evidence. The officer must give every HIGH
finding a disposition (upheld or dismissed, with a note) before deciding.
Those dispositions double as labels: a rule officers keep dismissing loses
weight in the queue.
"""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.engines.bidmark_engine import run_bidmark_analysis
from app.engines.cartel_engine import analyse_tender
from app.forensics.document import SEVERITY_POINTS
from app.models.bidder import Bidder
from app.models.case import BidCase, Clarification, FindingDisposition
from app.models.compliance import ComplianceReport, RequirementEvaluation
from app.models.decision import OfficerDecision
from app.models.document import Document
from app.models.tender import Requirement, Tender
from app.models.user import User, UserRole
from app.models.verification import Discrepancy
from app.services.audit_service import log_action
from app.services.notification_service import notify
from app.services import verification_summary
from app.services.workflow_orchestrator import run_full_verification

O, A, B, S = UserRole.PROCUREMENT_OFFICER, UserRole.ADMIN, UserRole.BIDDER, "SYSTEM"

TRANSITIONS: dict[str, dict[str, set]] = {
    "DRAFT": {"SUBMITTED": {B, O, A}, "WITHDRAWN": {B}},
    "SUBMITTED": {"SCREENED": {S, O, A}, "WITHDRAWN": {B}},
    "SCREENED": {"IN_REVIEW": {O, A}, "DECIDED": {O, A}, "CLARIFICATION_REQUESTED": {O, A}},
    "IN_REVIEW": {"CLARIFICATION_REQUESTED": {O, A}, "DECIDED": {O, A}, "SCREENED": {S}},
    "CLARIFICATION_REQUESTED": {"CLARIFICATION_RECEIVED": {B, S}, "IN_REVIEW": {O, A}},
    "CLARIFICATION_RECEIVED": {"IN_REVIEW": {S, O, A}, "CLARIFICATION_REQUESTED": {O, A}, "DECIDED": {O, A}},
    "DECIDED": {"IN_REVIEW": {A}},
    "WITHDRAWN": {},
}
DECIDABLE = {"SCREENED", "IN_REVIEW", "CLARIFICATION_RECEIVED"}
TAMPER_CODES = {"SIGNATURE_BROKEN", "MODIFIED_AFTER_SIGNING", "OVERLAPPING_TEXT", "FIELD_FONT_OUTLIER",
                "IDENTICAL_FILE_REUSE_CROSS_BIDDER"}
CARTEL_CODES = {"LINKED_BIDDER_RING", "POSSIBLE_COVER_BID", "IDENTICAL_PRICES", "PRICE_LADDER"}
SLA = {"ESCALATED": timedelta(days=1), "STANDARD": timedelta(days=2), "FAST_TRACK": timedelta(days=3)}


class WorkflowError(Exception):
    def __init__(self, code: str, message: str, status: int = 409):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt):
    return dt if dt is None or dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def get_or_create(db: Session, tender_id: str, bidder_id: str) -> BidCase:
    case = db.query(BidCase).filter(BidCase.tender_id == tender_id, BidCase.bidder_id == bidder_id).first()
    if not case:
        case = BidCase(tender_id=tender_id, bidder_id=bidder_id, stage="DRAFT", findings=[], summary={})
        db.add(case)
        db.commit()
        db.refresh(case)
    return case


def transition(db: Session, case: BidCase, to: str, actor: User | None, reason: str = "") -> BidCase:
    role = actor.role if actor else S
    allowed = TRANSITIONS.get(case.stage, {}).get(to)
    if allowed is None:
        raise WorkflowError("INVALID_TRANSITION", f"A case in {case.stage} cannot move to {to}.")
    if role not in allowed:
        raise WorkflowError("FORBIDDEN_TRANSITION", f"{getattr(role, 'value', role)} cannot move a case from {case.stage} to {to}.", 403)
    before = case.stage
    case.stage = to
    log_action(db, action="CASE_TRANSITION", actor=actor, entity_type="BidCase", entity_id=case.id, bidder_id=case.bidder_id,
               tender_id=case.tender_id, description=f"{before} -> {to}" + (f": {reason}" if reason else ""),
               metadata={"from": before, "to": to}, commit=False)
    db.commit()
    return case


# ── findings ─────────────────────────────────────────────────────────────────

def rule_reliability(db: Session) -> dict[str, dict]:
    """Share of each rule's findings that officers upheld, with a uniform prior
    so a rule with no history starts at 0.5 rather than at 0 or 1."""
    counts: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for d in db.query(FindingDisposition).filter(FindingDisposition.superseded == False):  # noqa: E712
        counts[d.code][0 if d.outcome == "UPHELD" else 1] += 1
    return {code: {"upheld": u, "dismissed": x, "reviewed": u + x, "precision": round((u + 1) / (u + x + 2), 3)}
            for code, (u, x) in counts.items()}


def _documents(db: Session, case: BidCase) -> list[Document]:
    return (db.query(Document)
            .filter(Document.bidder_id == case.bidder_id, Document.is_deleted == False)  # noqa: E712
            .filter((Document.tender_id == case.tender_id) | (Document.tender_id.is_(None))).all())


def collect_findings(db: Session, case: BidCase, intel: dict | None = None) -> list[dict]:
    out: list[dict] = []

    for doc in _documents(db, case):
        fa = doc.forensic_analysis
        for s in (fa.signals if fa else []):
            out.append({
                "id": f"doc:{doc.id}:{s['code']}", "code": s["code"], "severity": s["severity"], "source": "DOCUMENT",
                "title": s.get("title") or s["code"], "detail": s.get("detail", ""),
                "document_id": doc.id, "category": doc.category, "filename": doc.original_filename,
                "page": s.get("page"), "bbox": s.get("bbox"), "evidence": s.get("evidence") or {},
            })

    for d in db.query(Discrepancy).filter(Discrepancy.bidder_id == case.bidder_id, Discrepancy.tender_id == case.tender_id):
        code = d.code or d.category
        pins = d.evidence or []
        first = pins[0] if pins else {}
        out.append({
            "id": f"xc:{code}:{d.affected_requirement_type or '-'}", "code": code, "severity": d.severity, "source": "CROSS_CHECK",
            "title": code.replace("_", " ").capitalize(), "detail": d.description,
            "document_id": first.get("document_id"), "category": first.get("category") or d.affected_requirement_type,
            "page": first.get("page"), "bbox": first.get("bbox"), "evidence": {"pins": pins, "score_impact": d.score_impact},
        })

    report = (db.query(ComplianceReport).filter(ComplianceReport.bidder_id == case.bidder_id, ComplianceReport.tender_id == case.tender_id)
              .order_by(ComplianceReport.created_at.desc()).first())
    if report:
        reqs = {r.id: r for r in db.query(Requirement).filter(Requirement.tender_id == case.tender_id)}
        for ev in db.query(RequirementEvaluation).filter(RequirementEvaluation.report_id == report.id):
            req = reqs.get(ev.requirement_id)
            if ev.status in ("FAILED", "PENDING") and req and req.is_mandatory:
                out.append({
                    "id": f"req:{ev.requirement_type}", "code": "REQUIREMENT_NOT_MET" if ev.status == "FAILED" else "REQUIREMENT_MISSING",
                    "severity": "HIGH", "source": "REQUIREMENT", "title": f"{ev.requirement_type.replace('_', ' ').title()} requirement not met",
                    "detail": ev.explanation or req.description, "document_id": None, "category": ev.requirement_type,
                    "page": None, "bbox": None, "evidence": {"requirement_id": ev.requirement_id, "status": ev.status},
                })

    intel = intel or analyse_tender(db, case.tender_id)
    for f in intel["per_bidder"].get(case.bidder_id, []):
        out.append({
            "id": f"cartel:{f['code']}", "code": f["code"], "severity": f["severity"], "source": "CARTEL",
            "title": f["code"].replace("_", " ").capitalize(), "detail": f["detail"],
            "document_id": None, "category": None, "page": None, "bbox": None, "evidence": {},
        })

    # The same fact can surface twice: a GSTIN checksum from the document and from the
    # cross-check, or "expired today" beside "expired at bid date". Keep the one with the evidence pin.
    doc_codes = {f["code"] for f in out if f["source"] == "DOCUMENT"}
    expired_at_bid = {f["document_id"] for f in out if f["code"] == "EXPIRED_AT_BID_DATE"}
    tender = db.query(Tender).filter(Tender.id == case.tender_id).first()
    required = {r.evidence_type for r in (tender.requirements if tender else [])}
    seen, unique = set(), []
    for f in out:
        if f["id"] in seen:
            continue
        if f["source"] == "CROSS_CHECK" and f["code"] in doc_codes:
            continue
        if f["code"] == "EXPIRED" and f["source"] == "DOCUMENT":
            if f["document_id"] in expired_at_bid:
                continue
            if f["category"] not in required:
                f = {**f, "severity": "LOW", "detail": f["detail"] + " This tender does not require this document."}
        seen.add(f["id"])
        unique.append(f)
    rel = rule_reliability(db)
    for f in unique:
        f["reliability"] = rel.get(f["code"], {"precision": 0.5, "reviewed": 0})
    order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2, "INFO": 3}
    unique.sort(key=lambda f: (order.get(f["severity"], 4), f["source"]))
    return unique


def _attach_dispositions(db: Session, case: BidCase, findings: list[dict]) -> list[dict]:
    disp = {d.finding_id: d for d in db.query(FindingDisposition).filter(FindingDisposition.case_id == case.id,
                                                                          FindingDisposition.superseded == False)}  # noqa: E712
    for f in findings:
        d = disp.get(f["id"])
        f["disposition"] = {"outcome": d.outcome, "note": d.note, "officer_id": d.officer_id,
                            "at": d.created_at.isoformat()} if d else None
    return findings


def recommend(fusion_verdict: str | None, findings: list[dict]) -> tuple[str, str]:
    """The fusion score averages modules, so one hard failure can hide behind
    good scores elsewhere. Hard evidence caps the recommendation."""
    unmet = [f for f in findings if f["code"] in ("REQUIREMENT_NOT_MET", "REQUIREMENT_MISSING")]
    high = [f for f in findings if f["severity"] == "HIGH"]
    if unmet:
        return "RECOMMEND_REJECTION", f"{len(unmet)} mandatory requirement(s) not met: " + ", ".join(f["category"] or "?" for f in unmet) + ". Ask for clarification before rejecting."
    if high:
        return "RECOMMEND_REVIEW", f"{len(high)} high finding(s) need an officer's ruling: " + ", ".join(sorted({f['code'] for f in high}))
    if fusion_verdict == "RECOMMEND_REJECTION":
        return "RECOMMEND_REVIEW", "Module scores are low but no single finding is high. Review the medium findings."
    return fusion_verdict or "RECOMMEND_REVIEW", "All mandatory requirements evidenced and no high findings."


def triage(findings: list[dict], value: float | None) -> tuple[str, float]:
    sev = {f["severity"] for f in findings}
    codes = {f["code"] for f in findings}
    if codes & (TAMPER_CODES | CARTEL_CODES) and "HIGH" in sev:
        lane = "ESCALATED"
    elif sev & {"HIGH", "MEDIUM"}:
        lane = "STANDARD"
    else:
        lane = "FAST_TRACK"
    score = sum(SEVERITY_POINTS.get(f["severity"], 0) * 2 * f["reliability"]["precision"] for f in findings)
    score *= 1 + (math.log10(value) / 10 if value and value > 1 else 0)
    return lane, round(score, 2)


def screen(db: Session, case: BidCase, actor: User | None = None) -> BidCase:
    run_full_verification(db, case.bidder_id, case.tender_id, actor=actor)
    try:
        fusion = run_bidmark_analysis(db, case.bidder_id, case.tender_id)
    except ValueError:
        fusion = None
    intel = analyse_tender(db, case.tender_id)
    findings = collect_findings(db, case, intel)
    tender = db.query(Tender).filter(Tender.id == case.tender_id).first()
    lane, priority = triage(findings, tender.estimated_value if tender else None)
    report = (db.query(ComplianceReport).filter(ComplianceReport.bidder_id == case.bidder_id, ComplianceReport.tender_id == case.tender_id)
              .order_by(ComplianceReport.created_at.desc()).first())

    case.findings = findings
    case.lane, case.priority = lane, priority
    case.screened_at = _now()
    case.sla_due_at = _now() + SLA[lane]
    case.ai_recommendation, rationale = recommend(fusion.fusion_verdict if fusion else None, findings)
    case.summary = {
        "compliance_score": report.overall_score if report else None,
        "compliance_risk": report.risk_level if report else None,
        "fusion_verdict": fusion.fusion_verdict if fusion else None,
        "fusion_confidence": fusion.fusion_confidence if fusion else None,
        "counts": {s: sum(1 for f in findings if f["severity"] == s) for s in ("HIGH", "MEDIUM", "LOW", "INFO")},
        "sources": {s: sum(1 for f in findings if f["source"] == s) for s in ("DOCUMENT", "CROSS_CHECK", "REQUIREMENT", "CARTEL")},
        "in_ring": any(f["code"] == "LINKED_BIDDER_RING" for f in findings),
        "recommendation_rationale": rationale,
    }
    log_action(db, action="CASE_SCREENED", actor=actor, entity_type="BidCase", entity_id=case.id, bidder_id=case.bidder_id,
               tender_id=case.tender_id, description=f"Screened: {lane}, {case.summary['counts']['HIGH']} high finding(s)",
               metadata={"lane": lane, "priority": priority, "counts": case.summary["counts"]}, commit=False)
    db.commit()
    _refresh_ring(db, case, intel, tender)
    if case.stage == "SUBMITTED":
        transition(db, case, "SCREENED", None)
    elif case.stage == "CLARIFICATION_RECEIVED":
        transition(db, case, "IN_REVIEW", None, "re-screened after bidder reply")
    db.refresh(case)
    return case


def _refresh_ring(db: Session, case: BidCase, intel: dict, tender: Tender | None) -> None:
    """A ring only becomes visible when its second member bids, after the first
    was already screened clean. Re-triage every open case the new links touch."""
    touched = {m for r in intel["rings"] if case.bidder_id in r["members"] for m in r["members"]} - {case.bidder_id}
    if not touched:
        return
    others = db.query(BidCase).filter(BidCase.tender_id == case.tender_id, BidCase.bidder_id.in_(touched),
                                      BidCase.stage.notin_(["DRAFT", "DECIDED", "WITHDRAWN"])).all()
    for other in others:
        before = other.lane
        other.findings = collect_findings(db, other, intel)
        other.lane, other.priority = triage(other.findings, tender.estimated_value if tender else None)
        summary = dict(other.summary or {})
        summary["counts"] = {s: sum(1 for f in other.findings if f["severity"] == s) for s in ("HIGH", "MEDIUM", "LOW", "INFO")}
        summary["in_ring"] = True
        other.ai_recommendation, summary["recommendation_rationale"] = recommend(summary.get("fusion_verdict"), other.findings)
        other.summary = summary
        if other.lane != before:
            other.sla_due_at = _now() + SLA[other.lane]
            log_action(db, action="CASE_RETRIAGED", entity_type="BidCase", entity_id=other.id, bidder_id=other.bidder_id,
                       tender_id=other.tender_id, description=f"{before} -> {other.lane}: linked to a bidder who submitted later",
                       metadata={"from": before, "to": other.lane, "trigger_case": case.id}, commit=False)
    db.commit()


def submit(db: Session, case: BidCase, actor: User) -> BidCase:
    if case.stage == "DRAFT":
        transition(db, case, "SUBMITTED", actor)
    if case.stage == "SUBMITTED":
        screen(db, case, actor)
    return case


def view(db: Session, case: BidCase) -> dict:
    findings = _attach_dispositions(db, case, [dict(f) for f in (case.findings or [])])
    open_high = [f["id"] for f in findings if f["severity"] == "HIGH" and not f["disposition"]]
    return {
        "id": case.id, "tender_id": case.tender_id, "bidder_id": case.bidder_id, "stage": case.stage, "lane": case.lane,
        "priority": case.priority, "assigned_officer_id": case.assigned_officer_id, "summary": case.summary or {},
        "findings": findings, "undisposed_high": open_high,
        "verification": verification_summary.for_case(db, case.bidder_id, case.tender_id, findings),
        "screened_at": case.screened_at.isoformat() if case.screened_at else None,
        "sla_due_at": _aware(case.sla_due_at).isoformat() if case.sla_due_at else None,
        "sla_breached": bool(case.sla_due_at and case.stage not in ("DECIDED", "WITHDRAWN") and _aware(case.sla_due_at) < _now()),
        "decision": case.decision, "decision_reason": case.decision_reason, "decided_by": case.decided_by,
        "decided_at": case.decided_at.isoformat() if case.decided_at else None,
        "ai_recommendation": case.ai_recommendation, "audit_anchor": case.audit_anchor,
        "allowed_transitions": sorted(TRANSITIONS.get(case.stage, {})),
        "clarifications": [clarification_view(c) for c in db.query(Clarification).filter(Clarification.case_id == case.id).order_by(Clarification.created_at)],
    }


def bidder_view(db: Session, case: BidCase) -> dict:
    """What the bidder sees. Forensic and cartel findings are withheld: telling a
    bidder which edit was spotted, or that they were linked to a competitor,
    only teaches the next attempt. They see requirements and questions."""
    tender = db.query(Tender).filter(Tender.id == case.tender_id).first()
    reqs = db.query(Requirement).filter(Requirement.tender_id == case.tender_id).all()
    have = {d.category for d in _documents(db, case)}
    missing = [r.evidence_type for r in reqs if r.is_mandatory and r.evidence_type not in have]
    clar = [clarification_view(c) for c in db.query(Clarification).filter(Clarification.case_id == case.id).order_by(Clarification.created_at)]
    public_stage = {"SCREENED": "UNDER_EVALUATION", "IN_REVIEW": "UNDER_EVALUATION", "CLARIFICATION_RECEIVED": "UNDER_EVALUATION"}.get(case.stage, case.stage)
    return {
        "id": case.id, "tender_id": case.tender_id, "tender_title": tender.title if tender else None,
        "stage": public_stage, "missing_documents": missing, "clarifications": clar,
        "open_clarifications": sum(1 for c in clar if c["status"] == "OPEN"),
        "decision": case.decision if case.stage == "DECIDED" else None,
        "decision_reason": case.decision_reason if case.stage == "DECIDED" else None,
        "next_action": next_action(case, UserRole.BIDDER, missing=missing, open_clar=sum(1 for c in clar if c["status"] == "OPEN")),
    }


def clarification_view(c: Clarification) -> dict:
    return {"id": c.id, "case_id": c.case_id, "finding_id": c.finding_id, "question": c.question,
            "requested_category": c.requested_category, "status": c.status,
            "due_at": _aware(c.due_at).isoformat() if c.due_at else None, "response_text": c.response_text,
            "response_document_id": c.response_document_id, "answered_at": c.answered_at.isoformat() if c.answered_at else None,
            "asked_at": c.created_at.isoformat()}


def next_action(case: BidCase, role, *, missing=None, open_clar=0, undisposed=0) -> dict:
    if role == UserRole.BIDDER:
        if case.stage == "DRAFT":
            if missing:
                return {"code": "UPLOAD_DOCUMENTS", "label": f"Upload {len(missing)} required document(s), then submit your bid"}
            return {"code": "SUBMIT_BID", "label": "Submit your bid"}
        if case.stage == "CLARIFICATION_REQUESTED":
            return {"code": "ANSWER_CLARIFICATION", "label": f"Answer {open_clar} clarification request(s)"}
        if case.stage == "DECIDED":
            return {"code": "VIEW_OUTCOME", "label": "View the outcome"}
        return {"code": "WAIT", "label": "Under evaluation. Nothing needed from you."}
    return {
        "DRAFT": {"code": "WAIT", "label": "Bidder has not submitted yet"},
        "SUBMITTED": {"code": "SCREEN", "label": "Run screening"},
        "SCREENED": {"code": "START_REVIEW", "label": "Start review"},
        "IN_REVIEW": {"code": "DISPOSE" if undisposed else "DECIDE",
                      "label": f"Rule on {undisposed} high finding(s), then decide" if undisposed else "Record the decision"},
        "CLARIFICATION_REQUESTED": {"code": "WAIT", "label": "Waiting for the bidder's reply"},
        "CLARIFICATION_RECEIVED": {"code": "REVIEW_REPLY", "label": "Bidder replied. Review the new evidence"},
        "DECIDED": {"code": "DONE", "label": "Decided"},
        "WITHDRAWN": {"code": "DONE", "label": "Withdrawn"},
    }[case.stage]


# ── officer actions ──────────────────────────────────────────────────────────

def start_review(db: Session, case: BidCase, officer: User) -> BidCase:
    if case.stage == "SCREENED":
        transition(db, case, "IN_REVIEW", officer)
    case.assigned_officer_id = case.assigned_officer_id or officer.id
    db.commit()
    return case


def dispose(db: Session, case: BidCase, officer: User, finding_id: str, outcome: str, note: str) -> FindingDisposition:
    if outcome not in ("UPHELD", "DISMISSED"):
        raise WorkflowError("VALIDATION_ERROR", "Outcome must be UPHELD or DISMISSED.", 422)
    finding = next((f for f in (case.findings or []) if f["id"] == finding_id), None)
    if not finding:
        raise WorkflowError("NOT_FOUND", "No such finding on this case.", 404)
    if outcome == "DISMISSED" and len(note.strip()) < 10:
        raise WorkflowError("NOTE_REQUIRED", "Dismissing a finding needs a note of at least 10 characters saying why.", 422)
    for old in db.query(FindingDisposition).filter(FindingDisposition.case_id == case.id, FindingDisposition.finding_id == finding_id,
                                                   FindingDisposition.superseded == False):  # noqa: E712
        old.superseded = True
    d = FindingDisposition(case_id=case.id, finding_id=finding_id, code=finding["code"], outcome=outcome, note=note, officer_id=officer.id)
    db.add(d)
    log_action(db, action="FINDING_DISPOSITION", actor=officer, entity_type="BidCase", entity_id=case.id, bidder_id=case.bidder_id,
               tender_id=case.tender_id, description=f"{outcome} {finding['code']}: {note}"[:500],
               metadata={"finding_id": finding_id, "code": finding["code"], "outcome": outcome, "severity": finding["severity"]}, commit=False)
    db.commit()
    return d


def request_clarification(db: Session, case: BidCase, officer: User, question: str, finding_id: str | None = None,
                          requested_category: str | None = None, due_days: int = 3) -> Clarification:
    if case.stage not in ("SCREENED", "IN_REVIEW", "CLARIFICATION_RECEIVED"):
        raise WorkflowError("INVALID_TRANSITION", f"Cannot ask for clarification while the case is {case.stage}.")
    c = Clarification(case_id=case.id, finding_id=finding_id, question=question, requested_category=requested_category,
                      asked_by=officer.id, due_at=_now() + timedelta(days=due_days))
    db.add(c)
    db.commit()
    transition(db, case, "CLARIFICATION_REQUESTED", officer, question[:120])
    notify(db, case.bidder_id, "CLARIFICATION_REQUESTED", "Clarification requested", question, tender_id=case.tender_id)
    return c


def answer_clarification(db: Session, c: Clarification, bidder_user: User, text: str, document_id: str | None) -> Clarification:
    case = db.query(BidCase).filter(BidCase.id == c.case_id).first()
    if c.status != "OPEN":
        raise WorkflowError("ALREADY_ANSWERED", "This clarification has already been answered.")
    if document_id:
        doc = db.query(Document).filter(Document.id == document_id, Document.bidder_id == case.bidder_id).first()
        if not doc:
            raise WorkflowError("NOT_FOUND", "Document not found for this bidder.", 404)
    c.status, c.response_text, c.response_document_id, c.answered_at = "ANSWERED", text, document_id, _now()
    log_action(db, action="CLARIFICATION_ANSWERED", actor=bidder_user, entity_type="Clarification", entity_id=c.id,
               bidder_id=case.bidder_id, tender_id=case.tender_id, description=text[:300], commit=False)
    db.commit()
    still_open = db.query(Clarification).filter(Clarification.case_id == case.id, Clarification.status == "OPEN").count()
    if not still_open and case.stage == "CLARIFICATION_REQUESTED":
        transition(db, case, "CLARIFICATION_RECEIVED", bidder_user)
        screen(db, case, None)
    return c


def decide(db: Session, case: BidCase, officer: User, decision: str, reason: str) -> BidCase:
    if decision not in ("QUALIFIED", "DISQUALIFIED"):
        raise WorkflowError("VALIDATION_ERROR", "Decision must be QUALIFIED or DISQUALIFIED.", 422)
    if case.stage not in DECIDABLE:
        raise WorkflowError("INVALID_TRANSITION", f"A case in {case.stage} cannot be decided.")
    if len(reason.strip()) < 10:
        raise WorkflowError("REASON_REQUIRED", "A decision needs a reason of at least 10 characters.", 422)
    v = view(db, case)
    if v["undisposed_high"]:
        raise WorkflowError("FINDINGS_UNRESOLVED",
                            f"{len(v['undisposed_high'])} high finding(s) still need a ruling (upheld or dismissed) before a decision.", 409)
    upheld_high = [f for f in v["findings"] if f["severity"] == "HIGH" and (f["disposition"] or {}).get("outcome") == "UPHELD"]
    against_ai = (decision == "QUALIFIED" and case.ai_recommendation == "RECOMMEND_REJECTION") or \
                 (decision == "DISQUALIFIED" and case.ai_recommendation == "RECOMMEND_APPROVAL")

    case.decision, case.decision_reason, case.decided_by, case.decided_at = decision, reason, officer.id, _now()
    db.add(OfficerDecision(bidder_id=case.bidder_id, tender_id=case.tender_id, officer_id=officer.id,
                           decision=decision, reason=reason, decided_at=case.decided_at))
    entry = log_action(db, action="FINAL_DECISION", actor=officer, entity_type="BidCase", entity_id=case.id,
                       bidder_id=case.bidder_id, tender_id=case.tender_id, description=f"{decision}: {reason}"[:500],
                       metadata={"decision": decision, "ai_recommendation": case.ai_recommendation, "against_ai": against_ai,
                                 "upheld_high": [f["code"] for f in upheld_high]}, commit=False)
    case.audit_anchor = entry.row_hash
    db.commit()
    transition(db, case, "DECIDED", officer)
    msg = ("Your bid has been marked as qualified for this tender." if decision == "QUALIFIED"
           else "Your bid was not qualified for this tender. The reason is shown on your case page.")
    notify(db, case.bidder_id, "TENDER_STATUS_CHANGED", "Bid status updated", msg, tender_id=case.tender_id)
    return case


def reopen(db: Session, case: BidCase, admin: User, reason: str) -> BidCase:
    if len(reason.strip()) < 10:
        raise WorkflowError("REASON_REQUIRED", "Reopening a decided case needs a reason.", 422)
    transition(db, case, "IN_REVIEW", admin, reason)
    case.decision = None
    db.commit()
    return case


def queue(db: Session, officer: User | None = None, tender_id: str | None = None) -> list[dict]:
    q = db.query(BidCase).filter(BidCase.stage.notin_(["DRAFT", "WITHDRAWN"]))
    if tender_id:
        q = q.filter(BidCase.tender_id == tender_id)
    cases = q.all()
    bidders = {b.id: b.company_name for b in db.query(Bidder).filter(Bidder.id.in_([c.bidder_id for c in cases]))} if cases else {}
    tenders = {t.id: t for t in db.query(Tender).filter(Tender.id.in_([c.tender_id for c in cases]))} if cases else {}
    disp = defaultdict(set)
    for d in db.query(FindingDisposition).filter(FindingDisposition.case_id.in_([c.id for c in cases]), FindingDisposition.superseded == False):  # noqa: E712
        disp[d.case_id].add(d.finding_id)
    rows = []
    for c in cases:
        undisposed = sum(1 for f in (c.findings or []) if f["severity"] == "HIGH" and f["id"] not in disp[c.id])
        rows.append({
            "case_id": c.id, "tender_id": c.tender_id, "tender_number": tenders[c.tender_id].tender_number if c.tender_id in tenders else None,
            "tender_title": tenders[c.tender_id].title if c.tender_id in tenders else None,
            "bidder_id": c.bidder_id, "bidder_name": bidders.get(c.bidder_id), "stage": c.stage, "lane": c.lane,
            "priority": c.priority, "counts": (c.summary or {}).get("counts", {}), "in_ring": (c.summary or {}).get("in_ring", False),
            "ai_recommendation": c.ai_recommendation, "decision": c.decision, "assigned_officer_id": c.assigned_officer_id,
            "sla_due_at": _aware(c.sla_due_at).isoformat() if c.sla_due_at else None,
            "sla_breached": bool(c.sla_due_at and c.stage != "DECIDED" and _aware(c.sla_due_at) < _now()),
            "next_action": next_action(c, UserRole.PROCUREMENT_OFFICER, undisposed=undisposed),
        })
    lane_rank = {"ESCALATED": 0, "STANDARD": 1, "FAST_TRACK": 2, None: 3}
    rows.sort(key=lambda r: (r["stage"] == "DECIDED", lane_rank.get(r["lane"], 3), -r["priority"]))
    return rows
