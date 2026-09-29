import sqlite3
import uuid
import datetime
import passlib.hash

db_path = "./gem_compliance.db"

# Hashing password Admin@123 using bcrypt
hashed_password = passlib.hash.bcrypt.hash("Admin@123")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Ensure users table exists
cursor.execute("""
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME,
    updated_at DATETIME
)
""")

accounts = [
    ("admin@cpcl.gov.in", "System Administrator", "ADMIN"),
    ("officer@cpcl.gov.in", "R. Krishnan, Procurement Officer", "PROCUREMENT_OFFICER"),
    ("admin@gem.gov.in", "GeM Platform Admin", "ADMIN"),
    ("bidder@example.com", "Bidder Portal User", "BIDDER")
]

now = datetime.datetime.utcnow().isoformat()

for email, name, role in accounts:
    user_id = str(uuid.uuid4())
    cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
    existing = cursor.fetchone()
    if existing:
        cursor.execute(
            "UPDATE users SET hashed_password = ?, role = ?, full_name = ?, is_active = 1, updated_at = ? WHERE email = ?",
            (hashed_password, role, name, now, email)
        )
        print(f"Updated account: {email}")
    else:
        cursor.execute(
            "INSERT INTO users (id, email, hashed_password, full_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
            (user_id, email, hashed_password, name, role, now, now)
        )
        print(f"Created account: {email}")

conn.commit()
conn.close()
print("Direct DB Seeding Completed Successfully!")
