"""Document ingestion endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models.land import Document, ProcessingStatus
from app.schemas.records import DocumentStatus, UploadResponse
from app.services.storage import get_store, sha256_bytes

router = APIRouter(prefix="/documents", tags=["documents"])

ACCEPTED = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/tiff": ".tif",
}
MAX_BYTES = 60 * 1024 * 1024


@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    file: UploadFile = File(..., description="Scanned Jamabandi / 7-12 / Khatauni"),
    village_code: str | None = Form(default=None),
    uploaded_by: str = Form(default="patwari.demo"),
    db: AsyncSession = Depends(get_db),
) -> UploadResponse:
    if file.content_type not in ACCEPTED:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"{file.content_type} is not a supported scan format. "
            f"Upload a PDF, JPEG, PNG or TIFF.",
        )

    payload = await file.read()
    if not payload:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The uploaded file is empty.")
    if len(payload) > MAX_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Scan exceeds the {MAX_BYTES // (1024 * 1024)} MB limit.",
        )

    digest = sha256_bytes(payload)

    # Content-addressed de-duplication: a record room re-scanning the same page
    # should not create a second Khata to review.
    existing = (
        await db.execute(select(Document).where(Document.file_hash_sha256 == digest))
    ).scalar_one_or_none()
    if existing:
        return UploadResponse(
            job_id=str(existing.document_id),
            document_id=existing.document_id,
            storage_path=existing.storage_path,
            file_hash_sha256=digest,
            processing_status=existing.processing_status,
            duplicate_of=existing.document_id,
        )

    document_id = uuid.uuid4()
    extension = ACCEPTED[file.content_type]
    stamp = datetime.now(timezone.utc).strftime("%Y/%m/%d")
    object_name = f"{stamp}/{document_id}{extension}"

    store = get_store()
    store.ensure_buckets()
    storage_path = store.put_bytes(
        settings.MINIO_BUCKET_RAW, object_name, payload, file.content_type
    )

    document = Document(
        document_id=document_id,
        original_filename=file.filename or f"scan{extension}",
        storage_path=storage_path,
        file_hash_sha256=digest,
        mime_type=file.content_type,
        processing_status=ProcessingStatus.QUEUED,
        current_step="Queued for preprocessing",
        uploaded_by=uploaded_by,
        village_code=village_code,
    )
    db.add(document)
    await db.commit()

    from app.workers.tasks import process_document

    task = process_document.delay(str(document_id))

    return UploadResponse(
        job_id=task.id,
        document_id=document_id,
        storage_path=storage_path,
        file_hash_sha256=digest,
        processing_status=ProcessingStatus.QUEUED,
    )


@router.get("/{document_id}/status", response_model=DocumentStatus)
async def get_status(document_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> DocumentStatus:
    document = (
        await db.execute(select(Document).where(Document.document_id == document_id))
    ).scalar_one_or_none()
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No document with that id.")

    return DocumentStatus(
        document_id=document.document_id,
        original_filename=document.original_filename,
        processing_status=document.processing_status,
        current_step=document.current_step,
        progress_pct=document.progress_pct,
        page_count=document.page_count,
        error_message=document.error_message,
        created_at=document.created_at,
        updated_at=document.updated_at,
        khata_ids=[k.khata_id for k in document.khatas],
    )


@router.get("", response_model=list[DocumentStatus])
async def list_documents(limit: int = 25, db: AsyncSession = Depends(get_db)):
    stmt = select(Document).order_by(Document.created_at.desc()).limit(min(limit, 100))
    documents = (await db.execute(stmt)).scalars().all()
    return [
        DocumentStatus(
            document_id=d.document_id,
            original_filename=d.original_filename,
            processing_status=d.processing_status,
            current_step=d.current_step,
            progress_pct=d.progress_pct,
            page_count=d.page_count,
            error_message=d.error_message,
            created_at=d.created_at,
            updated_at=d.updated_at,
            khata_ids=[k.khata_id for k in d.khatas],
        )
        for d in documents
    ]
