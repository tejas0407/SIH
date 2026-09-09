"""Typed contracts shared by the API, the Celery pipeline and the frontend.

The frontend's TypeScript interfaces in `frontend/lib/types.ts` are kept in
step with these models by hand; the JSON schema at /openapi.json is the
reference if they ever drift.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.land import ActorRole, ApprovalStatus, ProcessingStatus


class BoundingBox(BaseModel):
    """Word/row level box in page pixel coordinates at 300 DPI."""

    page: int = 0
    ymin: int
    xmin: int
    ymax: int
    xmax: int


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------
# Extraction DTOs (populated by EntityExtractor)
# --------------------------------------------------------------------
class KhataNumber(BaseModel):
    value: str
    confidence: float = 0.0
    bbox: BoundingBox | None = None


class LandArea(BaseModel):
    value_sqm: Decimal
    declared_value: Decimal | None = None
    declared_unit: str | None = None
    confidence: float = 0.0

    @field_validator("value_sqm")
    @classmethod
    def non_negative(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("area cannot be negative")
        return v


class KhasraEntry(BaseModel):
    khasra_number: str
    plot_area_sqm: Decimal
    land_classification: str | None = None
    irrigation_source: str | None = None
    ulpin: str | None = None
    bbox_json: BoundingBox | None = None
    field_confidence: dict[str, float] = Field(default_factory=dict)


class KhasraList(BaseModel):
    entries: list[KhasraEntry] = Field(default_factory=list)


class OwnerEntry(BaseModel):
    owner_name_vernacular: str
    owner_name_en: str | None = None
    relation_type: Literal["S/o", "D/o", "W/o", "C/o"] | None = None
    relative_name: str | None = None
    share_percentage: Decimal = Decimal("0")
    share_fraction: str | None = None
    aadhaar_hash_sha256: str | None = None
    bbox_json: BoundingBox | None = None
    field_confidence: dict[str, float] = Field(default_factory=dict)


class OwnerRegistry(BaseModel):
    owners: list[OwnerEntry] = Field(default_factory=list)

    @property
    def total_share(self) -> Decimal:
        return sum((o.share_percentage for o in self.owners), Decimal("0"))


# --------------------------------------------------------------------
# Documents
# --------------------------------------------------------------------
class UploadResponse(BaseModel):
    job_id: str
    document_id: uuid.UUID
    storage_path: str
    file_hash_sha256: str
    processing_status: ProcessingStatus
    duplicate_of: uuid.UUID | None = Field(
        default=None,
        description="Set when this exact file was already ingested; no new job is queued.",
    )


class DocumentStatus(ORMModel):
    document_id: uuid.UUID
    original_filename: str
    processing_status: ProcessingStatus
    current_step: str | None = None
    progress_pct: int = 0
    page_count: int = 1
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime
    khata_ids: list[uuid.UUID] = Field(default_factory=list)


# --------------------------------------------------------------------
# Validation
# --------------------------------------------------------------------
class ValidationFinding(BaseModel):
    code: str
    severity: Literal["CRITICAL", "WARNING", "INFO"]
    message: str
    field_path: str
    observed: Any = None
    expected: Any = None
    delta: Any = None


class ConfidenceBreakdown(BaseModel):
    ocr_confidence: float
    layout_confidence: float
    math_checks_pass: float
    total_confidence: float
    threshold: float


# --------------------------------------------------------------------
# HITL
# --------------------------------------------------------------------
class ParcelOut(ORMModel):
    parcel_id: uuid.UUID
    khasra_number: str
    plot_area_sqm: Decimal
    declared_unit: str | None = None
    declared_area: Decimal | None = None
    land_classification: str | None = None
    irrigation_source: str | None = None
    ulpin: str | None = None
    bbox_json: dict | None = None
    field_confidence: dict[str, float] = Field(default_factory=dict)


class OwnerOut(ORMModel):
    owner_id: uuid.UUID
    owner_name_vernacular: str
    owner_name_en: str | None = None
    relation_type: str | None = None
    relative_name: str | None = None
    share_percentage: Decimal
    share_fraction: str | None = None
    bbox_json: dict | None = None
    field_confidence: dict[str, float] = Field(default_factory=dict)


class VillageOut(ORMModel):
    village_code: str
    village_name: str
    tehsil: str
    district: str
    state: str


class QueueItem(BaseModel):
    khata_id: uuid.UUID
    khata_number: str
    document_id: uuid.UUID
    village: VillageOut | None = None
    confidence_score: float
    critical_error_count: int
    top_error: str | None = None
    parcel_count: int
    created_at: datetime


class QueuePage(BaseModel):
    items: list[QueueItem]
    total: int
    page: int
    page_size: int


class AuditEntry(ORMModel):
    log_id: uuid.UUID
    field_name: str
    raw_extracted_value: str | None = None
    corrected_value: str | None = None
    modified_by_user_id: str
    role: ActorRole
    reason: str | None = None
    entry_hash: str
    timestamp: datetime


class KhataDetail(BaseModel):
    khata_id: uuid.UUID
    document_id: uuid.UUID
    khata_number: str
    fasli_year: str | None = None
    total_area_sqm: Decimal
    declared_unit: str | None = None
    approval_status: ApprovalStatus
    confidence: ConfidenceBreakdown
    village: VillageOut | None = None
    parcels: list[ParcelOut]
    owners: list[OwnerOut]
    validation_errors: list[ValidationFinding]
    document_url: str | None = None
    page_count: int = 1
    audit_trail: list[AuditEntry] = Field(default_factory=list)


# --------------------------------------------------------------------
# Verification payload
# --------------------------------------------------------------------
class ParcelCorrection(BaseModel):
    parcel_id: uuid.UUID | None = None
    khasra_number: str
    plot_area_sqm: Decimal
    declared_unit: str | None = None
    declared_area: Decimal | None = None
    land_classification: str | None = None
    delete: bool = False


class OwnerCorrection(BaseModel):
    owner_id: uuid.UUID | None = None
    owner_name_vernacular: str
    owner_name_en: str | None = None
    relation_type: Literal["S/o", "D/o", "W/o", "C/o"] | None = None
    relative_name: str | None = None
    share_percentage: Decimal
    aadhaar: str | None = Field(default=None, description="Hashed on receipt, never stored raw")
    delete: bool = False


class VerifyRequest(BaseModel):
    khata_number: str
    fasli_year: str | None = None
    total_area_sqm: Decimal
    declared_unit: str | None = None
    parcels: list[ParcelCorrection] = Field(default_factory=list)
    owners: list[OwnerCorrection] = Field(default_factory=list)
    # Kept for backward compatibility; the server now takes the actor and role
    # from the signed-in session and ignores whatever the body claims here.
    reviewer_id: str | None = None
    role: ActorRole | None = None
    reason: str | None = None
    force_approve: bool = Field(
        default=False,
        description="Tehsildar override: commit despite remaining critical findings.",
    )


class VerifyResponse(BaseModel):
    khata_id: uuid.UUID
    approval_status: ApprovalStatus
    confidence: ConfidenceBreakdown
    validation_errors: list[ValidationFinding]
    audit_entries_written: int
    ledger_head: str
    committed: bool
    message: str
