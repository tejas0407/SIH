-- =====================================================================
-- SIH26018 — Intelligent Land Record Digitization and Validation System
-- Migration 001: base schema, PostGIS spatial columns, audit ledger.
-- Executed automatically by docker-entrypoint-initdb.d on first boot.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- fuzzy match on vernacular owner names

-- ---------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------
CREATE TYPE processing_status AS ENUM (
    'QUEUED', 'PREPROCESSING', 'EXTRACTING', 'VALIDATING',
    'NEEDS_REVIEW', 'COMMITTED', 'FAILED'
);

CREATE TYPE approval_status AS ENUM (
    'PENDING', 'AUTO_APPROVED', 'MANUALLY_APPROVED', 'REJECTED'
);

CREATE TYPE relation_type AS ENUM ('S/o', 'D/o', 'W/o', 'C/o');

CREATE TYPE actor_role AS ENUM ('PATWARI', 'TEHSILDAR', 'SYSTEM');

-- ---------------------------------------------------------------------
-- 1. villages — master geography
-- ---------------------------------------------------------------------
CREATE TABLE villages (
    village_code    VARCHAR(16) PRIMARY KEY,
    village_name    VARCHAR(160) NOT NULL,
    tehsil          VARCHAR(120) NOT NULL,
    district        VARCHAR(120) NOT NULL,
    state           VARCHAR(120) NOT NULL,
    default_unit    VARCHAR(32)  NOT NULL DEFAULT 'hectare',
    boundary_geom   geometry(Polygon, 4326),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_villages_boundary ON villages USING GIST (boundary_geom);
CREATE INDEX idx_villages_district ON villages (state, district, tehsil);

-- ---------------------------------------------------------------------
-- 2. documents — ingestion log
-- ---------------------------------------------------------------------
CREATE TABLE documents (
    document_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_filename VARCHAR(255) NOT NULL,
    storage_path      VARCHAR(512) NOT NULL,
    file_hash_sha256  CHAR(64)     NOT NULL,
    mime_type         VARCHAR(100) NOT NULL,
    page_count        INTEGER      NOT NULL DEFAULT 1,
    processing_status processing_status NOT NULL DEFAULT 'QUEUED',
    current_step      VARCHAR(80),
    progress_pct      SMALLINT     NOT NULL DEFAULT 0,
    error_message     TEXT,
    uploaded_by       VARCHAR(120),
    village_code      VARCHAR(16) REFERENCES villages(village_code),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_documents_hash UNIQUE (file_hash_sha256)
);

CREATE INDEX idx_documents_status ON documents (processing_status, created_at DESC);

-- ---------------------------------------------------------------------
-- 3. khata_records — master Record of Rights
-- ---------------------------------------------------------------------
CREATE TABLE khata_records (
    khata_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id      UUID NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
    village_code     VARCHAR(16) REFERENCES villages(village_code),
    khata_number     VARCHAR(64)  NOT NULL,
    fasli_year       VARCHAR(16),
    total_area_sqm   NUMERIC(12,4) NOT NULL DEFAULT 0,
    declared_unit    VARCHAR(32),
    declared_area    NUMERIC(14,4),
    confidence_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    ocr_confidence   DOUBLE PRECISION NOT NULL DEFAULT 0,
    layout_confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
    math_checks_pass DOUBLE PRECISION NOT NULL DEFAULT 0,
    approval_status  approval_status NOT NULL DEFAULT 'PENDING',
    validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    reviewed_by      VARCHAR(120),
    reviewed_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_khata_per_village UNIQUE (village_code, khata_number, fasli_year)
);

CREATE INDEX idx_khata_review ON khata_records (approval_status, confidence_score);
CREATE INDEX idx_khata_document ON khata_records (document_id);

-- ---------------------------------------------------------------------
-- 4. khasra_parcels — sub-plot records
-- ---------------------------------------------------------------------
CREATE TABLE khasra_parcels (
    parcel_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    khata_id            UUID NOT NULL REFERENCES khata_records(khata_id) ON DELETE CASCADE,
    khasra_number       VARCHAR(64) NOT NULL,
    plot_area_sqm       NUMERIC(12,4) NOT NULL DEFAULT 0,
    declared_unit       VARCHAR(32),
    declared_area       NUMERIC(14,4),
    land_classification VARCHAR(120),
    irrigation_source   VARCHAR(120),
    ulpin               VARCHAR(14) UNIQUE,
    parcel_geom         geometry(MultiPolygon, 4326),
    centroid_geom       geometry(Point, 4326),
    bbox_json           JSONB,          -- {page, ymin, xmin, ymax, xmax, conf}
    field_confidence    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_parcel_geom ON khasra_parcels USING GIST (parcel_geom);
CREATE INDEX idx_parcel_khata ON khasra_parcels (khata_id);
CREATE INDEX idx_parcel_ulpin ON khasra_parcels (ulpin);

-- ---------------------------------------------------------------------
-- 5. ownership_details — landowner mapping
-- ---------------------------------------------------------------------
CREATE TABLE ownership_details (
    owner_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    khata_id              UUID NOT NULL REFERENCES khata_records(khata_id) ON DELETE CASCADE,
    owner_name_vernacular VARCHAR(255) NOT NULL,
    owner_name_en         VARCHAR(255),
    relation_type         relation_type,
    relative_name         VARCHAR(255),
    share_percentage      NUMERIC(5,2) NOT NULL DEFAULT 0,
    share_fraction        VARCHAR(32),          -- as printed, e.g. '1/3'
    aadhaar_hash_sha256   CHAR(64),
    bbox_json             JSONB,
    field_confidence      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_owner_khata ON ownership_details (khata_id);
CREATE INDEX idx_owner_name_trgm ON ownership_details USING GIN (owner_name_vernacular gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 6. audit_logs — immutable verification ledger
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
    log_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    khata_id            UUID REFERENCES khata_records(khata_id) ON DELETE CASCADE,
    entity_type         VARCHAR(40) NOT NULL DEFAULT 'khata',
    entity_id           UUID,
    field_name          VARCHAR(120) NOT NULL,
    raw_extracted_value TEXT,
    corrected_value     TEXT,
    modified_by_user_id VARCHAR(120) NOT NULL,
    role                actor_role NOT NULL,
    reason              TEXT,
    prev_hash           CHAR(64),
    entry_hash          CHAR(64) NOT NULL,
    "timestamp"         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_khata ON audit_logs (khata_id, "timestamp" DESC);

-- The ledger is append-only: block UPDATE and DELETE at the database level so
-- no application bug (or operator) can rewrite a Patwari's verification history.
CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is append-only; % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_documents_touch BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_khata_touch BEFORE UPDATE ON khata_records
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------
-- Reporting view consumed by GET /api/v1/reports/export
-- ---------------------------------------------------------------------
CREATE VIEW v_dilrmp_export AS
SELECT
    k.khata_id,
    k.khata_number,
    v.village_code,
    v.village_name,
    v.tehsil,
    v.district,
    v.state,
    p.khasra_number,
    p.ulpin,
    p.plot_area_sqm,
    p.land_classification,
    k.total_area_sqm,
    k.confidence_score,
    k.approval_status,
    ST_AsGeoJSON(p.parcel_geom)::json AS geometry
FROM khata_records k
JOIN villages v        ON v.village_code = k.village_code
LEFT JOIN khasra_parcels p ON p.khata_id = k.khata_id;
