"""
Complete Automated Verification Workflow — chains every engine in the
platform into one call, exactly as specified in section 33 of the PS brief:

  Load bidder -> Load tender -> Load requirements -> Load documents
  -> OCR/extraction -> Document verification -> Government mock verification
  -> Cross-document verification -> Requirement evaluation -> Compliance score
  -> Digital forensics -> Document fingerprinting -> Behavioral analysis
  -> Cross-bidder analysis -> Risk calculation -> AI recommendation
  -> Generate report -> Write audit trail
"""
from sqlalchemy.orm import Session

from app.engines.behavioral_engine import analyze_behavior
from app.engines.compliance_engine import evaluate_compliance
from app.engines.cross_bidder_graph_engine import build_relationship_graph
from app.engines.cross_check_engine import run_cross_check
from app.engines.fingerprint_engine import compare_bidder_documents_across_tender, generate_fingerprint
from app.engines.forensics_engine import analyze_document
from app.engines.red_flag_cascade import build_red_flag_cascade
from app.models.bidder import Bidder
from app.models.document import Document
from app.models.tender import Tender
from app.models.user import User
from app.services.audit_service import log_action
from app.services.document_service import extract_document, verify_document
from app.services.recommendation_service import build_recommendation


def run_full_verification(db: Session, bidder_id: str, tender_id: str, actor: User | None = None) -> dict:
    bidder = db.query(Bidder).filter(Bidder.id == bidder_id).first()
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not bidder or not tender:
        raise ValueError("Bidder or Tender not found")

    log_action(db, action="WORKFLOW_STARTED", actor=actor, entity_type="Bidder", entity_id=bidder_id, bidder_id=bidder_id, tender_id=tender_id, description=f"Automated verification workflow started for {bidder.company_name} on {tender.title}")

    documents = db.query(Document).filter(Document.bidder_id == bidder_id, Document.is_deleted == False).all()  # noqa: E712

    # 1. OCR/extraction + document verification for every document on file
    document_results = []
    for doc in documents:
        extract_document(db, doc)
        vr = verify_document(db, doc)
        analyze_document(db, doc)
        generate_fingerprint(db, doc)
        document_results.append({"document_id": doc.id, "category": doc.category, "verification_status": vr.status})
    log_action(db, action="OCR_EXTRACTION", actor=actor, bidder_id=bidder_id, tender_id=tender_id, description=f"OCR/extraction + verification run on {len(documents)} document(s)")

    # 2. Cross-document verification
    cross_check_result = run_cross_check(db, bidder_id, tender_id)
    log_action(db, action="CROSS_DOCUMENT_VERIFICATION", actor=actor, bidder_id=bidder_id, tender_id=tender_id, description=f"{len(cross_check_result['discrepancies'])} discrepancy(ies) found")

    # 3. Compliance evaluation + explainable score
    report = evaluate_compliance(db, bidder_id, tender_id)
    log_action(db, action="SCORE_CHANGE", actor=actor, entity_type="ComplianceReport", entity_id=report.id, bidder_id=bidder_id, tender_id=tender_id, description=f"Compliance score: {report.overall_score} ({report.risk_level})")

    # 4. Document DNA cross-bidder similarity scan (tender-wide)
    similarity_hits = compare_bidder_documents_across_tender(db, tender_id)

    # 5. Behavioral risk intelligence
    behavior_report = analyze_behavior(db, bidder_id, tender_id)
    log_action(db, action="AI_ANALYSIS", actor=actor, entity_type="BehavioralRiskReport", entity_id=behavior_report.id, bidder_id=bidder_id, tender_id=tender_id, description=f"Behavioral risk: {behavior_report.behavioral_risk_score} ({behavior_report.risk_level})")

    # 6. Cross-bidder relationship graph (tender-wide context)
    graph = build_relationship_graph(db, tender_id)

    # 7. Red flag cascade (explainability chain)
    cascade = build_red_flag_cascade(db, bidder_id, tender_id)

    # 8. AI recommendation (never a final decision)
    recommendation = build_recommendation(db, bidder_id, tender_id)
    log_action(db, action="AI_ANALYSIS", actor=actor, bidder_id=bidder_id, tender_id=tender_id, description=f"AI recommendation: {recommendation['recommendation']} (confidence {recommendation['confidence']})")

    log_action(db, action="WORKFLOW_COMPLETED", actor=actor, bidder_id=bidder_id, tender_id=tender_id, description="Automated verification workflow completed")

    return {
        "bidder_id": bidder_id,
        "tender_id": tender_id,
        "documents": document_results,
        "cross_check": {
            "checks": len(cross_check_result["cross_checks"]),
            "discrepancies": [{"category": d.category, "description": d.description, "severity": d.severity} for d in cross_check_result["discrepancies"]],
        },
        "compliance_report": {
            "overall_score": report.overall_score, "risk_level": report.risk_level,
            "verified_count": report.verified_count, "failed_count": report.failed_count,
            "pending_count": report.pending_count, "requires_review_count": report.requires_review_count,
            "critical_issues": report.critical_issues,
        },
        "document_similarity_hits": len(similarity_hits),
        "behavioral_risk": {"score": behavior_report.behavioral_risk_score, "risk_level": behavior_report.risk_level, "flag_count": len(behavior_report.flags)},
        "cross_bidder_graph_edges": len(graph["edges"]),
        "red_flag_cascade": cascade,
        "ai_recommendation": recommendation,
    }
