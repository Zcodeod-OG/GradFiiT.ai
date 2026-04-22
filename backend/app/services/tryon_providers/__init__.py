"""GradFiT - Try-On Provider Registry

Factory + registry for the pluggable virtual try-on providers. The runner
calls :func:`get_tryon_provider` (optionally overridden per-request via the
``X-TryOn-Provider`` header) instead of hard-coding a single backend.

Adding a new provider:

1. Implement a subclass of :class:`TryOnProvider` somewhere under this
   package.
2. Add it to :data:`_PROVIDER_FACTORIES` keyed by its slug.
3. Document the slug in ``backend/app/docs/migration_guide.md``.
"""

from __future__ import annotations

import logging
from typing import Callable, Dict, Optional

from app.config import settings

from .base import (
    PROVIDER_STAGE_COMPLETED,
    PROVIDER_STAGE_PROCESSING,
    PROVIDER_STAGE_QUEUED,
    ProviderError,
    ProviderResult,
    TryOnProvider,
)

logger = logging.getLogger(__name__)


def _build_fashn_provider() -> TryOnProvider:
    from .fashn import FashnProvider

    return FashnProvider()


def _build_replicate_legacy_provider() -> TryOnProvider:
    from .replicate_legacy import ReplicateLegacyProvider

    return ReplicateLegacyProvider()


_PROVIDER_FACTORIES: Dict[str, Callable[[], TryOnProvider]] = {
    "fashn": _build_fashn_provider,
    "replicate_legacy": _build_replicate_legacy_provider,
}


# Cached provider instances. Providers are cheap to construct but they
# wrap stateful HTTP clients we want to reuse between requests.
_provider_cache: Dict[str, TryOnProvider] = {}


def _instantiate(provider_name: str) -> TryOnProvider:
    if provider_name in _provider_cache:
        return _provider_cache[provider_name]

    factory = _PROVIDER_FACTORIES.get(provider_name)
    if factory is None:
        raise ValueError(
            f"Unknown TRYON_PROVIDER '{provider_name}'. "
            f"Valid options: {sorted(_PROVIDER_FACTORIES)}"
        )

    instance = factory()
    _provider_cache[provider_name] = instance
    return instance


def _resolve_provider_name(override: Optional[str]) -> str:
    """Pick the active provider, honoring per-request override and
    falling back to the legacy pipeline when Fashn is selected but
    its API key is missing (so the app keeps generating try-ons rather
    than 5xx-ing in development)."""
    requested = (override or settings.TRYON_PROVIDER or "fashn").strip().lower()

    if requested == "fashn" and not (settings.FASHN_API_KEY or "").strip():
        logger.warning(
            "TRYON_PROVIDER=fashn but FASHN_API_KEY is empty; "
            "falling back to the replicate_legacy provider."
        )
        return "replicate_legacy"

    return requested


def get_tryon_provider(override: Optional[str] = None) -> TryOnProvider:
    """Return the active try-on provider instance.

    Args:
        override: Optional provider slug to override
            ``settings.TRYON_PROVIDER``. Typically supplied via the
            ``X-TryOn-Provider`` request header so QA can compare backends
            without redeploying.
    """
    name = _resolve_provider_name(override)
    return _instantiate(name)


def reset_provider_cache() -> None:
    """Drop cached provider instances (test/admin helper)."""
    _provider_cache.clear()


__all__ = [
    "TryOnProvider",
    "ProviderResult",
    "ProviderError",
    "PROVIDER_STAGE_QUEUED",
    "PROVIDER_STAGE_PROCESSING",
    "PROVIDER_STAGE_COMPLETED",
    "get_tryon_provider",
    "reset_provider_cache",
]
