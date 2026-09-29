"""Evidence for the review screen: what was read from a document and where.

Page images are rendered server side so the frontend only has to draw boxes
over a PNG. Every bbox is in PDF points, origin top left; scale by
image_width / page_width.
"""
import io
import os

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import enforce_bidder_scope, get_current_user, require_oversight
from app.engines.cartel_engine import analyse_tender
from app.forensics.text import IMAGE_EXT
from app.models.document import Document
from app.models.tender import Tender
from app.models.user import User
from app.services.case_service import rule_reliability
from app.utils.responses import success

router = APIRouter(tags=["Evidence"])


def _doc(db: Session, document_id: str, user: User) -> Document:
    doc = db.query(Document).filter(Document.id == document_id, Document.is_deleted == False).first()  # noqa: E712
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    enforce_bidder_scope(user, doc.bidder_id, db)
    return doc


@router.get("/api/v1/documents/{document_id}/evidence")
def document_evidence(document_id: str, db: Session = Depends(get_db), user: User = Depends(require_oversight)):
    doc = _doc(db, document_id, user)
    raw = (doc.extraction.raw_extracted_fields if doc.extraction else None) or {}
    insp = raw.get("inspection") or {}
    ext = insp.get("extraction") or {}
    fa = doc.forensic_analysis
    return success({
        "document": {"id": doc.id, "category": doc.category, "filename": doc.original_filename, "mime_type": doc.mime_type,
                     "sha256": doc.file_hash_sha256, "size_bytes": doc.file_size_bytes, "status": doc.status},
        "simulated": bool(raw.get("simulated")),
        "readable": insp.get("readable"),
        "method": ext.get("method"),
        "detected_type": ext.get("detected_type"),
        "pages": ext.get("pages") or 1,
        "page_sizes": ext.get("page_sizes") or [],
        "fields": raw.get("evidence") or ext.get("fields") or {},
        "signals": fa.signals if fa else insp.get("signals", []),
        "checks": fa.checks if fa and fa.checks else insp.get("checks", []),
        "structure": fa.structure if fa and fa.structure else insp.get("structure", {}),
        "risk": {"score": fa.forensic_risk_score, "level": fa.risk_level} if fa else None,
        "page_image_url": f"/api/v1/documents/{doc.id}/pages/{{page}}.png",
    }, "Document evidence")


@router.get("/api/v1/documents/{document_id}/pages/{page}.png")
def page_image(document_id: str, page: int, scale: float = Query(2.0, ge=0.5, le=4.0),
               db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    doc = _doc(db, document_id, user)
    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="File missing on server")
    ext = os.path.splitext(doc.file_path)[1].lower()
    if ext in IMAGE_EXT:
        from PIL import Image

        buf = io.BytesIO()
        Image.open(doc.file_path).convert("RGB").save(buf, "PNG")
        return Response(buf.getvalue(), media_type="image/png")
    if ext != ".pdf":
        raise HTTPException(status_code=415, detail="No page image for this file type")
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(doc.file_path)
    if not 1 <= page <= len(pdf):
        raise HTTPException(status_code=404, detail="No such page")
    img = pdf[page - 1].render(scale=scale).to_pil()
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return Response(buf.getvalue(), media_type="image/png", headers={"Cache-Control": "private, max-age=3600"})


@router.get("/api/v1/tenders/{tender_id}/intelligence")
def tender_intelligence(tender_id: str, db: Session = Depends(get_db), user: User = Depends(require_oversight)):
    if not db.query(Tender).filter(Tender.id == tender_id).first():
        raise HTTPException(status_code=404, detail="Tender not found")
    return success(analyse_tender(db, tender_id), "Tender intelligence")


@router.get("/api/v1/rules/reliability")
def reliability(db: Session = Depends(get_db), user: User = Depends(require_oversight)):
    rows = [{"code": k, **v} for k, v in rule_reliability(db).items()]
    rows.sort(key=lambda r: (-r["reviewed"], r["code"]))
    return success(rows, "How often officers uphold each rule")
