"""
Bidder Portal service, the translation layer between internal engine output
(compliance evaluations, discrepancies, verification results, officer
decisions) and the bidder-facing portal.

Hard rule enforced throughout this module: nothing that reaches a bidder may
contain raw engine/AI language, confidence scores, forensic or behavioral
signals, or any reference to another bidder. Internal findings are always
re-worded into plain, actionable, non-technical language before being
returned. Example (from spec): internal "GSTIN mismatch detected." becomes
"Your GST information requires correction. Please review your GSTIN and
uploaded certificate."
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.bid import BidSubmission
from app.models.bidder import Bidder
from app.models.compliance import ComplianceReport, RequirementEvaluation
from app.models.decision import OfficerDecision
from app.models.document import Document
from app.models.tender import Requirement, Tender, TenderBidder
from app.models.user import User, UserRole
from app.services import notification_service

CATEGORY_GROUPS = {
    "GST": "STATUTORY", "PAN": "STATUTORY", "MCA": "STATUTORY", "INCOME_TAX": "STATUTORY",
    "EPFO": "STATUTORY", "ESIC": "STATUTORY", "DIGILOCKER": "STATUTORY",
    "UDYAM": "ELIGIBILITY", "NSIC": "ELIGIBILITY", "STARTUP_INDIA": "ELIGIBILITY", "DEBARMENT": "ELIGIBILITY",
    "OEM_AUTHORIZATION": "OEM_AUTHORIZATION",
    "LOCAL_CONTENT": "LOCAL_CONTENT",
    "TURNOVER": "FINANCIAL", "FINANCIAL": "FINANCIAL",
}
CATEGORY_LABELS = {
    "STATUTORY": "Statutory Compliance",
    "FINANCIAL": "Financial Compliance",
    "ELIGIBILITY": "Eligibility",
    "OEM_AUTHORIZATION": "OEM Authorization",
    "LOCAL_CONTENT": "Make in India / Local Content",
    "TECHNICAL": "Technical Documents",
}

LABEL_OVERRIDES = {
    "GST": "GST Registration", "PAN": "PAN", "UDYAM": "Udyam Certificate", "INCOME_TAX": "ITR / Income Tax Filing",
    "MCA": "MCA Incorporation Record", "STARTUP_INDIA": "Startup India Recognition", "NSIC": "NSIC Registration",
    "EPFO": "EPFO Registration", "ESIC": "ESIC Registration", "OEM_AUTHORIZATION": "OEM Authorization",
    "LOCAL_CONTENT": "Make in India / Local Content Declaration", "EXPERIENCE_CERTIFICATE": "Experience Certificate",
    "FINANCIAL": "Financial Statement", "TURNOVER": "Turnover Declaration", "DEBARMENT": "Debarment Check",
    "DIGILOCKER": "DigiLocker Record", "OTHER": "Supporting Document",
}


def _label(category: str) -> str:
    return LABEL_OVERRIDES.get(category, category.replace("_", " ").title())


def get_own_bidder(db: Session, user: User) -> Bidder:
    if user.role != UserRole.BIDDER:
        raise ValueError("Only bidder accounts have a bidder portal")
    bidder = db.query(Bidder).filter(Bidder.user_id == user.id).first()
    if not bidder:
        raise ValueError("No bidder profile is linked to this account")
    return bidder


def _tz(dt) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _latest_report(db: Session, bidder_id: str, tender_id: str) -> Optional[ComplianceReport]:
    return (
        db.query(ComplianceReport)
        .filter(ComplianceReport.bidder_id == bidder_id, ComplianceReport.tender_id == tender_id)
        .order_by(ComplianceReport.created_at.desc())
        .first()
    )


def _linked_tender_ids(db: Session, bidder_id: str) -> set[str]:
    return {l.tender_id for l in db.query(TenderBidder).filter(TenderBidder.bidder_id == bidder_id).all()}


def _participating_tenders(db: Session, bidder_id: str) -> list[Tender]:
    """Tenders visible to this bidder in "My Tenders".

    Discovery model (mirrors how GeM open tendering actually works):
      - OPEN_TENDER tenders that have been published (status != DRAFT) are
        visible to every bidder automatically, no invitation needed.
      - LIMITED_TENDER / SINGLE_TENDER tenders are only visible to a bidder
        once an Officer/Admin has explicitly linked them (via
        POST /api/v1/tenders/{id}/bidders/{bidder_id}), or once the bidder
        has otherwise engaged with it (see ensure_enrolled below).
      - DRAFT tenders are never visible to a bidder, linked or not.

    This gives "eligible bidder" concrete meaning without inventing a
    category/eligibility model the rest of the app doesn't have.
    """
    linked_ids = _linked_tender_ids(db, bidder_id)
    open_ids = {
        t.id for t in db.query(Tender.id, Tender.tender_type, Tender.status)
        .filter(Tender.status != "DRAFT", Tender.tender_type == "OPEN_TENDER")
        .all()
    }
    all_ids = linked_ids | open_ids
    if not all_ids:
        return []
    return db.query(Tender).filter(Tender.id.in_(all_ids)).order_by(Tender.deadline.asc()).all()


def is_tender_visible(db: Session, bidder_id: str, tender: Tender) -> bool:
    if tender.status == "DRAFT":
        return tender.id in _linked_tender_ids(db, bidder_id)
    if tender.tender_type == "OPEN_TENDER":
        return True
    return tender.id in _linked_tender_ids(db, bidder_id)


def ensure_enrolled(db: Session, bidder: Bidder, tender: Tender) -> None:
    """Lazily record that a bidder has engaged with a tender they're allowed
    to see (opened its detail/compliance view, uploaded a document against
    it, or submitted a bid). This creates the TenderBidder participation
    link the Officer-facing Tender Dashboard and Bidder 360 view key off of,
    so an Officer can find and review this bidder under that tender without
    needing to have manually "added" them first for an open tender."""
    if not is_tender_visible(db, bidder.id, tender):
        return
    existing = db.query(TenderBidder).filter(TenderBidder.tender_id == tender.id, TenderBidder.bidder_id == bidder.id).first()
    if not existing:
        db.add(TenderBidder(tender_id=tender.id, bidder_id=bidder.id, invited_at=datetime.now(timezone.utc)))
        db.commit()


def _document_counts_for_tender(db: Session, bidder_id: str, tender_id: str) -> dict:
    reqs = db.query(Requirement).filter(Requirement.tender_id == tender_id).all()
    required_types = {r.requirement_type for r in reqs}
    docs = (
        db.query(Document)
        .filter(Document.bidder_id == bidder_id, Document.is_deleted == False)  # noqa: E712
        .filter((Document.tender_id == tender_id) | (Document.tender_id.is_(None)))
        .all()
    )
    submitted_types = {d.category for d in docs}
    return {
        "required": len(required_types),
        "submitted": len(required_types & submitted_types),
    }


def tender_summary(db: Session, bidder: Bidder, tender: Tender) -> dict:
    report = _latest_report(db, bidder.id, tender.id)
    doc_counts = _document_counts_for_tender(db, bidder.id, tender.id)
    bid = db.query(BidSubmission).filter(BidSubmission.bidder_id == bidder.id, BidSubmission.tender_id == tender.id).first()
    now = datetime.now(timezone.utc)
    deadline = _tz(tender.deadline)
    bidder_status = tender.status
    if bid and bid.status == "SUBMITTED":
        bidder_status = "SUBMITTED"
    elif deadline and now > deadline and (not bid or bid.status != "SUBMITTED"):
        bidder_status = "CLOSED"
    return {
        "tender_id": tender.id,
        "title": tender.title,
        "tender_number": tender.tender_number,
        "gem_tender_id": tender.gem_tender_id,
        "organization": tender.organization,
        "department": tender.department,
        "deadline": tender.deadline,
        "published_at": tender.published_at,
        "status": tender.status,
        "bid_status": bidder_status,
        "compliance_percent": report.overall_score if report else None,
        "documents_required": doc_counts["required"],
        "documents_submitted": doc_counts["submitted"],
        "bid_submitted": bool(bid and bid.status == "SUBMITTED"),
    }


def list_my_tenders(db: Session, bidder: Bidder, status_filter: Optional[str] = None) -> list[dict]:
    tenders = _participating_tenders(db, bidder.id)
    summaries = [tender_summary(db, bidder, t) for t in tenders]
    if status_filter and status_filter != "ALL":
        summaries = [s for s in summaries if s["bid_status"] == status_filter or s["status"] == status_filter]
    return summaries


# ---------------------------------------------------------------------------
# Documents ("My Documents" vault)
# ---------------------------------------------------------------------------

DOC_STATUS_DISPLAY = {
    "VERIFIED": "VERIFIED",
    "UPLOADED": "PENDING_REVIEW",
    "EXTRACTED": "PENDING_REVIEW",
    "FAILED": "ACTION_REQUIRED",
    "MISSING_INFORMATION": "ACTION_REQUIRED",
    "REQUIRES_REVIEW": "PENDING_REVIEW",
    "EXPIRED": "ACTION_REQUIRED",
}


def list_my_documents(db: Session, bidder: Bidder) -> list[dict]:
    docs = (
        db.query(Document)
        .filter(Document.bidder_id == bidder.id, Document.is_deleted == False)  # noqa: E712
        .order_by(Document.created_at.desc())
        .all()
    )
    out = []
    now = datetime.now(timezone.utc)
    for d in docs:
        display_status = DOC_STATUS_DISPLAY.get(d.status, "PENDING_REVIEW")
        validity = getattr(d.extraction, "validity_date", None) if d.extraction else None
        if display_status == "VERIFIED" and validity:
            try:
                validity_dt = datetime.fromisoformat(validity).replace(tzinfo=timezone.utc)
                if 0 <= (validity_dt - now).days <= notification_service.DOCUMENT_VALIDITY_WARNING_DAYS:
                    display_status = "EXPIRING_SOON"
            except (ValueError, TypeError):
                pass
        out.append({
            "id": d.id,
            "category": d.category,
            "label": _label(d.category),
            "original_filename": d.original_filename,
            "uploaded_at": d.uploaded_at,
            "validity_date": validity,
            "status": display_status,
            "tender_id": d.tender_id,
            "reusable": display_status == "VERIFIED",
        })
    return out


# ---------------------------------------------------------------------------
# Compliance Status
# ---------------------------------------------------------------------------

def _category_status_from_percent(percent: Optional[float]) -> str:
    if percent is None:
        return "PENDING_VERIFICATION"
    if percent >= 90:
        return "COMPLIANT"
    if percent >= 50:
        return "PARTIALLY_COMPLIANT"
    if percent > 0:
        return "MISSING"
    return "MISSING"


def compliance_status(db: Session, bidder: Bidder) -> dict:
    tenders = _participating_tenders(db, bidder.id)
    category_totals: dict[str, list[float]] = {}
    tender_scores = []
    for t in tenders:
        report = _latest_report(db, bidder.id, t.id)
        if not report:
            tender_scores.append({"tender_id": t.id, "title": t.title, "overall_score": None, "risk_level": None})
            continue
        tender_scores.append({"tender_id": t.id, "title": t.title, "overall_score": report.overall_score, "risk_level": report.risk_level})
        for ev in report.requirement_evaluations:
            group = CATEGORY_GROUPS.get(ev.requirement_type, "TECHNICAL")
            category_totals.setdefault(group, [0.0, 0.0])
            if ev.max_score_contribution > 0:
                category_totals[group][0] += ev.score_contribution
                category_totals[group][1] += ev.max_score_contribution

    categories = []
    for group, label in CATEGORY_LABELS.items():
        achieved, maximum = category_totals.get(group, [0.0, 0.0])
        percent = round(100 * achieved / maximum) if maximum > 0 else None
        categories.append({"category": group, "label": label, "percent": percent, "status": _category_status_from_percent(percent)})

    overall_scores = [s["overall_score"] for s in tender_scores if s["overall_score"] is not None]
    overall = round(sum(overall_scores) / len(overall_scores)) if overall_scores else None

    return {
        "overall_compliance_percent": overall,
        "categories": categories,
        "tenders": tender_scores,
    }


def compliance_detail_for_tender(db: Session, bidder: Bidder, tender_id: str) -> dict:
    report = _latest_report(db, bidder.id, tender_id)
    if not report:
        return {"tender_id": tender_id, "overall_score": None, "risk_level": None, "requirements": []}
    requirements = [
        {
            "requirement_type": ev.requirement_type,
            "label": _label(ev.requirement_type),
            "status": ev.status,
            "explanation": ev.explanation,
            "score_contribution": ev.score_contribution,
            "max_score_contribution": ev.max_score_contribution,
        }
        for ev in report.requirement_evaluations
    ]
    return {
        "tender_id": tender_id,
        "overall_score": report.overall_score,
        "risk_level": report.risk_level,
        "requirements": requirements,
    }


# ---------------------------------------------------------------------------
# Action Required, the core translation layer
# ---------------------------------------------------------------------------

def _translate_requirement_issue(ev: RequirementEvaluation, is_mandatory: bool, tender: Tender) -> Optional[dict]:
    label = _label(ev.requirement_type)
    discrepancy_text = " ".join(ev.discrepancies or []).lower()

    if ev.status == "PENDING":
        return {
            "priority": "CRITICAL" if is_mandatory else "NEEDS_ATTENTION",
            "title": f"Upload missing {label}",
            "description": f"{label} has not been submitted yet for '{tender.title}'.",
            "action": "UPLOAD",
            "category": ev.requirement_type,
            "tender_id": tender.id,
        }
    if ev.status == "FAILED":
        if "expired" in discrepancy_text or "validity" in discrepancy_text:
            title, desc, action = f"Replace expired {label}", f"Your {label} has expired and needs to be replaced with a current copy.", "REPLACE"
        elif "mismatch" in discrepancy_text or "variation" in discrepancy_text or "does not closely match" in discrepancy_text:
            title, desc, action = f"Correct {label} information mismatch", f"Your {label} information requires correction. Please review the details and your uploaded certificate.", "CORRECT"
        else:
            title, desc, action = f"Resolve {label} issue", f"Your {label} did not pass verification. Please review and re-upload a corrected document.", "REPLACE"
        return {
            "priority": "CRITICAL" if is_mandatory else "NEEDS_ATTENTION",
            "title": title, "description": desc, "action": action,
            "category": ev.requirement_type, "tender_id": tender.id,
        }
    if ev.status == "REQUIRES_REVIEW":
        return {
            "priority": "NEEDS_ATTENTION",
            "title": f"{label} under review",
            "description": f"Your {label} has been flagged for manual review by the procurement team. No action may be needed, but please ensure the document is clear and complete.",
            "action": "REVIEW",
            "category": ev.requirement_type, "tender_id": tender.id,
        }
    return None


def action_items(db: Session, bidder: Bidder) -> dict:
    tenders = _participating_tenders(db, bidder.id)
    critical, needs_attention, completed = [], [], []
    req_cache: dict[str, dict[str, Requirement]] = {}

    for t in tenders:
        report = _latest_report(db, bidder.id, t.id)
        if not report:
            continue
        if t.id not in req_cache:
            reqs = db.query(Requirement).filter(Requirement.tender_id == t.id).all()
            req_cache[t.id] = {r.requirement_type: r for r in reqs}
        reqs_by_type = req_cache[t.id]

        for ev in report.requirement_evaluations:
            req = reqs_by_type.get(ev.requirement_type)
            is_mandatory = req.is_mandatory if req else True
            if ev.status == "VERIFIED":
                completed.append({"title": f"{_label(ev.requirement_type)} verified", "tender_id": t.id, "tender_title": t.title})
                continue
            item = _translate_requirement_issue(ev, is_mandatory, t)
            if not item:
                continue
            item["tender_title"] = t.title
            if item["priority"] == "CRITICAL":
                critical.append(item)
            else:
                needs_attention.append(item)

    return {"critical": critical, "needs_attention": needs_attention, "completed": completed}


# ---------------------------------------------------------------------------
# Submissions
# ---------------------------------------------------------------------------

def submissions(db: Session, bidder: Bidder) -> list[dict]:
    tenders = _participating_tenders(db, bidder.id)
    out = []
    now = datetime.now(timezone.utc)
    for t in tenders:
        bid = db.query(BidSubmission).filter(BidSubmission.bidder_id == bidder.id, BidSubmission.tender_id == t.id).first()
        if not bid:
            continue
        doc_count = (
            db.query(Document)
            .filter(Document.bidder_id == bidder.id, Document.is_deleted == False)  # noqa: E712
            .filter((Document.tender_id == t.id) | (Document.tender_id.is_(None)))
            .count()
        )
        report = _latest_report(db, bidder.id, t.id)
        decision = (
            db.query(OfficerDecision)
            .filter(OfficerDecision.bidder_id == bidder.id, OfficerDecision.tender_id == t.id)
            .order_by(OfficerDecision.created_at.desc())
            .first()
        )
        deadline = _tz(t.deadline)
        read_only = bool(deadline and now > deadline)
        out.append({
            "tender_id": t.id,
            "tender_title": t.title,
            "technical_bid_status": "SUBMITTED" if bid.status == "SUBMITTED" else bid.status,
            "financial_bid_status": "SUBMITTED" if bid.quoted_price is not None and bid.status == "SUBMITTED" else "NOT_APPLICABLE",
            "documents_submitted": doc_count,
            "submitted_at": bid.submitted_at,
            "compliance_at_submission": report.overall_score if report else None,
            "evaluation_status": decision.decision if decision else "AWAITING_REVIEW",
            "read_only": read_only,
        })
    return out


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

def dashboard(db: Session, bidder: Bidder) -> dict:
    tenders = _participating_tenders(db, bidder.id)
    active_tenders = [t for t in tenders if t.status == "ACTIVE"]
    tender_summaries = [tender_summary(db, bidder, t) for t in active_tenders[:5]]

    docs = db.query(Document).filter(Document.bidder_id == bidder.id, Document.is_deleted == False).count()  # noqa: E712
    scores = [s["compliance_percent"] for s in (tender_summary(db, bidder, t) for t in tenders) if s["compliance_percent"] is not None]
    overall_compliance = round(sum(scores) / len(scores)) if scores else None

    items = action_items(db, bidder)
    actions_required_count = len(items["critical"]) + len(items["needs_attention"])

    notification_service.sync_derived_notifications(db, bidder.id)
    from app.models.notification import Notification

    recent_notifications = (
        db.query(Notification)
        .filter(Notification.bidder_id == bidder.id)
        .order_by(Notification.created_at.desc())
        .limit(5)
        .all()
    )

    welcome_name = bidder.user.full_name if bidder.user else bidder.company_name

    return {
        "welcome_name": welcome_name,
        "summary": {
            "active_tenders": len(active_tenders),
            "documents_submitted": docs,
            "overall_compliance_percent": overall_compliance,
            "actions_required": actions_required_count,
        },
        "action_required": (items["critical"] + items["needs_attention"])[:5],
        "my_tenders": tender_summaries,
        "recent_notifications": [
            {"id": n.id, "type": n.type, "title": n.title, "message": n.message, "is_read": n.is_read, "created_at": n.created_at}
            for n in recent_notifications
        ],
    }
