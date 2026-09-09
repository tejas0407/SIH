-- =====================================================================
-- SIH26018 — Intelligent Land Record Digitization and Validation System
-- Migration 002: reviewer accounts for the sign-in flow.
-- Runs after 001 (docker-entrypoint-initdb.d applies files in name order).
-- =====================================================================

-- ---------------------------------------------------------------------
-- users — who may sign in to the reviewer console
-- ---------------------------------------------------------------------
-- `role` reuses the actor_role enum from 001 so the person signed in is
-- exactly the actor the audit ledger records against.
CREATE TABLE users (
    user_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    login_id      VARCHAR(64)  NOT NULL,
    display_name  VARCHAR(160) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,          -- bcrypt
    role          actor_role   NOT NULL DEFAULT 'PATWARI',
    is_active     BOOLEAN      NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_users_login_id UNIQUE (login_id)
);

CREATE INDEX idx_users_login_id ON users (login_id);
