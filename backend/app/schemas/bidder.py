from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class BidderCreate(BaseModel):
    company_name: str
    legal_name: Optional[str] = None
    pan_number: Optional[str] = None
    gstin: Optional[str] = None
    cin: Optional[str] = None
    udyam_number: Optional[str] = None
    registered_address: Optional[str] = None
    incorporation_date: Optional[date] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    website: Optional[str] = None
    user_id: Optional[str] = None


class BidderUpdate(BaseModel):
    """Full update schema — usable by Procurement Officer / Admin only."""

    company_name: Optional[str] = None
    legal_name: Optional[str] = None
    pan_number: Optional[str] = None
    gstin: Optional[str] = None
    cin: Optional[str] = None
    udyam_number: Optional[str] = None
    registered_address: Optional[str] = None
    incorporation_date: Optional[date] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    website: Optional[str] = None
    status: Optional[str] = None


# Fields a Bidder-role user may edit on their own profile directly. Official
# identifiers (company_name, legal_name, pan_number, gstin, cin, udyam_number)
# are intentionally excluded — those go through the "Request Correction" flow.
BIDDER_SELF_EDITABLE_FIELDS = {"contact_email", "contact_phone", "website", "registered_address"}


class BidderSelfUpdate(BaseModel):
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    website: Optional[str] = None
    registered_address: Optional[str] = None


class BidderCorrectionRequest(BaseModel):
    field: str
    current_value: Optional[str] = None
    requested_value: str
    reason: Optional[str] = None


# Bidder moderation — actions a Procurement Officer or Admin can take against
# a bidder they find suspicious, fraudulent, or in violation of procurement
# rules. FLAGGED is a non-blocking marker (visible to Officers/Admin only);
# SUSPENDED and BANNED both immediately revoke the bidder's ability to use
# the system (their linked User account is deactivated, which the auth
# layer already enforces on every request, not just at login).
BIDDER_STATUSES = {"ACTIVE", "FLAGGED", "SUSPENDED", "BANNED"}
BIDDER_BLOCKING_STATUSES = {"SUSPENDED", "BANNED"}


class BidderModerationAction(BaseModel):
    reason: Optional[str] = None


class BidderOut(BaseModel):
    id: str
    user_id: Optional[str] = None
    company_name: str
    legal_name: Optional[str] = None
    pan_number: Optional[str] = None
    gstin: Optional[str] = None
    cin: Optional[str] = None
    udyam_number: Optional[str] = None
    registered_address: Optional[str] = None
    incorporation_date: Optional[date] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    website: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
