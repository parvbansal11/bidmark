"""
BIDMARK Verification API, three-module verification architecture.

POST /api/v1/bidmark/analyse/{bidder_id}/{tender_id}
  Runs (or re-runs) the full BIDMARK analysis.  Procurement Officer / Admin only.

GET  /api/v1/bidmark/result/{bidder_id}/{tender_id}
  Returns the latest BIDMARK analysis result.
  Officers/Admins receive the full detail; Bidders receive the simplified
  portal-friendly summary.

GET  /api/v1/bidmark/summary/{tender_id}
  Returns a compact verdict summary for every bidder enrolled on a tender
  (for the PO overview table).  Officer / Admin only.
"""
from fastapi import APIRouter, HTTPException
from fastapi.params import Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import enforce_bidder_scope, get_current_user, require_officer
from app.engines.bidmark_engine import run_bidmark_analysis
from app.models.bidder import Bidder
from app.models.bidmark import BidmarkAnalysis
from app.models.tender import TenderBidder
from app.models.user import User, UserRole
from app.schemas.bidmark import BidmarkAnalysisOut, BidmarkSummaryOut
from app.services.audit_service import log_action
from app.utils.responses import success

router = APIRouter(prefix="/api/v1/bidmark", tags=["BIDMARK Verification"])

# ── verdict → bidder-friendly translation ────────────────────────────────────

_ENTITY_LABEL = {
    "VERIFIED": "Confirmed",
    "NEEDS_REVIEW": "Needs Attention",
    "FLAGGED": "Issue Detected",
}
_COMPLIANCE_LABEL = {
    "VERIFIED": "Compliant",
    "NEEDS_REVIEW": "Some Items Flagged",
    "FLAGGED": "Risk Indicators Detected",
}
_DOCUMENT_LABEL = {
    "VERIFIED": "All Documents Clear",
    "NEEDS_REVIEW": "Documents Under Review",
    "FLAGGED": "Document Issues Detected",
}
_FUSION_TO_STATUS = {
    "RECOMMEND_APPROVAL": "Looking Good",
    "RECOMMEND_REVIEW": "Some Items Need Attention",
    "RECOMMEND_REJECTION": "Action Required",
}
_FUSION_TO_MESSAGE = {
    "RECOMMEND_APPROVAL": (
        "Your verification is progressing well. All major checks have passed. "
        "The Procurement Officer will review your submission and notify you of the outcome."
    ),
    "RECOMMEND_REVIEW": (
        "Your submission is under review. Some items need attention, please check the "
        "action items below and upload any missing or corrected documents."
    ),
    "RECOMMEND_REJECTION": (
        "Your submission has issues that need to be resolved before it can be approved. "
        "Please address all action items below and contact the Procurement Officer if you have questions."
    ),
}


def _to_bidder_summary(analysis: BidmarkAnalysis) -> BidmarkSummaryOut:
    """Convert an internal BidmarkAnalysis into a Bidder-friendly summary."""
    action_items: list[dict] = []
    for flag in (analysis.explainable_flags or []):
        if flag.get("severity") in ("HIGH", "MEDIUM"):
            # Translate to friendly language, no internal module names
            friendly_title = flag["flag"].replace("Cross-Module Inconsistency, ", "").replace("Cross-Module Contradiction: ", "")
            action_items.append({
                "title": friendly_title,
                "description": flag.get("what_to_review", "Please review and correct this item."),
                "priority": "URGENT" if flag.get("severity") == "HIGH" else "ATTENTION",
            })

    return BidmarkSummaryOut(
        entity_status=_ENTITY_LABEL.get(analysis.entity_verdict, "Pending"),
        compliance_status=_COMPLIANCE_LABEL.get(analysis.compliance_verdict, "Pending"),
        document_status=_DOCUMENT_LABEL.get(analysis.document_verdict, "Pending"),
        overall_status=_FUSION_TO_STATUS.get(analysis.fusion_verdict, "Under Review"),
        overall_message=_FUSION_TO_MESSAGE.get(analysis.fusion_verdict, "Your verification is in progress."),
        action_items=action_items,
        completed_at=analysis.completed_at,
    )


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.post("/analyse/{bidder_id}/{tender_id}", response_model=None)
def analyse(
    bidder_id: str,
    tender_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_officer),
):
    """
    Run (or re-run) the full BIDMARK three-module analysis.
    Procurement Officer and Admin only.
    Typically called after uploading documents or running the full workflow.
    """
    try:
        result = run_bidmark_analysis(db, bidder_id, tender_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    log_action(
        db,
        action="BIDMARK_ANALYSIS",
        actor=current_user,
        entity_type="BidmarkAnalysis",
        entity_id=result.id,
        bidder_id=bidder_id,
        tender_id=tender_id,
        description=(
            f"BIDMARK analysis run, Entity: {result.entity_verdict}, "
            f"Compliance: {result.compliance_verdict}, "
            f"Document: {result.document_verdict}, "
            f"Fusion: {result.fusion_verdict}"
        ),
    )

    return success(
        BidmarkAnalysisOut.model_validate(result).model_dump(),
        "BIDMARK analysis completed",
    )


@router.get("/result/{bidder_id}/{tender_id}", response_model=None)
def get_result(
    bidder_id: str,
    tender_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return the latest BIDMARK analysis for a (bidder, tender) pair.
    • Officer / Admin → full detail with all three verdicts, flags, consent audit
    • Bidder → simplified portal-friendly summary (no internal module names)
    """
    # Bidders may only view their own analysis
    enforce_bidder_scope(current_user, bidder_id, db)

    analysis = (
        db.query(BidmarkAnalysis)
        .filter(
            BidmarkAnalysis.bidder_id == bidder_id,
            BidmarkAnalysis.tender_id == tender_id,
        )
        .order_by(BidmarkAnalysis.created_at.desc())
        .first()
    )
    if not analysis:
        raise HTTPException(
            status_code=404,
            detail="No BIDMARK analysis found. Run /bidmark/analyse first.",
        )

    if current_user.role == UserRole.BIDDER:
        return success(_to_bidder_summary(analysis).model_dump(), "BIDMARK status retrieved")

    return success(
        BidmarkAnalysisOut.model_validate(analysis).model_dump(),
        "BIDMARK analysis retrieved",
    )


@router.get("/summary/{tender_id}", response_model=None)
def tender_summary(
    tender_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_officer),
):
    """
    Compact verdict summary for all bidders on a tender.
    Intended for the Procurement Officer overview table.
    """
    # Get all bidders enrolled on this tender
    rows = (
        db.query(TenderBidder)
        .filter(TenderBidder.tender_id == tender_id)
        .all()
    )
    bidder_ids = [r.bidder_id for r in rows]

    analyses = (
        db.query(BidmarkAnalysis)
        .filter(
            BidmarkAnalysis.tender_id == tender_id,
            BidmarkAnalysis.bidder_id.in_(bidder_ids),
        )
        .all()
    )
    analysis_map = {a.bidder_id: a for a in analyses}

    result = []
    for bidder_id in bidder_ids:
        bidder = db.query(Bidder).filter(Bidder.id == bidder_id).first()
        if not bidder:
            continue
        a = analysis_map.get(bidder_id)
        result.append({
            "bidder_id": bidder_id,
            "company_name": bidder.company_name,
            "entity_verdict": a.entity_verdict if a else None,
            "compliance_verdict": a.compliance_verdict if a else None,
            "document_verdict": a.document_verdict if a else None,
            "fusion_verdict": a.fusion_verdict if a else None,
            "fusion_confidence": a.fusion_confidence if a else None,
            "flag_count": len(a.explainable_flags or []) if a else None,
            "analysed": a is not None,
            "completed_at": a.completed_at.isoformat() if a and a.completed_at else None,
        })

    return success(result, f"{len(result)} bidder(s) on this tender")
