"""ORM mapping. Column definitions mirror migrations/001_init_schema.sql exactly;
the SQL file remains the source of truth for DDL."""

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from geoalchemy2 import Geometry
from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

JSONType = JSONB().with_variant(JSON(), "sqlite")


class ProcessingStatus(str, enum.Enum):
    QUEUED = "QUEUED"
    PREPROCESSING = "PREPROCESSING"
    EXTRACTING = "EXTRACTING"
    VALIDATING = "VALIDATING"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    COMMITTED = "COMMITTED"
    FAILED = "FAILED"


class ApprovalStatus(str, enum.Enum):
    PENDING = "PENDING"
    AUTO_APPROVED = "AUTO_APPROVED"
    MANUALLY_APPROVED = "MANUALLY_APPROVED"
    REJECTED = "REJECTED"


class RelationType(str, enum.Enum):
    SON_OF = "S/o"
    DAUGHTER_OF = "D/o"
    WIFE_OF = "W/o"
    CARE_OF = "C/o"


class ActorRole(str, enum.Enum):
    PATWARI = "PATWARI"
    TEHSILDAR = "TEHSILDAR"
    SYSTEM = "SYSTEM"


def _uuid_col(**kw):
    return mapped_column(UUID(as_uuid=True), default=uuid.uuid4, **kw)


class User(Base):
    """A person who signs in to the reviewer console. The role reuses the same
    `actor_role` enum the audit ledger records against, so whoever is signed in
    is exactly who the ledger names for every correction they make."""

    __tablename__ = "users"

    user_id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    # Stored lower-cased; sign-in is case-insensitive on the login id.
    login_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(160))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[ActorRole] = mapped_column(
        # The enum type is created by migration 001; do not redeclare it here.
        Enum(
            ActorRole,
            name="actor_role",
            values_callable=lambda e: [m.value for m in e],
            create_type=False,
        ),
        default=ActorRole.PATWARI,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Village(Base):
    __tablename__ = "villages"

    village_code: Mapped[str] = mapped_column(String(16), primary_key=True)
    village_name: Mapped[str] = mapped_column(String(160))
    tehsil: Mapped[str] = mapped_column(String(120))
    district: Mapped[str] = mapped_column(String(120))
    state: Mapped[str] = mapped_column(String(120))
    default_unit: Mapped[str] = mapped_column(String(32), default="hectare")
    boundary_geom = mapped_column(Geometry("POLYGON", srid=4326), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Document(Base):
    __tablename__ = "documents"

    document_id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    storage_path: Mapped[str] = mapped_column(String(512))
    file_hash_sha256: Mapped[str] = mapped_column(String(64), unique=True)
    mime_type: Mapped[str] = mapped_column(String(100))
    page_count: Mapped[int] = mapped_column(Integer, default=1)
    processing_status: Mapped[ProcessingStatus] = mapped_column(
        Enum(ProcessingStatus, name="processing_status", values_callable=lambda e: [m.value for m in e]),
        default=ProcessingStatus.QUEUED,
    )
    current_step: Mapped[str | None] = mapped_column(String(80), nullable=True)
    progress_pct: Mapped[int] = mapped_column(SmallInteger, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    uploaded_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    village_code: Mapped[str | None] = mapped_column(
        String(16), ForeignKey("villages.village_code"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    khatas: Mapped[list["KhataRecord"]] = relationship(
        back_populates="document", cascade="all, delete-orphan", lazy="selectin"
    )


class KhataRecord(Base):
    __tablename__ = "khata_records"

    khata_id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.document_id", ondelete="CASCADE")
    )
    village_code: Mapped[str | None] = mapped_column(
        String(16), ForeignKey("villages.village_code"), nullable=True
    )
    khata_number: Mapped[str] = mapped_column(String(64))
    fasli_year: Mapped[str | None] = mapped_column(String(16), nullable=True)
    total_area_sqm: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=0)
    declared_unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    declared_area: Mapped[Decimal | None] = mapped_column(Numeric(14, 4), nullable=True)
    confidence_score: Mapped[float] = mapped_column(Float, default=0.0)
    ocr_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    layout_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    math_checks_pass: Mapped[float] = mapped_column(Float, default=0.0)
    approval_status: Mapped[ApprovalStatus] = mapped_column(
        Enum(ApprovalStatus, name="approval_status", values_callable=lambda e: [m.value for m in e]),
        default=ApprovalStatus.PENDING,
    )
    validation_errors = mapped_column(JSONType, default=list)
    reviewed_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    document: Mapped[Document] = relationship(back_populates="khatas")
    village: Mapped[Village | None] = relationship(lazy="selectin")
    parcels: Mapped[list["KhasraParcel"]] = relationship(
        back_populates="khata", cascade="all, delete-orphan", lazy="selectin"
    )
    owners: Mapped[list["OwnershipDetail"]] = relationship(
        back_populates="khata", cascade="all, delete-orphan", lazy="selectin"
    )


class KhasraParcel(Base):
    __tablename__ = "khasra_parcels"

    parcel_id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    khata_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("khata_records.khata_id", ondelete="CASCADE")
    )
    khasra_number: Mapped[str] = mapped_column(String(64))
    plot_area_sqm: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=0)
    declared_unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    declared_area: Mapped[Decimal | None] = mapped_column(Numeric(14, 4), nullable=True)
    land_classification: Mapped[str | None] = mapped_column(String(120), nullable=True)
    irrigation_source: Mapped[str | None] = mapped_column(String(120), nullable=True)
    ulpin: Mapped[str | None] = mapped_column(String(14), unique=True, nullable=True)
    parcel_geom = mapped_column(Geometry("MULTIPOLYGON", srid=4326), nullable=True)
    centroid_geom = mapped_column(Geometry("POINT", srid=4326), nullable=True)
    bbox_json = mapped_column(JSONType, nullable=True)
    field_confidence = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    khata: Mapped[KhataRecord] = relationship(back_populates="parcels")


class OwnershipDetail(Base):
    __tablename__ = "ownership_details"
    __table_args__ = (
        CheckConstraint("share_percentage >= 0 AND share_percentage <= 100", name="ck_share_range"),
    )

    owner_id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    khata_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("khata_records.khata_id", ondelete="CASCADE")
    )
    owner_name_vernacular: Mapped[str] = mapped_column(String(255))
    owner_name_en: Mapped[str | None] = mapped_column(String(255), nullable=True)
    relation_type: Mapped[RelationType | None] = mapped_column(
        Enum(RelationType, name="relation_type", values_callable=lambda e: [m.value for m in e]),
        nullable=True,
    )
    relative_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    share_percentage: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    share_fraction: Mapped[str | None] = mapped_column(String(32), nullable=True)
    aadhaar_hash_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    bbox_json = mapped_column(JSONType, nullable=True)
    field_confidence = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    khata: Mapped[KhataRecord] = relationship(back_populates="owners")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    log_id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    khata_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("khata_records.khata_id", ondelete="CASCADE"), nullable=True
    )
    entity_type: Mapped[str] = mapped_column(String(40), default="khata")
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    field_name: Mapped[str] = mapped_column(String(120))
    raw_extracted_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    corrected_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    modified_by_user_id: Mapped[str] = mapped_column(String(120))
    role: Mapped[ActorRole] = mapped_column(
        Enum(ActorRole, name="actor_role", values_callable=lambda e: [m.value for m in e])
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    prev_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    entry_hash: Mapped[str] = mapped_column(String(64))
    timestamp: Mapped[datetime] = mapped_column(
        "timestamp", DateTime(timezone=True), server_default=func.now()
    )
