#!/usr/bin/env bash
# One-shot: waits for Postgres and MinIO, creates the database, applies the
# schema and loads the demo records. Runs under supervisord at every boot;
# the marker file makes a supervisord-level restart a no-op.
set -euo pipefail

marker="$DATA_DIR/.seeded"
[[ -f "$marker" ]] && { echo "bootstrap: already seeded"; exit 0; }

export PGPASSWORD="$POSTGRES_PASSWORD"

until pg_isready -h 127.0.0.1 -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres -q; do sleep 1; done
until curl -sf http://127.0.0.1:9000/minio/health/live >/dev/null; do sleep 1; done

if ! psql -h 127.0.0.1 -U "$POSTGRES_USER" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$POSTGRES_DB'" | grep -q 1; then
  createdb -h 127.0.0.1 -U "$POSTGRES_USER" "$POSTGRES_DB"
fi

python -c "from app.services.storage import get_store; get_store().ensure_buckets()"
python -m app.seed.migrate
python -m app.seed.load_demo

touch "$marker"
echo "bootstrap: demo data ready"
