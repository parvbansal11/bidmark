"""
Script to create or reset Admin & Procurement Officer accounts.
Usage: python create_admin.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal, Base, engine
from app.models.user import User, UserRole
from app.core.security import hash_password

def create_accounts():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    accounts = [
        {
            "email": "admin@cpcl.gov.in",
            "password": "Admin@123",
            "full_name": "System Administrator",
            "role": UserRole.ADMIN
        },
        {
            "email": "officer@cpcl.gov.in",
            "password": "Officer@123",
            "full_name": "R. Krishnan, Procurement Officer",
            "role": UserRole.PROCUREMENT_OFFICER
        },
        {
            "email": "admin@gem.gov.in",
            "password": "Admin@123",
            "full_name": "GeM Platform Admin",
            "role": UserRole.ADMIN
        }
    ]

    for acc in accounts:
        user = db.query(User).filter(User.email == acc["email"]).first()
        if user:
            user.hashed_password = hash_password(acc["password"])
            user.role = acc["role"]
            user.full_name = acc["full_name"]
            user.is_active = True
            print(f"Updated existing account: {acc['email']}")
        else:
            user = User(
                email=acc["email"],
                hashed_password=hash_password(acc["password"]),
                full_name=acc["full_name"],
                role=acc["role"],
                is_active=True
            )
            db.add(user)
            print(f"Created new account: {acc['email']}")

    db.commit()
    db.close()
    print("\nAll Admin & Procurement Officer accounts ready!")

if __name__ == "__main__":
    create_accounts()
