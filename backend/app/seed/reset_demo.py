"""Put a demo deployment back to its three demo records.

Run inside the backend container:

    python -m app.seed.reset_demo

Deletes every document, Khata, parcel, owner and audit entry, empties the
object store and the review queue, then reloads the demo dataset exactly as
`load_demo` does. Reviewer accounts and villages are kept.

This is for public demo sandboxes only — deploy/vm/setup.sh schedules it
nightly when DEMO_NIGHTLY_RESET=1. It truncates the audit ledger, which the
database otherwise protects: the append-only triggers block UPDATE and DELETE
row by row, and TRUNCATE is the deliberate, whole-table exception. Never run it
against real records.
"""

from __future__ import annotations

from minio.deleteobjects import DeleteObject

from app.core.config import settings
from app.db.session import sync_engine
from app.seed import load_demo
from app.services.storage import BUCKETS, get_store
from app.workers.queue import get_redis

TABLES = "audit_logs, ownership_details, khasra_parcels, khata_records, documents"


def main() -> None:
    with sync_engine.begin() as conn:
        conn.exec_driver_sql(f"TRUNCATE {TABLES} CASCADE")
    print("records cleared")

    store = get_store()
    for bucket in BUCKETS:
        if not store.client.bucket_exists(bucket):
            continue
        objects = [
            DeleteObject(o.object_name)
            for o in store.client.list_objects(bucket, recursive=True)
        ]
        errors = list(store.client.remove_objects(bucket, objects))
        if errors:
            raise RuntimeError(f"could not empty {bucket}: {errors[0]}")
        print(f"{bucket}: {len(objects)} objects removed")

    client = get_redis()
    if client is not None:
        client.delete(settings.HITL_QUEUE_KEY, f"{settings.HITL_QUEUE_KEY}:meta")
        print("review queue emptied")

    load_demo.main()


if __name__ == "__main__":
    main()
