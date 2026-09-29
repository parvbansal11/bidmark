"""
Behavioral Risk Intelligence engine (USP 3). Looks for company-level and
cross-bidder *patterns* that deserve human review, never proof of
wrongdoing. Every flag is confidence-scored and marked
requires_human_review=True; nothing here calls a bidder fraudulent,
collusive, or guilty.

Configurable rule weights (see PS spec section 46):
  Submission anomaly        +10
  Document similarity       +20
  Address relationship      +15
  Pricing anomaly           +10
  Lifecycle anomaly         +10
  Repeated historical issue +15
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models.bid import BidSubmission
from app.models.bidder import Bidder
from app.models.behavior import BehavioralFlag, BehavioralRiskReport
from app.models.forensics import FingerprintComparison, ForensicAnalysis
from app.models.tender import Tender
from app.models.verification import Discrepancy
from app.models.document import Document

WEIGHTS = {
    "SUBMISSION_TIMING": 10,
    "DOCUMENT_BEHAVIOR": 10,
    "CROSS_BIDDER_SIMILARITY": 20,
    "CROSS_BIDDER_ADDRESS": 15,
    "CROSS_BIDDER_DIRECTOR": 15,
    "PRICING_ANOMALY": 10,
    "LIFECYCLE": 10,
    "HISTORICAL": 15,
}


def _normalize_addr(addr: str | None) -> str:
    if not addr:
        return ""
    return "".join(addr.lower().split())


def analyze_behavior(db: Session, bidder_id: str, tender_id: str) -> BehavioralRiskReport:
    bidder = db.query(Bidder).filter(Bidder.id == bidder_id).first()
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not bidder or not tender:
        raise ValueError("Bidder or Tender not found")

    flags: list[dict[str, Any]] = []

    def add_flag(category: str, indicator: str, evidence: str, confidence: str, weight_key: str):
        flags.append({
            "category": category,
            "indicator": indicator,
            "evidence": evidence,
            "confidence": confidence,
            "score_impact": WEIGHTS[weight_key],
            "requires_human_review": True,
        })

    bid = db.query(BidSubmission).filter(BidSubmission.bidder_id == bidder_id, BidSubmission.tender_id == tender_id).first()

    # --- 1. Submission timing ---
    if bid and bid.submitted_at:
        if tender.published_at:
            gap = bid.submitted_at - tender.published_at
            if timedelta(0) <= gap <= timedelta(hours=2):
                add_flag("SUBMISSION_TIMING", "Unusually fast submission after tender publication",
                          f"Bid submitted {gap} after the tender was published, far faster than a typical preparation cycle.",
                          "medium", "SUBMISSION_TIMING")
        if tender.deadline:
            to_deadline = tender.deadline - bid.submitted_at
            if timedelta(0) <= to_deadline <= timedelta(minutes=15):
                add_flag("SUBMISSION_TIMING", "Last-minute submission just before deadline",
                          f"Bid submitted only {to_deadline} before the tender deadline.",
                          "low", "SUBMISSION_TIMING")

        other_bids = (
            db.query(BidSubmission)
            .filter(BidSubmission.tender_id == tender_id, BidSubmission.bidder_id != bidder_id, BidSubmission.submitted_at.isnot(None))
            .all()
        )
        clustered = [b for b in other_bids if abs((b.submitted_at - bid.submitted_at).total_seconds()) <= 300]
        if clustered:
            add_flag("SUBMISSION_TIMING", "Synchronized submission pattern with other bidders",
                      f"Submitted within 5 minutes of {len(clustered)} other bidder(s) on the same tender.",
                      "low", "SUBMISSION_TIMING")

    # --- 2. Document behavior (draws on existing forensic evidence) ---
    doc_ids = [d.id for d in db.query(Document).filter(Document.bidder_id == bidder_id, Document.is_deleted == False).all()]  # noqa: E712
    if doc_ids:
        forensic_reports = db.query(ForensicAnalysis).filter(ForensicAnalysis.document_id.in_(doc_ids)).all()
        edited = [f for f in forensic_reports if any(s.get("type") in ("FIELD_FONT_OUTLIER", "OVERLAPPING_TEXT", "MODIFIED_AFTER_SIGNING", "SIGNATURE_BROKEN") for s in f.signals)]
        if edited:
            add_flag("DOCUMENT_BEHAVIOR", "Documents edited after issue",
                      f"{len(edited)} document(s) show values typed over the original or changes after signing.",
                      "high", "DOCUMENT_BEHAVIOR")
        metadata_hits = [f for f in forensic_reports if any(s.get("type") in ("TIMESTAMP_INVERSION", "EDITOR_TOOL") for s in f.signals)]
        if metadata_hits:
            add_flag("DOCUMENT_BEHAVIOR", "Documents re-saved in an editor",
                      f"{len(metadata_hits)} document(s) were last written by an editing tool or carry inverted timestamps.",
                      "medium", "DOCUMENT_BEHAVIOR")

    # --- 3. Cross-bidder intelligence ---
    comparisons = (
        db.query(FingerprintComparison)
        .filter(((FingerprintComparison.bidder_a_id == bidder_id) | (FingerprintComparison.bidder_b_id == bidder_id)))
        .filter(FingerprintComparison.level.in_(["HIGH", "MEDIUM"]))
        .all()
    )
    if comparisons:
        other_ids = {c.bidder_b_id if c.bidder_a_id == bidder_id else c.bidder_a_id for c in comparisons}
        add_flag("CROSS_BIDDER", "High document similarity with other bidder(s)",
                  f"Document similarity of {round(max(c.similarity_score for c in comparisons)*100,1)}% found with {len(other_ids)} other bidder(s) on shared-category documents.",
                  "medium", "CROSS_BIDDER_SIMILARITY")

    if bidder.registered_address:
        norm = _normalize_addr(bidder.registered_address)
        other_bidders = db.query(Bidder).filter(Bidder.id != bidder_id).all()
        same_address = [b for b in other_bidders if _normalize_addr(b.registered_address) == norm and norm]
        if same_address:
            add_flag("CROSS_BIDDER", "Shared registered address with other bidder(s)",
                      f"Registered address matches {len(same_address)} other bidder(s) in the system.",
                      "medium", "CROSS_BIDDER_ADDRESS")

    # Overlapping directors (drawn from MCA mock verification details, if present)
    from app.models.verification import VerificationResult

    my_mca_docs = db.query(Document).filter(Document.bidder_id == bidder_id, Document.category == "MCA", Document.is_deleted == False).all()  # noqa: E712
    my_directors: set[str] = set()
    for d in my_mca_docs:
        vr = db.query(VerificationResult).filter(VerificationResult.document_id == d.id).order_by(VerificationResult.created_at.desc()).first()
        if vr and vr.details.get("directors"):
            my_directors.update(vr.details["directors"])
    if my_directors:
        other_mca_docs = db.query(Document).filter(Document.category == "MCA", Document.bidder_id != bidder_id, Document.is_deleted == False).all()  # noqa: E712
        overlap_bidders = set()
        for d in other_mca_docs:
            vr = db.query(VerificationResult).filter(VerificationResult.document_id == d.id).order_by(VerificationResult.created_at.desc()).first()
            if vr and vr.details.get("directors") and set(vr.details["directors"]) & my_directors:
                overlap_bidders.add(d.bidder_id)
        if overlap_bidders:
            add_flag("CROSS_BIDDER", "Overlapping director/signatory names with other bidder(s)",
                      f"Director name overlap found with {len(overlap_bidders)} other bidder(s) per mock MCA records.",
                      "low", "CROSS_BIDDER_DIRECTOR")

    if bid and bid.quoted_price:
        other_bids_priced = (
            db.query(BidSubmission)
            .filter(BidSubmission.tender_id == tender_id, BidSubmission.bidder_id != bidder_id, BidSubmission.quoted_price.isnot(None))
            .all()
        )
        close = [b for b in other_bids_priced if b.quoted_price and abs(b.quoted_price - bid.quoted_price) / max(bid.quoted_price, 1) < 0.01]
        if close:
            add_flag("CROSS_BIDDER", "Suspiciously close pricing with other bidder(s)",
                      f"Quoted price is within 1% of {len(close)} other bidder(s) on the same tender.",
                      "medium", "PRICING_ANOMALY")

    # --- 4. Company lifecycle ---
    if bidder.incorporation_date and tender.published_at:
        days_before = (tender.published_at.date() - bidder.incorporation_date).days
        if 0 <= days_before <= 180:
            add_flag("LIFECYCLE", "Company incorporated shortly before this high-value tender",
                      f"Bidder was incorporated {days_before} day(s) before the tender was published.",
                      "medium", "LIFECYCLE")

    # --- 5. Historical behavior (across the bidder's full history, not just this tender) ---
    high_discrepancies = db.query(Discrepancy).filter(Discrepancy.bidder_id == bidder_id, Discrepancy.severity == "HIGH").count()
    if high_discrepancies >= 2:
        add_flag("HISTORICAL", "Recurring high-severity discrepancies across submissions",
                  f"{high_discrepancies} high-severity discrepancies on record for this bidder across all tenders.",
                  "medium", "HISTORICAL")

    withdrawn = db.query(BidSubmission).filter(BidSubmission.bidder_id == bidder_id, BidSubmission.status == "WITHDRAWN").count()
    if withdrawn >= 2:
        add_flag("HISTORICAL", "Repeated bid withdrawal pattern",
                  f"Bidder has withdrawn {withdrawn} bid(s) historically.",
                  "low", "HISTORICAL")

    total_bids = db.query(BidSubmission).filter(BidSubmission.bidder_id == bidder_id).count()
    if total_bids >= 5:
        add_flag("HISTORICAL", "Frequent bidding without winning (possible pattern requiring review)",
                  f"Bidder has submitted {total_bids} bids historically; win/qualification pattern should be reviewed manually.",
                  "low", "HISTORICAL")

    score = min(100, sum(f["score_impact"] for f in flags))
    if score >= 55:
        risk_level = "HIGH"
    elif score >= 25:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    old_report = (
        db.query(BehavioralRiskReport)
        .filter(BehavioralRiskReport.bidder_id == bidder_id, BehavioralRiskReport.tender_id == tender_id)
        .first()
    )
    if old_report:
        db.delete(old_report)
        db.commit()

    report = BehavioralRiskReport(
        bidder_id=bidder_id, tender_id=tender_id, behavioral_risk_score=score,
        risk_level=risk_level, requires_human_review=score > 0,
    )
    db.add(report)
    db.flush()
    for f in flags:
        db.add(BehavioralFlag(bidder_id=bidder_id, tender_id=tender_id, report_id=report.id, **f))
    db.commit()
    db.refresh(report)
    return report
