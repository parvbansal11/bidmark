"""
What-If Compliance Simulator (USP 6). Lets a Procurement Officer temporarily
change tender rules (e.g. raise the local-content threshold) and see the
resulting impact on every bidder's compliance score, risk level, and ranking
- without ever writing to the actual tender/requirement rows. Pure read +
in-memory recompute.
"""
from __future__ import annotations

from types import SimpleNamespace

from sqlalchemy.orm import Session

from app.engines.compliance_engine import (
    DOC_BACKED_TYPES,
    _evaluate_custom,
    _evaluate_debarment,
    _evaluate_document_backed,
    _evaluate_local_content,
    _evaluate_turnover,
    _score_band,
)
from app.models.bidder import Bidder
from app.models.compliance import ComplianceReport
from app.models.tender import Requirement, Tender, TenderBidder


def _evaluate_one(db: Session, bidder: Bidder, tender_id: str, req) -> tuple[str, list, str]:
    if req.requirement_type in DOC_BACKED_TYPES:
        return _evaluate_document_backed(db, bidder, req)
    if req.requirement_type == "DEBARMENT":
        return _evaluate_debarment(db, bidder, req)
    if req.requirement_type == "TURNOVER":
        return _evaluate_turnover(db, bidder, tender_id, req)
    if req.requirement_type == "LOCAL_CONTENT":
        return _evaluate_local_content(db, bidder, tender_id, req)
    return _evaluate_custom(req)


def simulate(db: Session, tender_id: str, overrides: list[dict], bidder_ids: list[str] | None = None) -> dict:
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise ValueError("Tender not found")

    requirements = db.query(Requirement).filter(Requirement.tender_id == tender_id).all()
    if not requirements:
        raise ValueError("Tender has no requirements defined")
    override_map = {o["requirement_id"]: o for o in overrides}

    if not bidder_ids:
        links = db.query(TenderBidder).filter(TenderBidder.tender_id == tender_id).all()
        bidder_ids = [l.bidder_id for l in links]

    bidder_results = []
    for bidder_id in bidder_ids:
        bidder = db.query(Bidder).filter(Bidder.id == bidder_id).first()
        if not bidder:
            continue

        baseline_report = (
            db.query(ComplianceReport)
            .filter(ComplianceReport.bidder_id == bidder_id, ComplianceReport.tender_id == tender_id)
            .order_by(ComplianceReport.created_at.desc())
            .first()
        )

        total_weight = 0.0
        achieved = 0.0
        failed_types = []
        per_requirement = []

        for req in requirements:
            ov = override_map.get(req.id, {})
            sim_req = SimpleNamespace(
                id=req.id,
                requirement_type=req.requirement_type,
                is_mandatory=ov.get("is_mandatory", req.is_mandatory),
                threshold=ov.get("threshold", req.threshold),
                threshold_unit=req.threshold_unit,
                weight=ov.get("weight", req.weight),
                description=req.description,
            )
            status, evidence, explanation = _evaluate_one(db, bidder, tender_id, sim_req)

            max_contribution = sim_req.weight if sim_req.is_mandatory else sim_req.weight * 0.5
            if status == "NOT_APPLICABLE":
                contribution, max_contribution = 0.0, 0.0
            elif status == "VERIFIED":
                contribution = max_contribution
            elif status == "REQUIRES_REVIEW":
                contribution = max_contribution * 0.5
            else:
                contribution = 0.0

            if status != "NOT_APPLICABLE":
                total_weight += max_contribution
                achieved += contribution
            if status == "FAILED" and sim_req.is_mandatory:
                failed_types.append(sim_req.requirement_type)

            per_requirement.append({
                "requirement_type": sim_req.requirement_type,
                "status": status,
                "threshold_used": sim_req.threshold,
                "explanation": explanation,
            })

        simulated_score = round((achieved / total_weight * 100) if total_weight > 0 else 0.0, 1)
        simulated_risk = _score_band(simulated_score)

        bidder_results.append({
            "bidder_id": bidder_id,
            "company_name": bidder.company_name,
            "baseline_score": baseline_report.overall_score if baseline_report else None,
            "baseline_risk_level": baseline_report.risk_level if baseline_report else None,
            "simulated_score": simulated_score,
            "simulated_risk_level": simulated_risk,
            "score_delta": round(simulated_score - baseline_report.overall_score, 1) if baseline_report else None,
            "failed_requirements": failed_types,
            "requirement_details": per_requirement,
        })

    ranked = sorted(bidder_results, key=lambda r: r["simulated_score"], reverse=True)
    for i, r in enumerate(ranked):
        r["simulated_rank"] = i + 1

    return {
        "tender_id": tender_id,
        "overrides_applied": overrides,
        "note": "This is a simulation only. No tender or requirement data has been modified.",
        "bidders": ranked,
    }
