from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole


class AdminUserCreate(BaseModel):
    """Admin-only user provisioning. This is the ONLY way a
    PROCUREMENT_OFFICER or ADMIN account is ever created — public
    self-registration (POST /api/v1/auth/register) can only ever produce a
    BIDDER account. See app/api/v1/users.py."""

    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str
    role: UserRole
    company_name: Optional[str] = None  # used only when role == BIDDER


class UserStatusUpdate(BaseModel):
    is_active: Optional[bool] = None
    role: Optional[UserRole] = None


class UserAdminOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
