"""
Pydantic schemas for the BIDMARK verification architecture.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class BidmarkCheckOut(BaseModel):
    check: str
    status: str
    source: str
    identifier: Optional[Any] = None
    value: Optional[Any] = None
    expected: Optional[str] = None
    note: str


class BidmarkInconsistencyOut(BaseModel):
    what: str
    where: str
    why: str
    severity: str
    evidence: dict[str, Any]


class BidmarkFlagOut(BaseModel):
    flag: str
    what: str
    why: str
    which_source: str
    how_serious: str
    what_to_review: str
    module: str
    severity: str


class BidmarkConsentEntry(BaseModel):
    data_type: str
    source: str
    authorization: str
    purpose: str
    accessed_at: str
    is_mock: bool


class BidmarkAnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    bidder_id: str
    tender_id: str

    # Module 1
    entity_verdict: str
    entity_confidence: float
    entity_summary: str
    entity_checks: list[dict]

    # Module 2
    compliance_verdict: str
    compliance_confidence: float
    compliance_summary: str
    compliance_checks: list[dict]

    # Module 3
    document_verdict: str
    document_confidence: float
    document_summary: str
    document_checks: list[dict]

    # Fusion
    fusion_verdict: str
    fusion_confidence: float
    fusion_explanation: str

    # Inconsistencies + explainability
    detected_inconsistencies: list[dict]
    explainable_flags: list[dict]

    # Consent audit trail
    consent_audit: list[dict]

    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class BidmarkSummaryOut(BaseModel):
    """
    Simplified summary for the Bidder Portal — no internal module names.
    All verdicts are translated to bidder-friendly language.
    """
    entity_status: str       # "Confirmed" | "Needs Attention" | "Issue Detected"
    compliance_status: str
    document_status: str
    overall_status: str      # "Looking Good" | "Some Items Need Attention" | "Action Required"
    overall_message: str
    action_items: list[dict]  # [{title, description, priority}]
    completed_at: Optional[datetime] = None
