"""Sign-in endpoints for the reviewer console."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.land import User
from app.schemas.auth import LoginRequest, TokenResponse, UserOut
from app.services.auth import create_access_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    login_id = body.login_id.strip().lower()
    user = (
        await db.execute(select(User).where(User.login_id == login_id))
    ).scalar_one_or_none()

    # One message for "no such id" and "wrong password" alike, so the form never
    # confirms which login ids exist.
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Incorrect user ID or password."
        )
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been disabled.")

    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(
        subject=user.user_id,
        login_id=user.login_id,
        role=user.role.value,
        display_name=user.display_name,
    )
    return TokenResponse(
        access_token=token,
        expires_in=settings.JWT_EXPIRY_MINUTES * 60,
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    """Who the current token belongs to. The console calls this on load to
    confirm a stored session is still good."""
    return UserOut.model_validate(user)
