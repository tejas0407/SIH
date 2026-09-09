"""Password hashing and session-token behaviour. No database: these cover the
crypto boundary the sign-in flow rests on."""

import uuid

import jwt
import pytest

from app.core.config import settings
from app.services.auth import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_hash_is_not_reversible_and_verifies():
    digest = hash_password("correct horse battery staple")
    assert digest != "correct horse battery staple"
    assert digest.startswith("$2")  # bcrypt marker
    assert verify_password("correct horse battery staple", digest)
    assert not verify_password("wrong password", digest)


def test_hash_is_salted_per_call():
    assert hash_password("same-input") != hash_password("same-input")


def test_verify_tolerates_a_garbage_hash():
    assert verify_password("anything", "not-a-real-bcrypt-hash") is False


def test_password_over_72_bytes_still_round_trips():
    long_pw = "p" * 200
    assert verify_password(long_pw, hash_password(long_pw))


def test_token_carries_identity_and_role():
    uid = uuid.uuid4()
    token = create_access_token(
        subject=uid, login_id="patwari.demo", role="PATWARI", display_name="Ravi"
    )
    payload = decode_access_token(token)
    assert payload["sub"] == str(uid)
    assert payload["login_id"] == "patwari.demo"
    assert payload["role"] == "PATWARI"
    assert payload["exp"] > payload["iat"]


def test_token_signed_with_another_key_is_rejected():
    forged = jwt.encode({"sub": "x"}, "some-other-secret", algorithm=settings.JWT_ALGORITHM)
    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(forged)


def test_expired_token_is_rejected(monkeypatch):
    monkeypatch.setattr(settings, "JWT_EXPIRY_MINUTES", -1)
    token = create_access_token(
        subject=uuid.uuid4(), login_id="x", role="PATWARI", display_name="x"
    )
    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(token)
