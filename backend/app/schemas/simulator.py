from typing import Optional

from pydantic import BaseModel


class RequirementOverride(BaseModel):
    requirement_id: str
    threshold: Optional[float] = None
    is_mandatory: Optional[bool] = None
    weight: Optional[float] = None


class SimulateRequest(BaseModel):
    overrides: list[RequirementOverride] = []
    bidder_ids: Optional[list[str]] = None
