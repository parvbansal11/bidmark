"""
Cross-Bidder Intelligence Graph (USP 4). Builds a node/edge graph for a
tender: the tender itself, every participating bidder, and edges wherever a
relationship signal exists (shared address, document similarity, overlapping
directors, similar pricing). Consumed directly by the frontend's relationship
graph visualization.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.bid import BidSubmission
from app.models.bidder import Bidder
from app.models.document import Document
from app.models.forensics import FingerprintComparison
from app.models.tender import Tender, TenderBidder
from app.models.verification import VerificationResult


def _normalize_addr(addr: str | None) -> str:
    return "".join(addr.lower().split()) if addr else ""


def build_relationship_graph(db: Session, tender_id: str) -> dict:
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise ValueError("Tender not found")

    links = db.query(TenderBidder).filter(TenderBidder.tender_id == tender_id).all()
    bidder_ids = [l.bidder_id for l in links]
    bidders = db.query(Bidder).filter(Bidder.id.in_(bidder_ids)).all() if bidder_ids else []

    nodes = [{"id": f"tender:{tender.id}", "type": "TENDER", "label": tender.title}]
    for b in bidders:
        nodes.append({"id": f"bidder:{b.id}", "type": "BIDDER", "label": b.company_name})

    edges = []
    for b in bidders:
        edges.append({"source": f"tender:{tender.id}", "target": f"bidder:{b.id}", "type": "PARTICIPATES_IN", "evidence": "Invited/participating bidder", "weight": 1})

    # Shared address
    seen_pairs = set()
    for i in range(len(bidders)):
        for j in range(i + 1, len(bidders)):
            a, b = bidders[i], bidders[j]
            if _normalize_addr(a.registered_address) and _normalize_addr(a.registered_address) == _normalize_addr(b.registered_address):
                edges.append({"source": f"bidder:{a.id}", "target": f"bidder:{b.id}", "type": "SAME_ADDRESS", "evidence": "Registered address matches", "weight": 2})

    # Document similarity
    comparisons = (
        db.query(FingerprintComparison)
        .filter(FingerprintComparison.bidder_a_id.in_(bidder_ids), FingerprintComparison.bidder_b_id.in_(bidder_ids))
        .filter(FingerprintComparison.level.in_(["HIGH", "MEDIUM"]))
        .all()
    )
    for c in comparisons:
        edges.append({
            "source": f"bidder:{c.bidder_a_id}", "target": f"bidder:{c.bidder_b_id}", "type": "DOCUMENT_SIMILARITY",
            "evidence": f"Document similarity {round(c.similarity_score*100,1)}% ({c.level})", "weight": round(c.similarity_score, 2),
        })

    # Overlapping directors via MCA mock verification details
    director_map: dict[str, set[str]] = {}
    for b in bidders:
        docs = db.query(Document).filter(Document.bidder_id == b.id, Document.category == "MCA", Document.is_deleted == False).all()  # noqa: E712
        directors: set[str] = set()
        for d in docs:
            vr = db.query(VerificationResult).filter(VerificationResult.document_id == d.id).order_by(VerificationResult.created_at.desc()).first()
            if vr and vr.details.get("directors"):
                directors.update(vr.details["directors"])
        director_map[b.id] = directors
    for i in range(len(bidders)):
        for j in range(i + 1, len(bidders)):
            a, b = bidders[i], bidders[j]
            overlap = director_map.get(a.id, set()) & director_map.get(b.id, set())
            if overlap:
                edges.append({"source": f"bidder:{a.id}", "target": f"bidder:{b.id}", "type": "SHARED_DIRECTOR", "evidence": f"Shared director(s): {', '.join(list(overlap)[:3])}", "weight": 2})

    # Similar pricing
    bids = {b.bidder_id: b for b in db.query(BidSubmission).filter(BidSubmission.tender_id == tender_id).all()}
    ids_with_price = [bid_id for bid_id, b in bids.items() if b.quoted_price]
    for i in range(len(ids_with_price)):
        for j in range(i + 1, len(ids_with_price)):
            a_id, b_id = ids_with_price[i], ids_with_price[j]
            pa, pb = bids[a_id].quoted_price, bids[b_id].quoted_price
            if pa and abs(pa - pb) / max(pa, 1) < 0.01:
                edges.append({"source": f"bidder:{a_id}", "target": f"bidder:{b_id}", "type": "SIMILAR_PRICING", "evidence": "Quoted price within 1%", "weight": 1})

    # Submission timing similarity
    ids_with_time = [bid_id for bid_id, b in bids.items() if b.submitted_at]
    for i in range(len(ids_with_time)):
        for j in range(i + 1, len(ids_with_time)):
            a_id, b_id = ids_with_time[i], ids_with_time[j]
            ta, tb = bids[a_id].submitted_at, bids[b_id].submitted_at
            if abs((ta - tb).total_seconds()) <= 300:
                edges.append({"source": f"bidder:{a_id}", "target": f"bidder:{b_id}", "type": "SYNCHRONIZED_SUBMISSION", "evidence": "Submitted within 5 minutes of each other", "weight": 1})

    return {
        "tender_id": tender_id,
        "nodes": nodes,
        "edges": edges,
        "disclaimer": "Relationships shown are signals for further review only and do not establish collusion, fraud or misconduct.",
    }
