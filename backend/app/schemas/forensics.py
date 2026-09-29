from typing import Any

from pydantic import BaseModel


class ForensicAnalysisOut(BaseModel):
    id: str
    document_id: str
    forensic_risk_score: int
    risk_level: str
    signals: list[Any] = []
    evidence: list[str] = []
    requires_human_review: bool

    model_config = {"from_attributes": True}


class DocumentFingerprintOut(BaseModel):
    id: str
    document_id: str
    bidder_id: str
    file_hash: str
    normalized_text_hash: str
    structural_features: dict[str, Any] = {}
    metadata_features: dict[str, Any] = {}
    document_type: str

    model_config = {"from_attributes": True}


class CompareRequest(BaseModel):
    document_id_a: str
    document_id_b: str


class FingerprintComparisonOut(BaseModel):
    id: str
    document_a_id: str
    document_b_id: str
    bidder_a_id: str
    bidder_b_id: str
    similarity_score: float
    level: str
    common_sections: list[Any] = []
    requires_review: bool

    model_config = {"from_attributes": True}
