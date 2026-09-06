"""Human-in-the-loop review endpoints.

The verify endpoint is the only path by which extracted data becomes an
official record, so it does four things in one transaction: write the audit
entries, apply the corrections, re-run every invariant against the corrected
values, and set the approval state. If the invariants still fail, the record
stays in the queue — a reviewer cannot approve arithmetic that does not close
unless they hold the Tehsildar role and say so explicitly.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models.land import (
    ActorRole,
    ApprovalStatus,
    Document,
    KhasraParcel,
    KhataRecord,
    OwnershipDetail,
    ProcessingStatus,
    RelationType,
)
from app.schemas.records import (
    AuditEntry,
    ConfidenceBreakdown,
    KhataDetail,
    OwnerOut,
    ParcelOut,
    QueueItem,
    QueuePage,
    VerifyRequest,
    VerifyResponse,
    VillageOut,
)
from app.services import audit as audit_service
from app.services.storage import get_store
from app.services.validator import LandRecordValidator
from app.workers.queue import remove_from_hitl_queue

router = APIRouter(prefix="/hitl", tags=["hitl"])


def _confidence(khata: KhataRecord) -> ConfidenceBreakdown:
    return ConfidenceBreakdown(
        ocr_confidence=khata.ocr_confidence,
        layout_confidence=khata.layout_confidence,
        math_checks_pass=khata.math_checks_pass,
        total_confidence=khata.confidence_score,
        threshold=settings.AUTO_COMMIT_THRESHOLD,
    )


async def _load_khata(db: AsyncSession, khata_id: uuid.UUID) -> KhataRecord:
    khata = (
        await db.execute(select(KhataRecord).where(KhataRecord.khata_id == khata_id))
    ).scalar_one_or_none()
    if khata is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No Khata record with that id.")
    return khata


@router.get("/queue", response_model=QueuePage)
async def review_queue(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    village_code: str | None = None,
    sort: str = Query("confidence", pattern="^(confidence|oldest|newest)$"),
    db: AsyncSession = Depends(get_db),
) -> QueuePage:
    """Records awaiting a human read. Sorted by confidence ascending by default
    so the worst extractions reach a reviewer first."""
    filters = [KhataRecord.approval_status == ApprovalStatus.PENDING]
    if village_code:
        filters.append(KhataRecord.village_code == village_code)

    total = (
        await db.execute(select(func.count()).select_from(KhataRecord).where(*filters))
    ).scalar_one()

    order = {
        "confidence": KhataRecord.confidence_score.asc(),
        "oldest": KhataRecord.created_at.asc(),
        "newest": KhataRecord.created_at.desc(),
    }[sort]

    stmt = (
        select(KhataRecord)
        .where(*filters)
        .order_by(order)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    records = (await db.execute(stmt)).scalars().all()

    items = []
    for khata in records:
        errors = khata.validation_errors or []
        criticals = [e for e in errors if e.get("severity") == "CRITICAL"]
        items.append(
            QueueItem(
                khata_id=khata.khata_id,
                khata_number=khata.khata_number,
                document_id=khata.document_id,
                village=VillageOut.model_validate(khata.village) if khata.village else None,
                confidence_score=khata.confidence_score,
                critical_error_count=len(criticals),
                top_error=(criticals or errors or [{}])[0].get("message"),
                parcel_count=len(khata.parcels),
                created_at=khata.created_at,
            )
        )

    return QueuePage(items=items, total=total, page=page, page_size=page_size)


@router.get("/{khata_id}", response_model=KhataDetail)
async def get_record(khata_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> KhataDetail:
    khata = await _load_khata(db, khata_id)

    document = (
        await db.execute(select(Document).where(Document.document_id == khata.document_id))
    ).scalar_one_or_none()

    document_url = None
    if document:
        try:
            document_url = get_store().presigned_url(document.storage_path, expires_minutes=120)
        except Exception:  # noqa: BLE001 - the form must still open if MinIO blips
            document_url = None

    trail = (
        await db.execute(
            select(audit_service.AuditLog)
            .where(audit_service.AuditLog.khata_id == khata_id)
            .order_by(audit_service.AuditLog.timestamp.desc())
            .limit(100)
        )
    ).scalars().all()

    return KhataDetail(
        khata_id=khata.khata_id,
        document_id=khata.document_id,
        khata_number=khata.khata_number,
        fasli_year=khata.fasli_year,
        total_area_sqm=khata.total_area_sqm,
        declared_unit=khata.declared_unit,
        approval_status=khata.approval_status,
        confidence=_confidence(khata),
        village=VillageOut.model_validate(khata.village) if khata.village else None,
        parcels=[ParcelOut.model_validate(p) for p in khata.parcels],
        owners=[OwnerOut.model_validate(o) for o in khata.owners],
        validation_errors=khata.validation_errors or [],
        document_url=document_url,
        page_count=document.page_count if document else 1,
        audit_trail=[AuditEntry.model_validate(a) for a in trail],
    )


@router.put("/{khata_id}/verify", response_model=VerifyResponse)
async def verify_record(
    khata_id: uuid.UUID, body: VerifyRequest, db: AsyncSession = Depends(get_db)
) -> VerifyResponse:
    khata = await _load_khata(db, khata_id)
    audit_count = 0

    async def log(field: str, old, new, entity_type="khata", entity_id=None):
        nonlocal audit_count
        if str(old) != str(new):
            await audit_service.record_change(
                db, khata_id, field, old, new, body.reviewer_id, body.role,
                body.reason, entity_type, entity_id,
            )
            audit_count += 1

    # ---- khata header ----
    await log("khata_number", khata.khata_number, body.khata_number)
    await log("total_area_sqm", khata.total_area_sqm, body.total_area_sqm)
    await log("fasli_year", khata.fasli_year, body.fasli_year)
    khata.khata_number = body.khata_number
    khata.total_area_sqm = body.total_area_sqm
    khata.fasli_year = body.fasli_year
    khata.declared_unit = body.declared_unit

    # ---- parcels ----
    existing_parcels = {p.parcel_id: p for p in khata.parcels}
    kept_parcels: list[KhasraParcel] = []

    for correction in body.parcels:
        parcel = existing_parcels.pop(correction.parcel_id, None) if correction.parcel_id else None

        if correction.delete:
            if parcel:
                await log("parcel.deleted", parcel.khasra_number, None, "parcel", parcel.parcel_id)
                await db.delete(parcel)
            continue

        if parcel is None:
            parcel = KhasraParcel(parcel_id=uuid.uuid4(), khata_id=khata_id)
            db.add(parcel)
            await log("parcel.added", None, correction.khasra_number, "parcel", parcel.parcel_id)
        else:
            await log("parcel.khasra_number", parcel.khasra_number,
                      correction.khasra_number, "parcel", parcel.parcel_id)
            await log("parcel.plot_area_sqm", parcel.plot_area_sqm,
                      correction.plot_area_sqm, "parcel", parcel.parcel_id)

        parcel.khasra_number = correction.khasra_number
        parcel.plot_area_sqm = correction.plot_area_sqm
        parcel.declared_unit = correction.declared_unit
        parcel.declared_area = correction.declared_area
        parcel.land_classification = correction.land_classification
        kept_parcels.append(parcel)

    for orphan in existing_parcels.values():
        await log("parcel.deleted", orphan.khasra_number, None, "parcel", orphan.parcel_id)
        await db.delete(orphan)

    # ---- owners ----
    existing_owners = {o.owner_id: o for o in khata.owners}
    kept_owners: list[OwnershipDetail] = []

    for correction in body.owners:
        owner = existing_owners.pop(correction.owner_id, None) if correction.owner_id else None

        if correction.delete:
            if owner:
                await log("owner.deleted", owner.owner_name_vernacular, None,
                          "owner", owner.owner_id)
                await db.delete(owner)
            continue

        if owner is None:
            owner = OwnershipDetail(owner_id=uuid.uuid4(), khata_id=khata_id)
            db.add(owner)
            await log("owner.added", None, correction.owner_name_vernacular,
                      "owner", owner.owner_id)
        else:
            await log("owner.name", owner.owner_name_vernacular,
                      correction.owner_name_vernacular, "owner", owner.owner_id)
            await log("owner.share_percentage", owner.share_percentage,
                      correction.share_percentage, "owner", owner.owner_id)

        owner.owner_name_vernacular = correction.owner_name_vernacular
        owner.owner_name_en = correction.owner_name_en
        owner.relation_type = (
            RelationType(correction.relation_type) if correction.relation_type else None
        )
        owner.relative_name = correction.relative_name
        owner.share_percentage = correction.share_percentage
        if correction.aadhaar:
            owner.aadhaar_hash_sha256 = audit_service.hash_aadhaar(correction.aadhaar)
        kept_owners.append(owner)

    for orphan in existing_owners.values():
        await log("owner.deleted", orphan.owner_name_vernacular, None, "owner", orphan.owner_id)
        await db.delete(orphan)

    await db.flush()

    # ---- re-validate the corrected record ----
    payload = {
        "khata": {
            "khata_number": khata.khata_number,
            "total_area_sqm": khata.total_area_sqm,
            # A human read every field, so OCR confidence is no longer the
            # limiting factor; the corrected values are taken as certain.
            "ocr_confidence": 1.0,
            "layout_confidence": max(khata.layout_confidence, 0.9),
        },
        "parcels": [
            {"khasra_number": p.khasra_number, "plot_area_sqm": p.plot_area_sqm,
             "ulpin": p.ulpin, "field_confidence": {}}
            for p in kept_parcels
        ],
        "owners": [
            {"share_percentage": o.share_percentage, "field_confidence": {}}
            for o in kept_owners
        ],
    }
    report = LandRecordValidator().validate(payload)

    khata.validation_errors = [f.to_dict() for f in report.findings]
    khata.ocr_confidence = report.ocr_confidence
    khata.layout_confidence = report.layout_confidence
    khata.math_checks_pass = report.math_checks_pass
    khata.confidence_score = report.total_confidence
    khata.reviewed_by = body.reviewer_id
    khata.reviewed_at = datetime.now(timezone.utc)

    blocking = report.critical
    override = body.force_approve and body.role == ActorRole.TEHSILDAR

    if not blocking or override:
        khata.approval_status = ApprovalStatus.MANUALLY_APPROVED
        committed = True
        if override and blocking:
            await audit_service.record_change(
                db, khata_id, "approval.override",
                f"{len(blocking)} critical finding(s) open", "MANUALLY_APPROVED",
                body.reviewer_id, body.role,
                body.reason or "Tehsildar override on open critical findings",
            )
            audit_count += 1
            message = (
                f"Approved by Tehsildar override with {len(blocking)} critical "
                f"finding(s) recorded in the ledger."
            )
        else:
            message = "Record verified and committed to the land register."
    else:
        khata.approval_status = ApprovalStatus.PENDING
        committed = False
        message = (
            f"{len(blocking)} critical check still fails: {blocking[0].message} "
            "Correct it or ask a Tehsildar to override."
        )

    document = (
        await db.execute(select(Document).where(Document.document_id == khata.document_id))
    ).scalar_one_or_none()
    if document:
        document.processing_status = (
            ProcessingStatus.COMMITTED if committed else ProcessingStatus.NEEDS_REVIEW
        )
        document.progress_pct = 100 if committed else 90
        document.current_step = "Committed" if committed else "Awaiting correction"

    await db.commit()

    if committed:
        remove_from_hitl_queue(str(khata_id))

    ledger = await audit_service.verify_chain(db, khata_id)

    return VerifyResponse(
        khata_id=khata_id,
        approval_status=khata.approval_status,
        confidence=_confidence(khata),
        validation_errors=khata.validation_errors,
        audit_entries_written=audit_count,
        ledger_head=ledger.get("head", ""),
        committed=committed,
        message=message,
    )


@router.get("/{khata_id}/ledger")
async def ledger_integrity(khata_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> dict:
    """Recompute the audit hash chain and report whether it is intact."""
    await _load_khata(db, khata_id)
    return await audit_service.verify_chain(db, khata_id)


@router.post("/{khata_id}/reject", response_model=VerifyResponse)
async def reject_record(
    khata_id: uuid.UUID,
    reviewer_id: str,
    reason: str,
    role: ActorRole = ActorRole.TEHSILDAR,
    db: AsyncSession = Depends(get_db),
) -> VerifyResponse:
    """Send a scan back to the record room — used when the source page is too
    damaged to digitise rather than merely mis-read."""
    khata = await _load_khata(db, khata_id)
    khata.approval_status = ApprovalStatus.REJECTED
    khata.reviewed_by = reviewer_id
    khata.reviewed_at = datetime.now(timezone.utc)

    await audit_service.record_change(
        db, khata_id, "approval_status", khata.approval_status.value, "REJECTED",
        reviewer_id, role, reason,
    )
    await db.commit()
    remove_from_hitl_queue(str(khata_id))
    ledger = await audit_service.verify_chain(db, khata_id)

    return VerifyResponse(
        khata_id=khata_id,
        approval_status=ApprovalStatus.REJECTED,
        confidence=_confidence(khata),
        validation_errors=khata.validation_errors or [],
        audit_entries_written=1,
        ledger_head=ledger.get("head", ""),
        committed=False,
        message="Record rejected and returned to the record room.",
    )
