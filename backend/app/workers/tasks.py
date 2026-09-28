"""Ingestion task: scan bytes in, validated Khata record out.

Status is written to the documents row at every stage so the upload screen can
show real progress rather than a spinner, and a failure leaves a readable
message on the record instead of only in a worker log.
"""

from __future__ import annotations

import logging
import tempfile
import uuid
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select

from app.core.config import settings
from app.db.session import SyncSessionLocal
from app.models.land import (
    ActorRole,
    ApprovalStatus,
    AuditLog,
    Document,
    KhasraParcel,
    KhataRecord,
    OwnershipDetail,
    ProcessingStatus,
    RelationType,
    Village,
)
from app.services.audit import GENESIS, compute_entry_hash
from app.services.storage import get_store, preview_path
from app.services.ulpin import generate_ulpin
from app.services.validator import LandRecordValidator
from app.workers.celery_app import celery_app
from app.workers.queue import push_to_hitl_queue

logger = logging.getLogger(__name__)


def _set_status(session, document: Document, status: ProcessingStatus, step: str, pct: int):
    document.processing_status = status
    document.current_step = step
    document.progress_pct = pct
    session.commit()


def _sync_audit(session, khata_id, field, raw, corrected, user, role: ActorRole, reason=None):
    """Synchronous ledger append for the worker path."""
    prev = (
        session.execute(
            select(AuditLog.entry_hash)
            .where(AuditLog.khata_id == khata_id)
            .order_by(AuditLog.timestamp.desc())
            .limit(1)
        ).scalar_one_or_none()
        or GENESIS
    )
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    entry = AuditLog(
        log_id=uuid.uuid4(),
        khata_id=khata_id,
        field_name=field,
        raw_extracted_value=None if raw is None else str(raw),
        corrected_value=None if corrected is None else str(corrected),
        modified_by_user_id=user,
        role=role,
        reason=reason,
        prev_hash=prev,
        entry_hash=compute_entry_hash(
            khata_id, field, None if raw is None else str(raw),
            None if corrected is None else str(corrected), user, role.value,
            now.isoformat(), prev,
        ),
        timestamp=now,
    )
    session.add(entry)
    return entry


@celery_app.task(bind=True, name="app.workers.tasks.process_document", max_retries=2)
def process_document(self, document_id: str) -> dict:
    session = SyncSessionLocal()
    local_path: Path | None = None

    try:
        document = session.execute(
            select(Document).where(Document.document_id == uuid.UUID(document_id))
        ).scalar_one_or_none()
        if document is None:
            return {"document_id": document_id, "error": "document not found"}

        village = None
        if document.village_code:
            village = session.execute(
                select(Village).where(Village.village_code == document.village_code)
            ).scalar_one_or_none()

        _set_status(session, document, ProcessingStatus.PREPROCESSING, "Fetching scan", 5)

        suffix = Path(document.storage_path).suffix or ".pdf"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
            local_path = Path(handle.name)
        get_store().download_to(document.storage_path, local_path)

        # ---------------- CV pipeline ----------------
        from app.services.cv_pipeline import LandRecordPipeline

        def on_step(name: str, pct: int):
            status = {
                "PREPROCESSING": ProcessingStatus.PREPROCESSING,
                "SEGMENTING": ProcessingStatus.PREPROCESSING,
                "EXTRACTING": ProcessingStatus.EXTRACTING,
                "PARSING": ProcessingStatus.EXTRACTING,
            }.get(name, ProcessingStatus.EXTRACTING)
            _set_status(session, document, status, name.title(), pct)

        pipeline = LandRecordPipeline(
            state=village.state if village else None,
            district=village.district if village else None,
        )
        extraction = pipeline.process(local_path, on_step=on_step)
        document.page_count = extraction.get("page_count", 1)

        preview = extraction.pop("preview_png", None)
        if preview:
            try:
                get_store().put_bytes(
                    settings.MINIO_BUCKET_TILES,
                    preview_path(document.document_id).partition("/")[2],
                    preview,
                    "image/png",
                )
            except Exception:  # noqa: BLE001 - a missing preview must not fail the job
                logger.warning("could not store preview for %s", document.document_id, exc_info=True)

        # ---------------- persist ----------------
        _set_status(session, document, ProcessingStatus.VALIDATING, "Running checks", 90)

        khata_payload = extraction["khata"]
        khata = KhataRecord(
            khata_id=uuid.uuid4(),
            document_id=document.document_id,
            village_code=document.village_code,
            khata_number=str(khata_payload.get("khata_number") or "UNREAD"),
            total_area_sqm=Decimal(str(khata_payload.get("total_area_sqm") or 0)),
            ocr_confidence=extraction.get("ocr_confidence", 0.0),
            layout_confidence=extraction.get("layout_confidence", 0.0),
        )
        session.add(khata)
        session.flush()

        parcels = []
        for entry in extraction["parcels"]:
            parcel = KhasraParcel(
                parcel_id=uuid.uuid4(),
                khata_id=khata.khata_id,
                khasra_number=str(entry["khasra_number"]),
                plot_area_sqm=Decimal(str(entry["plot_area_sqm"])),
                land_classification=entry.get("land_classification"),
                bbox_json=entry.get("bbox_json"),
                field_confidence=entry.get("field_confidence", {}),
            )
            # A ULPIN can only be minted once the parcel is georeferenced. Where
            # the village polygon is known we seed from its centroid; otherwise
            # the parcel is committed without one and flagged INFO by the
            # validator until a survey geometry arrives.
            if village is not None and village.boundary_geom is not None:
                try:
                    from geoalchemy2.shape import to_shape

                    centroid = to_shape(village.boundary_geom).centroid
                    parcel.ulpin = generate_ulpin(centroid.y, centroid.x, state=village.state)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("ULPIN generation skipped: %s", exc)
            session.add(parcel)
            parcels.append(parcel)

        owners = []
        for entry in extraction["owners"]:
            owner = OwnershipDetail(
                owner_id=uuid.uuid4(),
                khata_id=khata.khata_id,
                owner_name_vernacular=entry["owner_name_vernacular"],
                relation_type=(
                    RelationType(entry["relation_type"]) if entry.get("relation_type") else None
                ),
                relative_name=entry.get("relative_name"),
                share_percentage=Decimal(str(entry.get("share_percentage") or 0)),
                share_fraction=entry.get("share_fraction"),
                bbox_json=entry.get("bbox_json"),
                field_confidence=entry.get("field_confidence", {}),
            )
            session.add(owner)
            owners.append(owner)

        session.flush()

        # ---------------- validate ----------------
        report = LandRecordValidator().validate(
            {
                "khata": {
                    "khata_number": khata.khata_number,
                    "total_area_sqm": khata.total_area_sqm,
                    "ocr_confidence": khata.ocr_confidence,
                    "layout_confidence": khata.layout_confidence,
                },
                "parcels": [
                    {"khasra_number": p.khasra_number, "plot_area_sqm": p.plot_area_sqm,
                     "ulpin": p.ulpin, "field_confidence": p.field_confidence}
                    for p in parcels
                ],
                "owners": [
                    {"share_percentage": o.share_percentage,
                     "field_confidence": o.field_confidence}
                    for o in owners
                ],
            }
        )

        khata.validation_errors = [f.to_dict() for f in report.findings]
        khata.math_checks_pass = report.math_checks_pass
        khata.confidence_score = report.total_confidence

        if report.is_committable:
            khata.approval_status = ApprovalStatus.AUTO_APPROVED
            document.processing_status = ProcessingStatus.COMMITTED
            document.current_step = "Committed"
            document.progress_pct = 100
            _sync_audit(
                session, khata.khata_id, "approval_status", "PENDING", "AUTO_APPROVED",
                "system", ActorRole.SYSTEM,
                f"Auto-committed at {report.total_confidence:.2%} confidence "
                f"with no critical findings",
            )
        else:
            khata.approval_status = ApprovalStatus.PENDING
            document.processing_status = ProcessingStatus.NEEDS_REVIEW
            document.current_step = "Awaiting review"
            document.progress_pct = 95
            reason = (
                report.critical[0].message if report.critical
                else f"Confidence {report.total_confidence:.2%} is below the "
                     f"{settings.AUTO_COMMIT_THRESHOLD:.0%} threshold"
            )
            _sync_audit(
                session, khata.khata_id, "routing", "AUTO", "NEEDS_REVIEW",
                "system", ActorRole.SYSTEM, reason,
            )
            push_to_hitl_queue(
                str(khata.khata_id), report.total_confidence,
                {"khata_number": khata.khata_number,
                 "critical": len(report.critical),
                 "village": document.village_code},
            )

        session.commit()

        return {
            "document_id": document_id,
            "khata_id": str(khata.khata_id),
            "confidence": report.total_confidence,
            "status": document.processing_status.value,
            "critical_findings": len(report.critical),
            "parcels": len(parcels),
            "owners": len(owners),
        }

    except Exception as exc:  # noqa: BLE001
        logger.exception("ingestion failed for %s", document_id)
        session.rollback()
        try:
            document = session.execute(
                select(Document).where(Document.document_id == uuid.UUID(document_id))
            ).scalar_one_or_none()
            if document:
                document.processing_status = ProcessingStatus.FAILED
                document.current_step = "Failed"
                document.error_message = str(exc)[:1000]
                session.commit()
        except Exception:  # noqa: BLE001
            session.rollback()

        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=20) from exc
        return {"document_id": document_id, "error": str(exc)}

    finally:
        session.close()
        if local_path and local_path.exists():
            local_path.unlink(missing_ok=True)


@celery_app.task(name="app.workers.tasks.healthcheck")
def healthcheck() -> dict:
    return {"worker": "ok"}
