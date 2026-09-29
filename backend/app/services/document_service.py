import hashlib
import os
from datetime import date, datetime, timezone

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.document import Document, DocumentExtraction
from app.models.verification import VerificationResult
from app.forensics import names
from app.providers.document.forensic_provider import ForensicExtractionProvider
from app.providers.document.mock_provider import MockDocumentProvider
from app.providers.government.registry import GovernmentVerificationProvider
from app.utils.constants import CATEGORY_TO_REGISTRY, REQUIRED_FIELDS_BY_CATEGORY
from app.utils.ids import new_id

_reader = ForensicExtractionProvider()
_mock_provider = MockDocumentProvider()


def save_document(db: Session, bidder_id: str, category: str, upload: UploadFile, tender_id: str | None = None) -> Document:
    bidder_dir = os.path.join(settings.UPLOAD_DIRECTORY, bidder_id)
    os.makedirs(bidder_dir, exist_ok=True)

    contents = upload.file.read()
    ext = os.path.splitext(upload.filename or "")[1].lower() or ".bin"
    stored_filename = f"{new_id()}{ext}"
    file_path = os.path.join(bidder_dir, stored_filename)
    with open(file_path, "wb") as fh:
        fh.write(contents)

    file_hash = hashlib.sha256(contents).hexdigest()

    doc = Document(
        bidder_id=bidder_id,
        tender_id=tender_id,
        category=category,
        original_filename=upload.filename or stored_filename,
        stored_filename=stored_filename,
        file_path=file_path,
        mime_type=upload.content_type or "application/octet-stream",
        file_size_bytes=len(contents),
        file_hash_sha256=file_hash,
        uploaded_at=datetime.now(timezone.utc),
        status="UPLOADED",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def extract_document(db: Session, document: Document) -> DocumentExtraction:
    bidder = document.bidder
    inspection = _reader.inspect(document, document.file_path) if document.file_path and os.path.exists(document.file_path) else None
    fields = _reader.extract(document, bidder, document.file_path, inspection) if inspection else None
    if not fields:
        if not settings.SIMULATE_UNREADABLE_DOCUMENTS:
            fields = {"extraction_provider": "BidmarkForensics:unreadable", "extraction_confidence": 0.0,
                      "raw_extracted_fields": {"simulated": False, "unreadable": True, "inspection": inspection}}
        else:
            # Placeholder uploads in dev and tests: fabricate fields from the profile,
            # and say so everywhere the extraction is shown.
            fields = _mock_provider.extract(document, bidder, document.file_path)
            fields["raw_extracted_fields"]["simulated"] = True
            fields["raw_extracted_fields"]["inspection"] = inspection

    existing = db.query(DocumentExtraction).filter(DocumentExtraction.document_id == document.id).first()
    if existing:
        for k, v in fields.items():
            if hasattr(existing, k):
                setattr(existing, k, v)
        extraction = existing
    else:
        known_fields = {k: v for k, v in fields.items() if k in DocumentExtraction.__table__.columns.keys()}
        extraction = DocumentExtraction(document_id=document.id, **known_fields)
        db.add(extraction)

    document.status = "EXTRACTED"
    db.commit()
    db.refresh(extraction)
    return extraction


def _dates_valid(validity_date: str | None) -> bool:
    if not validity_date:
        return True
    try:
        return date.fromisoformat(validity_date[:10]) >= date.today()
    except ValueError:
        return True


def _name_similarity_ok(name_a: str | None, name_b: str | None) -> bool:
    return names.compare(name_a, name_b)["verdict"] in ("SAME", "UNMEASURED")


def verify_document(db: Session, document: Document) -> VerificationResult:
    extraction = document.extraction
    if not extraction:
        extraction = extract_document(db, document)

    bidder = document.bidder
    category = document.category
    required = REQUIRED_FIELDS_BY_CATEGORY.get(category, [])
    missing = [f for f in required if not getattr(extraction, f, None)]

    reasons: list[str] = []
    status = "VERIFIED"
    govt_result = None

    if missing:
        status = "MISSING_INFORMATION"
        reasons.append(f"Required fields missing from extracted document: {', '.join(missing)}")
    elif not _dates_valid(extraction.validity_date):
        status = "EXPIRED"
        reasons.append(f"Document validity date {extraction.validity_date} has passed.")
    else:
        registry = CATEGORY_TO_REGISTRY.get(category)
        if registry:
            identifier = extraction.registration_number or extraction.gstin or extraction.pan or extraction.cin or ""
            govt_result = GovernmentVerificationProvider.verify(
                registry, identifier, {"company_name": extraction.company_name}
            )
            govt_status = govt_result["status"]
            if govt_status == "FAILED":
                status = "FAILED"
                reasons.append(govt_result["data"].get("message", "Mock government registry could not verify this record."))
            elif govt_status == "EXPIRED":
                status = "EXPIRED"
                reasons.append(govt_result["data"].get("message", "Mock government registry indicates an expired record."))
            elif govt_status == "REQUIRES_REVIEW":
                status = "REQUIRES_REVIEW"
                reasons.append(govt_result["data"].get("message", "Mock government registry flagged this record for review."))
            else:
                status = "VERIFIED"

        if status == "VERIFIED" and bidder and not _name_similarity_ok(extraction.company_name, bidder.company_name):
            status = "REQUIRES_REVIEW"
            reasons.append(
                f"Extracted company name '{extraction.company_name}' does not closely match bidder profile name '{bidder.company_name}'."
            )

    result = VerificationResult(
        document_id=document.id,
        verification_type=category,
        status=status,
        government_source="MOCK_GOVERNMENT_API",
        is_mock=True,
        reference_id=govt_result["reference_id"] if govt_result else None,
        verified_at=datetime.now(timezone.utc),
        details=govt_result["data"] if govt_result else {},
        reasons=reasons,
    )
    db.add(result)
    document.status = status
    db.commit()
    db.refresh(result)
    return result
