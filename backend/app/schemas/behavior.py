from typing import Any

from pydantic import BaseModel


class BehavioralFlagOut(BaseModel):
    id: str
    category: str
    indicator: str
    evidence: str
    confidence: str
    score_impact: int
    requires_human_review: bool

    model_config = {"from_attributes": True}


class BehavioralRiskReportOut(BaseModel):
    id: str
    bidder_id: str
    tender_id: str
    behavioral_risk_score: int
    risk_level: str
    requires_human_review: bool
    disclaimer: str
    flags: list[BehavioralFlagOut] = []

    model_config = {"from_attributes": True}
