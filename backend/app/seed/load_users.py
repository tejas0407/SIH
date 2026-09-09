"""Seed the demo reviewer accounts.

Run inside the backend container:

    python -m app.seed.load_users

Two accounts, one per role, so an evaluator can sign in as a Patwari (does the
day-to-day verification) or a Tehsildar (can override a failed arithmetic check).
Re-running resets their passwords to the values below, so a demo can always get
back in.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select

from app.db.session import Base, SyncSessionLocal, sync_engine
from app.models.land import ActorRole, User
from app.services.auth import hash_password

# login id -> (display name, plain password, role)
DEMO_USERS = [
    {
        "login_id": "patwari.demo",
        "display_name": "Ravi Kulkarni (Patwari)",
        "password": "patwari@123",
        "role": ActorRole.PATWARI,
    },
    {
        "login_id": "tehsildar.demo",
        "display_name": "Anjali Deshmukh (Tehsildar)",
        "password": "tehsildar@123",
        "role": ActorRole.TEHSILDAR,
    },
]


def seed_users(session) -> list[str]:
    """Idempotent upsert of the demo accounts. Returns one status line each."""
    # On a database created before migration 002 the table may be missing;
    # create_all only builds what is absent and leaves the rest untouched.
    Base.metadata.create_all(sync_engine, tables=[User.__table__], checkfirst=True)

    lines: list[str] = []
    for entry in DEMO_USERS:
        login_id = entry["login_id"].lower()
        user = session.execute(
            select(User).where(User.login_id == login_id)
        ).scalar_one_or_none()

        if user is None:
            session.add(
                User(
                    user_id=uuid.uuid4(),
                    login_id=login_id,
                    display_name=entry["display_name"],
                    password_hash=hash_password(entry["password"]),
                    role=entry["role"],
                    is_active=True,
                )
            )
            lines.append(f"{login_id}: created ({entry['role'].value})")
        else:
            user.display_name = entry["display_name"]
            user.password_hash = hash_password(entry["password"])
            user.role = entry["role"]
            user.is_active = True
            lines.append(f"{login_id}: reset ({entry['role'].value})")

    session.commit()
    return lines


def main() -> None:
    with sync_engine.connect() as conn:
        conn.exec_driver_sql("SELECT 1")

    session = SyncSessionLocal()
    try:
        for line in seed_users(session):
            print("  " + line)
    finally:
        session.close()

    print("\nSign in at http://localhost:3000/login")
    print("  Patwari    patwari.demo    / patwari@123")
    print("  Tehsildar  tehsildar.demo  / tehsildar@123")


if __name__ == "__main__":
    main()
