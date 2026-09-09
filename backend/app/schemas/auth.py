"""Request/response contracts for the sign-in flow."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.land import ActorRole
from app.schemas.records import ORMModel


class LoginRequest(BaseModel):
    login_id: str = Field(min_length=1, max_length=64, description="Reviewer's login id")
    password: str = Field(min_length=1, max_length=128)


class UserOut(ORMModel):
    user_id: uuid.UUID
    login_id: str
    display_name: str
    role: ActorRole
    last_login_at: datetime | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Seconds until the token expires")
    user: UserOut
