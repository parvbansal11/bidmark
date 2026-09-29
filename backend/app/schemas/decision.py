from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class DecisionCreate(BaseModel):
    decision: Literal["QUALIFIED", "DISQUALIFIED", "PENDING_REVIEW"]
    reason: str


class DecisionOut(BaseModel):
    id: str
    bidder_id: str
    tender_id: str
    officer_id: str
    decision: str
    reason: str
    decided_at: datetime | None = None

    model_config = {"from_attributes": True}
