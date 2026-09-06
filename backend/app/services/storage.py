"""MinIO object store wrapper.

Scans never touch the application filesystem beyond a short-lived temp copy for
the CV worker; the store is the single source of truth for document bytes.
"""

from __future__ import annotations

import hashlib
import io
import logging
from datetime import timedelta
from pathlib import Path

from minio import Minio
from minio.error import S3Error

from app.core.config import settings

logger = logging.getLogger(__name__)

BUCKETS = (settings.MINIO_BUCKET_RAW, settings.MINIO_BUCKET_TILES, settings.MINIO_BUCKET_CERTS)


class ObjectStore:
    def __init__(self, endpoint: str | None = None):
        self.client = Minio(
            endpoint or settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ROOT_USER,
            secret_key=settings.MINIO_ROOT_PASSWORD,
            secure=settings.MINIO_SECURE,
        )
        # A separate client bound to the browser-reachable host, so presigned
        # URLs handed to the reviewer UI resolve outside the docker network.
        self.public_client = Minio(
            settings.MINIO_PUBLIC_ENDPOINT,
            access_key=settings.MINIO_ROOT_USER,
            secret_key=settings.MINIO_ROOT_PASSWORD,
            secure=settings.MINIO_SECURE,
        )

    def ensure_buckets(self) -> None:
        for bucket in BUCKETS:
            try:
                if not self.client.bucket_exists(bucket):
                    self.client.make_bucket(bucket)
                    logger.info("created bucket %s", bucket)
            except S3Error as exc:
                logger.error("could not provision bucket %s: %s", bucket, exc)
                raise

    def put_bytes(self, bucket: str, object_name: str, data: bytes, content_type: str) -> str:
        self.client.put_object(
            bucket, object_name, io.BytesIO(data), length=len(data), content_type=content_type
        )
        return f"{bucket}/{object_name}"

    def get_bytes(self, bucket: str, object_name: str) -> bytes:
        response = self.client.get_object(bucket, object_name)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def download_to(self, storage_path: str, destination: str | Path) -> Path:
        bucket, _, object_name = storage_path.partition("/")
        destination = Path(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        self.client.fget_object(bucket, object_name, str(destination))
        return destination

    def presigned_url(self, storage_path: str, expires_minutes: int = 60) -> str:
        bucket, _, object_name = storage_path.partition("/")
        return self.public_client.presigned_get_object(
            bucket, object_name, expires=timedelta(minutes=expires_minutes)
        )


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


_store: ObjectStore | None = None


def get_store() -> ObjectStore:
    global _store
    if _store is None:
        _store = ObjectStore()
    return _store
