"""Cryptographic audit ledger.

Each entry stores the SHA-256 of its own content plus the hash of the entry
before it, so the log for a Khata forms a chain. Altering any historic
correction changes every hash after it, and `verify_chain` will name the exact
entry where the record was tampered with. Combined with the database triggers
that block UPDATE and DELETE, a Patwari's verification history is evidence.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.land import ActorRole, AuditLog

GENESIS = "0" * 64


def compute_entry_hash(
    khata_id: str | None,
    field_name: str,
    raw_value: str | None,
    corrected_value: str | None,
    user_id: str,
    role: str,
    timestamp: str,
    prev_hash: str,
) -> str:
    canonical = json.dumps(
        {
            "khata_id": str(khata_id) if khata_id else None,
            "field": field_name,
            "raw": raw_value,
            "corrected": corrected_value,
            "user": user_id,
            "role": role,
            "ts": timestamp,
            "prev": prev_hash,
        },
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def hash_aadhaar(aadhaar: str) -> str:
    """Aadhaar numbers are never stored. A salted digest supports duplicate
    detection across records without holding the identifier itself."""
    digits = "".join(ch for ch in aadhaar if ch.isdigit())
    if len(digits) != 12:
        raise ValueError("Aadhaar must contain 12 digits")
    salted = f"{settings.AADHAAR_HASH_SALT}:{digits}".encode()
    return hashlib.sha256(salted).hexdigest()


async def _latest_hash(session: AsyncSession, khata_id: uuid.UUID | None) -> str:
    stmt = (
        select(AuditLog.entry_hash)
        .where(AuditLog.khata_id == khata_id)
        .order_by(AuditLog.timestamp.desc())
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none() or GENESIS


async def record_change(
    session: AsyncSession,
    khata_id: uuid.UUID | None,
    field_name: str,
    raw_value,
    corrected_value,
    user_id: str,
    role: ActorRole | str,
    reason: str | None = None,
    entity_type: str = "khata",
    entity_id: uuid.UUID | None = None,
) -> AuditLog:
    prev_hash = await _latest_hash(session, khata_id)
    role_value = role.value if isinstance(role, ActorRole) else str(role)
    timestamp = datetime.now(timezone.utc)

    raw_str = None if raw_value is None else str(raw_value)
    corrected_str = None if corrected_value is None else str(corrected_value)

    entry = AuditLog(
        log_id=uuid.uuid4(),
        khata_id=khata_id,
        entity_type=entity_type,
        entity_id=entity_id,
        field_name=field_name,
        raw_extracted_value=raw_str,
        corrected_value=corrected_str,
        modified_by_user_id=user_id,
        role=ActorRole(role_value),
        reason=reason,
        prev_hash=prev_hash,
        entry_hash=compute_entry_hash(
            khata_id, field_name, raw_str, corrected_str, user_id,
            role_value, timestamp.isoformat(), prev_hash,
        ),
        timestamp=timestamp,
    )
    session.add(entry)
    return entry


async def verify_chain(session: AsyncSession, khata_id: uuid.UUID) -> dict:
    """Walk the ledger for a Khata and report the first break, if any."""
    stmt = (
        select(AuditLog)
        .where(AuditLog.khata_id == khata_id)
        .order_by(AuditLog.timestamp.asc())
    )
    entries = list((await session.execute(stmt)).scalars())

    expected_prev = GENESIS
    for entry in entries:
        recomputed = compute_entry_hash(
            entry.khata_id, entry.field_name, entry.raw_extracted_value,
            entry.corrected_value, entry.modified_by_user_id, entry.role.value,
            entry.timestamp.isoformat(), entry.prev_hash or GENESIS,
        )
        if entry.prev_hash != expected_prev or recomputed != entry.entry_hash:
            return {
                "intact": False,
                "entries_checked": len(entries),
                "broken_at": str(entry.log_id),
                "field": entry.field_name,
            }
        expected_prev = entry.entry_hash

    return {"intact": True, "entries_checked": len(entries), "head": expected_prev}
