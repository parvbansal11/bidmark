"""
Cross-Bidder Intelligence Graph (USP 4). Builds a node/edge graph for a
tender: the tender itself, every participating bidder, and edges wherever a
relationship signal exists. Bidder-to-bidder links come from the cartel
engine (device, network, author, director, contact, address, identical files,
timing); document similarity comes from the fingerprint engine. Consumed directly by the frontend's relationship
graph visualization.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.engines.cartel_engine import analyse_tender
from app.models.bidder import Bidder
from app.models.forensics import FingerprintComparison
from app.models.tender import Tender, TenderBidder


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

    intel = analyse_tender(db, tender_id)
    ring_of = {m: i for i, r in enumerate(intel["rings"]) for m in r["members"]}
    for n in nodes:
        if n["type"] == "BIDDER":
            bid_id = n["id"].split(":", 1)[1]
            n["ring"] = ring_of.get(bid_id)
            n["flags"] = [f["code"] for f in intel["per_bidder"].get(bid_id, [])]
    for l in intel["links"]:
        edges.append({"source": f"bidder:{l['a']}", "target": f"bidder:{l['b']}", "type": l["type"],
                      "evidence": l["detail"], "weight": l["weight"]})

    comparisons = (
        db.query(FingerprintComparison)
        .filter(FingerprintComparison.bidder_a_id.in_(bidder_ids), FingerprintComparison.bidder_b_id.in_(bidder_ids))
        .filter(FingerprintComparison.level.in_(["HIGH", "MEDIUM"]))
        .all()
    )
    for c in comparisons:
        if c.bidder_a_id == c.bidder_b_id:
            continue
        edges.append({
            "source": f"bidder:{c.bidder_a_id}", "target": f"bidder:{c.bidder_b_id}", "type": "DOCUMENT_SIMILARITY",
            "evidence": f"Document similarity {round(c.similarity_score*100,1)}% ({c.level})", "weight": round(c.similarity_score, 2),
        })

    return {
        "tender_id": tender_id,
        "nodes": nodes,
        "edges": edges,
        "rings": [{k: v for k, v in r.items() if k != "links"} for r in intel["rings"]],
        "price_screens": intel["price_screens"],
        "disclaimer": "Relationships shown are signals for further review only and do not establish collusion, fraud or misconduct.",
    }
