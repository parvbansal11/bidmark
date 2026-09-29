"""
Common FastAPI dependencies: current user resolution and role-based access
control (RBAC) guards.
"""
from typing import Iterable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.bidder import Bidder
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def get_current_user(token: str | None = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise credentials_exception
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user or not user.is_active:
        raise credentials_exception
    return user


def require_roles(*roles: Iterable[UserRole]):
    allowed = {r.value if isinstance(r, UserRole) else r for r in roles}

    def _checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role.value not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role.value}' is not permitted to perform this action",
            )
        return current_user

    return _checker


require_admin = require_roles(UserRole.ADMIN)
require_officer = require_roles(UserRole.PROCUREMENT_OFFICER, UserRole.ADMIN)
require_bidder = require_roles(UserRole.BIDDER, UserRole.ADMIN)
require_any = require_roles(UserRole.BIDDER, UserRole.PROCUREMENT_OFFICER, UserRole.ADMIN)
# Read-only oversight endpoints: the audit chain, decision history, rule reliability.
require_oversight = require_roles(UserRole.AUDITOR, UserRole.ADMIN, UserRole.PROCUREMENT_OFFICER)


def get_own_bidder_id(current_user: User, db: Session) -> str | None:
    """Resolve the Bidder.id linked to a BIDDER-role user's account, if any."""
    if current_user.role != UserRole.BIDDER:
        return None
    bidder = db.query(Bidder).filter(Bidder.user_id == current_user.id).first()
    return bidder.id if bidder else None


def enforce_bidder_scope(current_user: User, target_bidder_id: str | None, db: Session) -> None:
    """Object-level authorization: a BIDDER-role user may only touch resources
    scoped to their own Bidder profile. Officers and Admins are unrestricted.

    Raises 403 if a bidder tries to access another bidder's data, or 404-style
    403 if the bidder account has no linked profile at all.
    """
    if current_user.role == UserRole.BIDDER:
        own_id = get_own_bidder_id(current_user, db)
        if not own_id or own_id != target_bidder_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this bidder's data",
            )
