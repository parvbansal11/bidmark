"""
Admin-only user management.

This is the ONLY channel through which a Procurement Officer or Admin
account is created, public self-registration (app/api/v1/auth.py::register)
can only ever produce a BIDDER account. Keeping the two flows in separate
files/routers makes the RBAC boundary easy to audit: "who can mint a
privileged account" has exactly one answer, this router, gated by
require_admin.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_admin
from app.core.security import hash_password
from app.models.bidder import Bidder
from app.models.user import User, UserRole
from app.schemas.user import AdminUserCreate, UserAdminOut, UserStatusUpdate
from app.services.audit_service import log_action
from app.utils.responses import success

router = APIRouter(prefix="/api/v1/users", tags=["User Management"])


@router.get("")
def list_users(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return success([UserAdminOut.model_validate(u).model_dump() for u in users], "Users retrieved")


@router.post("")
def create_user(payload: AdminUserCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="A user with this email already exists")

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    if user.role == UserRole.BIDDER:
        bidder = Bidder(user_id=user.id, company_name=payload.company_name or payload.full_name, contact_email=payload.email)
        db.add(bidder)
        db.commit()

    log_action(
        db, action="USER_CREATED_BY_ADMIN", actor=current_user, entity_type="User", entity_id=user.id,
        description=f"Admin {current_user.email} created a {user.role.value} account: {user.email}",
    )
    return success(UserAdminOut.model_validate(user).model_dump(), "User created")


@router.patch("/{user_id}")
def update_user(user_id: str, payload: UserStatusUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == current_user.id and payload.is_active is False:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")

    changes = []
    if payload.is_active is not None and payload.is_active != user.is_active:
        user.is_active = payload.is_active
        changes.append(f"is_active={payload.is_active}")
    if payload.role is not None and payload.role != user.role:
        user.role = payload.role
        changes.append(f"role={payload.role.value}")

    db.commit()
    db.refresh(user)
    if changes:
        log_action(
            db, action="USER_UPDATED_BY_ADMIN", actor=current_user, entity_type="User", entity_id=user.id,
            description=f"Admin {current_user.email} updated {user.email}: {', '.join(changes)}",
        )
    return success(UserAdminOut.model_validate(user).model_dump(), "User updated")
