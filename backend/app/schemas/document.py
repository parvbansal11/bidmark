from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class DocumentOut(BaseModel):
    id: str
    bidder_id: str
    tender_id: Optional[str] = None
    category: str
    original_filename: str
    mime_type: str
    file_size_bytes: int
    file_hash_sha256: Optional[str] = None
    status: str
    uploaded_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentExtractionOut(BaseModel):
    id: str
    document_id: str
    extraction_provider: str
    company_name: Optional[str] = None
    registration_number: Optional[str] = None
    pan: Optional[str] = None
    gstin: Optional[str] = None
    cin: Optional[str] = None
    address: Optional[str] = None
    turnover_crore: Optional[float] = None
    issue_date: Optional[str] = None
    validity_date: Optional[str] = None
    document_number: Optional[str] = None
    extraction_confidence: float
    raw_extracted_fields: dict[str, Any] = {}

    model_config = {"from_attributes": True}


class VerificationResultOut(BaseModel):
    id: str
    document_id: str
    verification_type: str
    status: str
    government_source: str
    is_mock: bool
    reference_id: Optional[str] = None
    verified_at: Optional[datetime] = None
    details: dict[str, Any] = {}
    reasons: list = []

    model_config = {"from_attributes": True}
