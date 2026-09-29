from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_officer
from app.engines.fingerprint_engine import compare_bidder_documents_across_tender, compare_documents, generate_fingerprint
from app.engines.forensics_engine import analyze_document
from app.models.document import Document
from app.models.forensics import FingerprintComparison
from app.models.user import User
from app.schemas.forensics import CompareRequest, DocumentFingerprintOut, FingerprintComparisonOut, ForensicAnalysisOut
from app.services.audit_service import log_action
from app.utils.responses import success

router = APIRouter(prefix="/api/v1/forensics", tags=["Forensics"])


def _get_doc(db: Session, document_id: str) -> Document:
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.post("/analyze/{document_id}")
def analyze(document_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    doc = _get_doc(db, document_id)
    analysis = analyze_document(db, doc)
    log_action(
        db, action="AI_ANALYSIS", actor=current_user, entity_type="ForensicAnalysis", entity_id=analysis.id,
        bidder_id=doc.bidder_id, description=f"Forensic analysis run on document {document_id}: risk={analysis.risk_level}",
    )
    return success(ForensicAnalysisOut.model_validate(analysis).model_dump(), "Forensic analysis completed")


@router.post("/fingerprint/{document_id}")
def fingerprint(document_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    doc = _get_doc(db, document_id)
    fp = generate_fingerprint(db, doc)
    log_action(db, action="AI_ANALYSIS", actor=current_user, entity_type="DocumentFingerprint", entity_id=fp.id, bidder_id=doc.bidder_id, description=f"Document fingerprint generated for {document_id}")
    return success(DocumentFingerprintOut.model_validate(fp).model_dump(), "Document fingerprint generated")


@router.post("/compare")
def compare(payload: CompareRequest, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    doc_a = _get_doc(db, payload.document_id_a)
    doc_b = _get_doc(db, payload.document_id_b)
    comparison = compare_documents(db, doc_a, doc_b)
    log_action(
        db, action="AI_ANALYSIS", actor=current_user, entity_type="FingerprintComparison", entity_id=comparison.id,
        description=f"Document similarity compared: {comparison.similarity_score} ({comparison.level})",
    )
    return success(FingerprintComparisonOut.model_validate(comparison).model_dump(), "Document comparison completed")


@router.get("/compare/tender/{tender_id}")
def compare_tender(tender_id: str, min_score: float = 0.6, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    results = compare_bidder_documents_across_tender(db, tender_id, min_score)
    return success([FingerprintComparisonOut.model_validate(r).model_dump() for r in results], "Cross-bidder document similarity scan completed")


@router.get("/document/{document_id}")
def get_document_forensics(document_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_officer)):
    doc = _get_doc(db, document_id)
    out = {}
    if doc.forensic_analysis:
        out["forensic_analysis"] = ForensicAnalysisOut.model_validate(doc.forensic_analysis).model_dump()
    if doc.fingerprint:
        out["fingerprint"] = DocumentFingerprintOut.model_validate(doc.fingerprint).model_dump()
    comparisons = (
        db.query(FingerprintComparison)
        .filter((FingerprintComparison.document_a_id == document_id) | (FingerprintComparison.document_b_id == document_id))
        .all()
    )
    out["comparisons"] = [FingerprintComparisonOut.model_validate(c).model_dump() for c in comparisons]
    return success(out, "Document forensics retrieved")
