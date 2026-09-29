from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole


class RegisterRequest(BaseModel):
    """Public self-registration.

    DEMO-ONLY rule (see app/api/v1/auth.py::register and
    settings.PRIVILEGED_ROLE_EMAIL_DOMAIN): a BIDDER account has no
    restriction, but an ADMIN or PROCUREMENT_OFFICER account may only be
    self-registered with an email address on the configured privileged
    domain. This is a plain string/format check — it does not verify mailbox
    ownership, send email, or check DNS. Admin/Officer accounts can also
    still be provisioned by an existing Admin via app/api/v1/users.py, which
    remains unchanged."""

    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str
    role: UserRole = UserRole.BIDDER
    company_name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: UserRole
    is_active: bool

    model_config = {"from_attributes": True}


TokenResponse.model_rebuild()
