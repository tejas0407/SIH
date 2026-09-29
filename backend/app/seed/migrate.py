"""One-time schema migration runner for deployments without
docker-entrypoint-initdb.d.

Local `docker compose up` applies backend/migrations/*.sql automatically the
first time the Postgres container boots on an empty data directory, because
docker-compose.yml mounts backend/migrations into
/docker-entrypoint-initdb.d. A managed database (DigitalOcean's, for example)
has no such hook and is never "empty" in that sense, so this script applies
the same SQL files by hand.

It is safe to run on every deploy: each migration is skipped if the table it
is responsible for creating already exists, so a re-run after the first
successful deploy is a no-op.

Run inside the backend image:

    python -m app.seed.migrate

On DigitalOcean, wire this in as a PRE_DEPLOY job (see deploy/digitalocean/app.yaml) so it
runs automatically before each new version goes live. The `postgis` extension
must be enabled on the target database beforehand — on a DigitalOcean Managed
Database this is a one-time toggle under Settings -> Extensions, not
something this script can do for you.
"""

from __future__ import annotations

from pathlib import Path

import psycopg2

from app.core.config import settings

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"

# (sql filename, a table it creates that proves it already ran)
MIGRATIONS: list[tuple[str, str]] = [
    ("001_init_schema.sql", "documents"),
    ("002_users.sql", "users"),
]


def _table_exists(cur, table: str) -> bool:
    cur.execute("SELECT to_regclass(%s) IS NOT NULL", (f"public.{table}",))
    return bool(cur.fetchone()[0])


def main() -> None:
    conn = psycopg2.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        dbname=settings.POSTGRES_DB,
    )
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            for filename, marker_table in MIGRATIONS:
                if _table_exists(cur, marker_table):
                    print(f"{filename}: already applied (table '{marker_table}' exists) — skipping")
                    continue
                sql = (MIGRATIONS_DIR / filename).read_text(encoding="utf-8")
                print(f"{filename}: applying...")
                cur.execute(sql)
                print(f"{filename}: done")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
