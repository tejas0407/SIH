"""Celery application.

The CV pipeline is CPU-heavy and can take tens of seconds on a degraded scan,
so it runs out-of-process. `worker_prefetch_multiplier=1` keeps a single slow
document from blocking a queue of fast ones on the same worker.
"""

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "dilrmp",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Kolkata",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_time_limit=900,
    task_soft_time_limit=840,
    result_expires=86400,
    task_default_queue="ingestion",
)
