import enum

from sqlalchemy import Boolean, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class UserRole(str, enum.Enum):
    BIDDER = "BIDDER"
    PROCUREMENT_OFFICER = "PROCUREMENT_OFFICER"
    ADMIN = "ADMIN"
    AUDITOR = "AUDITOR"  # read-only: vigilance / internal audit


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False, default=UserRole.BIDDER, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    bidder_profile = relationship("Bidder", back_populates="user", uselist=False)
