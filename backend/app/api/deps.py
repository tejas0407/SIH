"""Shared FastAPI dependencies.

`get_current_user` is the gate on every protected route: it turns the bearer
token minted at sign-in back into the `User` row it names, or raises 401.
"""

from __future__ import annotations

import uuid

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.land import User
from app.services.auth import decode_access_token

# auto_error=False so a missing header yields our own worded 401 rather than
# FastAPI's terse default.
_bearer = HTTPBearer(auto_error=False, description="Reviewer session token from POST /auth/login")

_UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Sign in to continue.",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise _UNAUTHENTICATED

    try:
        payload = decode_access_token(credentials.credentials)
        user_id = uuid.UUID(str(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired or is invalid. Sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    user = (
        await db.execute(select(User).where(User.user_id == user_id))
    ).scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This account is no longer active.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
