"""
GradFiT - Cache Service

Provides a small cache abstraction for pipeline artifacts.
Uses Redis when available and falls back to in-process memory.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

import redis

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class _MemoryEntry:
    value: Any
    expires_at: float


class CacheService:
    """Small cache adapter for JSON-serializable values."""

    def __init__(self) -> None:
        self._memory_store: Dict[str, _MemoryEntry] = {}
        self._redis: Optional[redis.Redis] = None

        if settings.ENABLE_CACHING:
            try:
                self._redis = redis.Redis.from_url(
                    settings.REDIS_URL,
                    socket_timeout=0.8,
                    socket_connect_timeout=0.8,
                    decode_responses=True,
                )
                self._redis.ping()
                logger.info("CacheService: Redis cache enabled")
            except Exception as exc:
                logger.warning(
                    "CacheService: Redis unavailable, using memory cache only (%s)",
                    exc,
                )

    def get_json(self, key: str) -> Any:
        """Get a JSON value from cache or return None if missing/expired."""
        if self._redis:
            try:
                payload = self._redis.get(key)
                if payload is None:
                    return None
                return json.loads(payload)
            except Exception as exc:
                logger.debug("CacheService: Redis get failed for %s (%s)", key, exc)

        entry = self._memory_store.get(key)
        if not entry:
            return None

        if time.time() >= entry.expires_at:
            self._memory_store.pop(key, None)
            return None

        return entry.value

    def set_json(self, key: str, value: Any, ttl_seconds: int) -> None:
        """Store a JSON-serializable value in cache."""
        if ttl_seconds <= 0:
            return

        if self._redis:
            try:
                self._redis.setex(key, ttl_seconds, json.dumps(value))
            except Exception as exc:
                logger.debug("CacheService: Redis set failed for %s (%s)", key, exc)

        self._memory_store[key] = _MemoryEntry(
            value=value,
            expires_at=time.time() + ttl_seconds,
        )


_cache_service: Optional[CacheService] = None


def get_cache_service() -> CacheService:
    """Get singleton cache service."""
    global _cache_service
    if _cache_service is None:
        _cache_service = CacheService()
    return _cache_service


__all__ = ["CacheService", "get_cache_service"]
