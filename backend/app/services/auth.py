"""Password hashing and session tokens for the reviewer console.

Passwords are stored as bcrypt hashes. A successful sign-in mints a short-lived
JWT that carries the reviewer's login id and role; every protected endpoint
reads the actor straight off that token rather than trusting the request body,
so the audit ledger cannot be told a correction came from someone else.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import settings

# bcrypt hashes only the first 72 bytes of a password and raises on anything
# longer, so inputs are clamped to that boundary on both hash and verify.
_BCRYPT_MAX_BYTES = 72


def _clamp(password: str) -> bytes:
    return password.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_clamp(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_clamp(password), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(
    *,
    subject: uuid.UUID | str,
    login_id: str,
    role: str,
    display_name: str,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(subject),
        "login_id": login_id,
        "role": role,
        "name": display_name,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.JWT_EXPIRY_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Raises jwt.PyJWTError (expired, bad signature, malformed) on any problem."""
    return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
