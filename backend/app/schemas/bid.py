from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class BidSubmissionCreate(BaseModel):
    quoted_price: Optional[float] = None
    local_content_percent: Optional[float] = None
    declared_turnover_crore: Optional[float] = None
    submitted_at: Optional[datetime] = None
    status: str = "SUBMITTED"


class BidSubmissionOut(BaseModel):
    id: str
    tender_id: str
    bidder_id: str
    quoted_price: Optional[float] = None
    local_content_percent: Optional[float] = None
    declared_turnover_crore: Optional[float] = None
    submitted_at: Optional[datetime] = None
    status: str

    model_config = {"from_attributes": True}
