from typing import Optional

from pydantic import BaseModel


class CopilotQuestion(BaseModel):
    bidder_id: str
    tender_id: str
    question: str
    compare_bidder_id: Optional[str] = None
