"""GradFiT - Try-On Provider Registry

Factory + registry for the pluggable virtual try-on providers. The runner
calls :func:`get_tryon_provider` instead of hard-coding a single backend.

Routing rules (enforced by :func:`_resolve_provider_name`):

* If the request comes from the Chrome extension (``source=extension``
  flag), pick :data:`settings.TRYON_PROVIDER_EXTENSION` (default
  ``fashn``) for sub-second inference.
* Otherwise, pick :data:`settings.TRYON_PROVIDER` (default
  ``catvton_flux`` -- CatVTON-Flux on the SageMaker endpoint).
* If the chosen provider's credentials are missing, walk
  :data:`settings.TRYON_PROVIDER_FALLBACK_LADDER` and pick the first
  credentialed provider rather than 5xx-ing.

Backwards compatibility: the legacy slug ``hunyuan_vto`` (kept from the
previous, never-shipped Tencent VTO plan) resolves to the same
CatVTON-Flux provider, with a deprecation log so we can clean up DB
rows and old ``.env`` files at our leisure.

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


# Source identifiers passed by the API layer when picking a provider.
TRYON_SOURCE_WEB = "web"
TRYON_SOURCE_EXTENSION = "extension"
TRYON_SOURCE_API = "api"


def _build_fashn_provider() -> TryOnProvider:
    from .fashn import FashnProvider

    return FashnProvider()


def _build_replicate_legacy_provider() -> TryOnProvider:
    from .replicate_legacy import ReplicateLegacyProvider

    return ReplicateLegacyProvider()


def _build_flux_sagemaker_provider() -> TryOnProvider:
    from .flux_sagemaker import FluxSagemakerProvider

    return FluxSagemakerProvider()


def _build_kolors_vto_provider() -> TryOnProvider:
    from .kolors_vto import KolorsVtoProvider

    return KolorsVtoProvider()


def _build_catvton_flux_provider() -> TryOnProvider:
    from .catvton_flux import CatvtonFluxProvider

    return CatvtonFluxProvider()


_PROVIDER_FACTORIES: Dict[str, Callable[[], TryOnProvider]] = {
    "catvton_flux": _build_catvton_flux_provider,
    "kolors_vto": _build_kolors_vto_provider,
    "flux_sagemaker": _build_flux_sagemaker_provider,
    "fashn": _build_fashn_provider,
    "replicate_legacy": _build_replicate_legacy_provider,
}


# Deprecated slugs that resolve to a current factory. Kept around so DB
# rows in ``tryons.provider`` and old ``.env`` files keep working.
_PROVIDER_ALIASES: Dict[str, str] = {
    "hunyuan_vto": "catvton_flux",
}


def _canonical_provider_name(name: str) -> str:
    """Map a deprecated slug to its current canonical name (or itself)."""
    canonical = _PROVIDER_ALIASES.get(name)
    if canonical:
        logger.warning(
            "Provider slug %r is deprecated; using %r. Update TRYON_PROVIDER "
            "and any persisted rows.",
            name,
            canonical,
        )
        return canonical
    return name


# Cached provider instances. Providers are cheap to construct but they
# wrap stateful HTTP/boto3 clients we want to reuse between requests.
_provider_cache: Dict[str, TryOnProvider] = {}


def _instantiate(provider_name: str) -> TryOnProvider:
    canonical = _canonical_provider_name(provider_name)
    if canonical in _provider_cache:
        return _provider_cache[canonical]

    factory = _PROVIDER_FACTORIES.get(canonical)
    if factory is None:
        valid = sorted(set(_PROVIDER_FACTORIES) | set(_PROVIDER_ALIASES))
        raise ValueError(
            f"Unknown TRYON_PROVIDER '{provider_name}'. Valid options: {valid}"
        )

    instance = factory()
    _provider_cache[canonical] = instance
    return instance


def _provider_is_available(name: str) -> bool:
    """Return True when the named provider has the credentials it needs."""
    canonical = _canonical_provider_name(name) if name in _PROVIDER_ALIASES else name
    if canonical == "fashn":
        return bool((settings.FASHN_API_KEY or "").strip())
    if canonical in {"flux_sagemaker", "catvton_flux"}:
        return bool((settings.SAGEMAKER_ENDPOINT_NAME or "").strip())
    if canonical in {"replicate_legacy", "kolors_vto"}:
        return bool((settings.REPLICATE_API_TOKEN or "").strip())
    return False


def _fallback_ladder() -> list[str]:
    raw = (settings.TRYON_PROVIDER_FALLBACK_LADDER or "").strip()
    if not raw:
        return ["catvton_flux", "kolors_vto", "fashn", "flux_sagemaker"]
    out: list[str] = []
    for slug in raw.split(","):
        s = slug.strip().lower()
        if not s:
            continue
        canonical = _PROVIDER_ALIASES.get(s, s)
        if canonical in _PROVIDER_FACTORIES and canonical not in out:
            out.append(canonical)
    return out


def _resolve_provider_name(
    *, override: Optional[str], source: Optional[str]
) -> str:
    """Pick the active provider given an optional override and request source."""
    if override:
        return _canonical_provider_name(override.strip().lower())

    src = (source or "").strip().lower()
    if src == TRYON_SOURCE_EXTENSION:
        candidate = (settings.TRYON_PROVIDER_EXTENSION or "fashn").strip().lower()
    else:
        candidate = (settings.TRYON_PROVIDER or "catvton_flux").strip().lower()
    candidate = _canonical_provider_name(candidate)

    if _provider_is_available(candidate):
        return candidate

    # Fallback ladder when the chosen provider lacks credentials. Walk the
    # configured ladder in order and pick the first one with credentials.
    for fallback in _fallback_ladder():
        if fallback != candidate and _provider_is_available(fallback):
            logger.warning(
                "Provider %s unavailable (missing creds); falling back to %s",
                candidate,
                fallback,
            )
            return fallback

    # Nothing is configured -- return the original candidate so the
    # downstream provider raises a precise ProviderError on .run().
    logger.error(
        "No try-on provider has credentials configured; staying on %s",
        candidate,
    )
    return candidate


def get_tryon_provider(
    override: Optional[str] = None,
    *,
    source: Optional[str] = None,
) -> TryOnProvider:
    """Return the active try-on provider instance.

    Args:
        override: Optional provider slug to override env-derived selection.
            Typically supplied via the ``X-TryOn-Provider`` request header
            so QA can compare backends without redeploying.
        source: Request origin (``web``, ``extension``, ``api``). Drives
            the extension fast-path routing rule.
    """
    name = _resolve_provider_name(override=override, source=source)
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
    "TRYON_SOURCE_WEB",
    "TRYON_SOURCE_EXTENSION",
    "TRYON_SOURCE_API",
    "get_tryon_provider",
    "reset_provider_cache",
]
