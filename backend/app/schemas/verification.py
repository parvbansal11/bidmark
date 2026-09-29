from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class CrossCheckResultOut(BaseModel):
    id: str
    field: str
    relation: str
    sources: list[str]
    values: list[Any]
    status: str
    requires_review: bool

    model_config = {"from_attributes": True}


class DiscrepancyOut(BaseModel):
    id: str
    category: str
    description: str
    severity: str
    affected_requirement_type: Optional[str] = None
    score_impact: float
    resolved: bool

    model_config = {"from_attributes": True}
