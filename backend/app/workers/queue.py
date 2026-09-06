"""Redis HITL dispatch queue.

Postgres holds the authoritative review list; Redis holds a sorted set scored by
confidence so a reviewer console can pop the least trustworthy record without
scanning the table. Every function degrades to a no-op if Redis is unreachable —
the queue is an accelerator, never a dependency for correctness.
"""

from __future__ import annotations

import json
import logging

import redis

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: redis.Redis | None = None


def get_redis() -> redis.Redis | None:
    global _client
    if _client is None:
        try:
            _client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
            _client.ping()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis unavailable, HITL queue disabled: %s", exc)
            _client = None
    return _client


def push_to_hitl_queue(khata_id: str, confidence: float, meta: dict | None = None) -> bool:
    client = get_redis()
    if client is None:
        return False
    try:
        pipe = client.pipeline()
        pipe.zadd(settings.HITL_QUEUE_KEY, {khata_id: confidence})
        if meta:
            pipe.hset(
                f"{settings.HITL_QUEUE_KEY}:meta", khata_id,
                json.dumps(meta, ensure_ascii=False, default=str),
            )
        pipe.execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("could not enqueue %s: %s", khata_id, exc)
        return False


def remove_from_hitl_queue(khata_id: str) -> bool:
    client = get_redis()
    if client is None:
        return False
    try:
        client.zrem(settings.HITL_QUEUE_KEY, khata_id)
        client.hdel(f"{settings.HITL_QUEUE_KEY}:meta", khata_id)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("could not dequeue %s: %s", khata_id, exc)
        return False


def queue_depth() -> int:
    client = get_redis()
    if client is None:
        return 0
    try:
        return int(client.zcard(settings.HITL_QUEUE_KEY))
    except Exception:  # noqa: BLE001
        return 0


def peek_queue(limit: int = 20) -> list[tuple[str, float]]:
    """Least confident first."""
    client = get_redis()
    if client is None:
        return []
    try:
        return client.zrange(settings.HITL_QUEUE_KEY, 0, limit - 1, withscores=True)
    except Exception:  # noqa: BLE001
        return []
