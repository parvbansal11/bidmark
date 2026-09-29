from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class RequirementEvaluationOut(BaseModel):
    id: str
    requirement_id: str
    requirement_type: str
    status: str
    evidence: list[Any] = []
    discrepancies: list[Any] = []
    explanation: str
    score_contribution: float
    max_score_contribution: float

    model_config = {"from_attributes": True}


class ComplianceReportOut(BaseModel):
    id: str
    bidder_id: str
    tender_id: str
    overall_score: float
    risk_level: str
    verified_count: int
    failed_count: int
    pending_count: int
    requires_review_count: int
    not_applicable_count: int
    critical_issues: list[str] = []
    generated_at: Optional[datetime] = None
    requirement_evaluations: list[RequirementEvaluationOut] = []

    model_config = {"from_attributes": True}


class AIRecommendationOut(BaseModel):
    recommendation: str
    confidence: float
    reasons: list[str]
    critical_issues: list[str]
    missing_requirements: list[str]
    recommended_actions: list[str]
    disclaimer: str
