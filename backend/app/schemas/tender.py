from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

TenderType = Literal["OPEN_TENDER", "LIMITED_TENDER", "SINGLE_TENDER"]
TenderCategory = Literal["GOODS", "SERVICES", "WORKS"]
TenderMode = Literal["ONLINE", "OFFLINE", "HYBRID"]
BidSystem = Literal["SINGLE_PACKET", "TWO_PACKET"]


class RequirementCreate(BaseModel):
    requirement_type: str
    description: str
    is_mandatory: bool = True
    threshold: Optional[float] = None
    threshold_unit: Optional[str] = None
    weight: float = 1.0
    evidence_type: str


class RequirementOut(RequirementCreate):
    id: str
    tender_id: str

    model_config = {"from_attributes": True}


class TenderCreate(BaseModel):
    # Core identification
    title: str
    tender_number: str  # Tender Reference No.
    gem_tender_id: str  # Tender ID
    organization: str = "Ministry of Petroleum & Natural Gas"
    department: str = "Chennai Petroleum Corporation Limited (CPCL)"

    # Classification
    tender_type: TenderType
    tender_category: TenderCategory
    tender_mode: TenderMode
    bid_system: BidSystem

    # Scope & logistics
    location: str
    bid_validity_days: int
    published_at: datetime  # Bid Submission Start
    deadline: datetime  # Bid Submission End

    description: Optional[str] = None
    estimated_value: Optional[float] = None
    status: str = "ACTIVE"
    requirements: list[RequirementCreate] = []


class TenderUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    estimated_value: Optional[float] = None
    published_at: Optional[datetime] = None
    deadline: Optional[datetime] = None
    status: Optional[str] = None
    tender_type: Optional[TenderType] = None
    tender_category: Optional[TenderCategory] = None
    tender_mode: Optional[TenderMode] = None
    bid_system: Optional[BidSystem] = None
    location: Optional[str] = None
    bid_validity_days: Optional[int] = None
    is_flagged: Optional[bool] = None
    flagged_reason: Optional[str] = None


class TenderOut(BaseModel):
    id: str
    tender_number: str
    title: str
    department: str
    organization: str
    description: Optional[str] = None
    estimated_value: Optional[float] = None
    published_at: Optional[datetime] = None
    deadline: Optional[datetime] = None
    status: str
    gem_tender_id: Optional[str] = None
    tender_type: Optional[str] = None
    tender_category: Optional[str] = None
    tender_mode: Optional[str] = None
    bid_system: Optional[str] = None
    location: Optional[str] = None
    bid_validity_days: Optional[int] = None
    is_flagged: bool = False
    flagged_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TenderDetailOut(TenderOut):
    requirements: list[RequirementOut] = []
