from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.rate_limit import login_rate_limiter
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User, UserRole
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserOut
from app.services.audit_service import log_action
from app.utils.responses import ApiError, success

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])

PRIVILEGED_ROLES = {UserRole.ADMIN, UserRole.PROCUREMENT_OFFICER}


@router.get("/config")
def auth_config():
    """Public, non-sensitive auth configuration the frontend needs to render
    registration validation without hardcoding it — currently just the email
    domain required for a self-registered Admin/Procurement Officer account.
    Centralizing it here means the demo rule can be changed (or removed) via
    one setting, on both backend and frontend, without touching auth logic."""
    return success({"privileged_role_email_domain": settings.PRIVILEGED_ROLE_EMAIL_DOMAIN}, "Auth configuration")


@router.post("/register")
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """Public self-registration.

    DEMO-ONLY rule: a BIDDER account can be self-registered with any email.
    An ADMIN or PROCUREMENT_OFFICER account can ALSO be self-registered
    through this exact same endpoint, but only when the email address ends
    with settings.PRIVILEGED_ROLE_EMAIL_DOMAIN (e.g. "...@cpcl.gov.in"). This
    is a plain string check — it does not verify mailbox ownership, send a
    verification email, require an OTP, or check DNS/MX records. It exists
    purely so a hackathon demo can create realistic-looking Admin/Officer
    accounts without a separate provisioning step. An existing Admin can
    still provision Admin/Officer accounts with no domain restriction via
    POST /api/v1/users (see app/api/v1/users.py) — that channel is unchanged.
    """
    if payload.role in PRIVILEGED_ROLES:
        domain = settings.PRIVILEGED_ROLE_EMAIL_DOMAIN.lower().lstrip("@")
        if not payload.email.lower().endswith(f"@{domain}"):
            raise ApiError(
                "PRIVILEGED_ROLE_EMAIL_DOMAIN_REQUIRED",
                f"Admin and Procurement Officer accounts require an @{domain} email address.",
                status_code=422,
            )

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A user with this email already exists")
    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    if payload.role == UserRole.BIDDER:
        from app.models.bidder import Bidder

        bidder = Bidder(user_id=user.id, company_name=payload.company_name or payload.full_name, contact_email=payload.email)
        db.add(bidder)
        db.commit()

    log_action(db, action="REGISTER", actor=user, entity_type="User", entity_id=user.id, description=f"{user.role.value.replace('_', ' ').title()} self-registered: {user.email}")

    token = create_access_token(subject=user.id, role=user.role.value)
    return success(TokenResponse(access_token=token, user=UserOut.model_validate(user)).model_dump(), "Registration successful")


@router.post("/login")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    # Basic brute-force protection: lock out an email+IP pair for a cooldown
    # window after too many failed attempts. In-memory and per-process — fine
    # for this deployment's single-instance footprint; a multi-instance
    # production deployment would back this with Redis instead.
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"{payload.email.lower()}:{client_ip}"
    login_rate_limiter.check(rate_key)

    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        login_rate_limiter.record_failure(rate_key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account has been suspended or deactivated. Contact your procurement office administrator.")

    login_rate_limiter.clear(rate_key)
    token = create_access_token(subject=user.id, role=user.role.value)
    log_action(db, action="LOGIN", actor=user, entity_type="User", entity_id=user.id, description=f"User {user.email} logged in")
    return success(TokenResponse(access_token=token, user=UserOut.model_validate(user)).model_dump(), "Login successful")


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return success(UserOut.model_validate(current_user).model_dump(), "Current user")
