import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import enforce_bidder_scope, get_current_user
from app.models.bidder import Bidder
from app.models.document import Document
from app.models.tender import Tender
from app.models.user import User, UserRole
from app.schemas.document import DocumentExtractionOut, DocumentOut, VerificationResultOut
from app.services import bidder_portal_service as portal
from app.services import telemetry_service as telemetry
from app.services.audit_service import log_action
from app.services.document_service import extract_document, save_document, verify_document
from app.services.notification_service import notify
from app.utils.constants import ALLOWED_UPLOAD_EXTENSIONS, DOCUMENT_CATEGORIES
from app.utils.responses import ApiError, success

router = APIRouter(tags=["Documents"])

MAX_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


@router.post("/api/v1/bidders/{bidder_id}/documents")
def upload_document(
    bidder_id: str,
    request: Request,
    category: str = Form(...),
    tender_id: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enforce_bidder_scope(current_user, bidder_id, db)
    if category not in DOCUMENT_CATEGORIES:
        raise ApiError("VALIDATION_ERROR", f"Invalid document category. Must be one of {DOCUMENT_CATEGORIES}", status_code=422)

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise ApiError("INVALID_FILE_TYPE", f"File type '{ext}' not allowed. Allowed: {sorted(ALLOWED_UPLOAD_EXTENSIONS)}", status_code=422)

    peek = file.file.read(MAX_BYTES + 1)
    file.file.seek(0)
    if len(peek) > MAX_BYTES:
        raise ApiError("FILE_TOO_LARGE", f"File exceeds max size of {settings.MAX_UPLOAD_SIZE_MB}MB", status_code=413)

    if tender_id and current_user.role == UserRole.BIDDER:
        tender = db.query(Tender).filter(Tender.id == tender_id).first()
        if not tender:
            raise HTTPException(status_code=404, detail="Tender not found")
        if not portal.is_tender_visible(db, bidder_id, tender):
            raise HTTPException(status_code=403, detail="You are not eligible to upload documents against this tender")
        bidder = db.query(Bidder).filter(Bidder.id == bidder_id).first()
        if bidder:
            portal.ensure_enrolled(db, bidder, tender)

    document = save_document(db, bidder_id, category, file, tender_id)
    if current_user.role == UserRole.BIDDER:
        telemetry.record(db, request, "DOCUMENT_UPLOAD", user_id=current_user.id, bidder_id=bidder_id, tender_id=tender_id)
    log_action(
        db, action="DOCUMENT_UPLOAD", actor=current_user, entity_type="Document", entity_id=document.id,
        bidder_id=bidder_id, tender_id=tender_id, description=f"Uploaded {category} document: {document.original_filename}",
    )
    return success(DocumentOut.model_validate(document).model_dump(), "Document uploaded")


@router.get("/api/v1/bidders/{bidder_id}/documents")
def list_bidder_documents(bidder_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    enforce_bidder_scope(current_user, bidder_id, db)
    docs = db.query(Document).filter(Document.bidder_id == bidder_id, Document.is_deleted == False).order_by(Document.created_at.desc()).all()  # noqa: E712
    return success([DocumentOut.model_validate(d).model_dump() for d in docs], "Documents retrieved")


@router.get("/api/v1/documents/{document_id}")
def get_document(document_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    enforce_bidder_scope(current_user, doc.bidder_id, db)
    out = DocumentOut.model_validate(doc).model_dump()
    if doc.extraction:
        out["extraction"] = DocumentExtractionOut.model_validate(doc.extraction).model_dump()
    out["verification_results"] = [VerificationResultOut.model_validate(v).model_dump() for v in doc.verification_results]
    return success(out, "Document retrieved")


@router.get("/api/v1/documents/{document_id}/file")
def download_document_file(document_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Serve the underlying uploaded file for in-browser preview (PDF/image)
    or download. Same RBAC boundary as every other document route: a Bidder
    may only ever fetch their own files; Officers/Admin may fetch any."""
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc or doc.is_deleted:
        raise HTTPException(status_code=404, detail="Document not found")
    enforce_bidder_scope(current_user, doc.bidder_id, db)
    if not doc.file_path or not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="The stored file could not be found on the server")
    log_action(db, action="DOCUMENT_VIEWED", actor=current_user, entity_type="Document", entity_id=document_id, bidder_id=doc.bidder_id, description=f"Viewed/downloaded {doc.original_filename}")
    return FileResponse(doc.file_path, media_type=doc.mime_type, filename=doc.original_filename, content_disposition_type="inline")


@router.delete("/api/v1/documents/{document_id}")
def delete_document(document_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    enforce_bidder_scope(current_user, doc.bidder_id, db)
    doc.is_deleted = True
    db.commit()
    log_action(db, action="DOCUMENT_DELETED", actor=current_user, entity_type="Document", entity_id=document_id, bidder_id=doc.bidder_id, description=f"Deleted document {doc.original_filename}")
    return success({"id": document_id}, "Document deleted")


@router.post("/api/v1/documents/{document_id}/extract")
def extract_document_route(document_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    enforce_bidder_scope(current_user, doc.bidder_id, db)
    extraction = extract_document(db, doc)
    log_action(db, action="OCR_EXTRACTION", actor=current_user, entity_type="Document", entity_id=document_id, bidder_id=doc.bidder_id, description=f"OCR/extraction run via {extraction.extraction_provider}")
    return success(DocumentExtractionOut.model_validate(extraction).model_dump(), "Document extraction completed")


@router.post("/api/v1/documents/{document_id}/verify")
def verify_document_route(document_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    enforce_bidder_scope(current_user, doc.bidder_id, db)
    result = verify_document(db, doc)
    log_action(db, action="DOCUMENT_VERIFICATION", actor=current_user, entity_type="Document", entity_id=document_id, bidder_id=doc.bidder_id, description=f"Document verification -> {result.status}")

    label = doc.category.replace("_", " ").title()
    if result.status == "VERIFIED":
        notify(db, doc.bidder_id, "DOCUMENT_VERIFIED", "Document verified", f"Your {label} document has been successfully verified.", tender_id=doc.tender_id)
    elif result.status in ("FAILED", "MISSING_INFORMATION", "REQUIRES_REVIEW", "EXPIRED"):
        notify(db, doc.bidder_id, "DOCUMENT_ISSUE", "Document needs attention", f"Your {label} document requires attention. Please review and re-upload if needed.", tender_id=doc.tender_id)

    return success(VerificationResultOut.model_validate(result).model_dump(), "Document verification completed")
