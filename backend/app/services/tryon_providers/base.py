"""GradFiT - Try-On Provider Interface

Defines the abstract contract every virtual try-on backend must satisfy
(Fashn.ai, future Klingai integration, the legacy Replicate pipeline shim,
etc.). The runner and API layer talk to this single surface so we can
swap providers without touching business logic.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional


# Stage names emitted by providers via the on_progress callback. The runner
# maps these onto TryOnStatus enum values, so the set is intentionally small
# for single-call providers (queued -> processing -> completed). Multi-stage
# providers (the legacy Replicate pipeline) emit the richer set defined in
# tryon_runner.run_tryon_pipeline.
PROVIDER_STAGE_QUEUED = "queued"
PROVIDER_STAGE_PROCESSING = "stage1_processing"
PROVIDER_STAGE_COMPLETED = "stage1_completed"


@dataclass
class ProviderResult:
    """Normalized output every provider returns.

    Attributes:
        result_image_url: Public URL of the final try-on image.
        candidate_image_urls: All candidates the provider produced (best lane
            with num_samples > 1). Always includes ``result_image_url``.
        provider_meta: Free-form bag of provider-specific data we want to
            persist on TryOn.pipeline_metadata for debugging/regeneration.
        cost_estimate_usd: Optional cost estimate in USD; surfaced for
            telemetry and admin dashboards.
        timings: Per-stage timing in seconds (e.g. ``{"submit": 0.3,
            "wait": 9.1}``). Stored on pipeline_metadata.
        seed: Provider-chosen seed (when applicable). Saved so the user can
            re-run "identical" later.
    """

    result_image_url: str
    candidate_image_urls: List[str] = field(default_factory=list)
    provider_meta: Dict[str, Any] = field(default_factory=dict)
    cost_estimate_usd: Optional[float] = None
    timings: Dict[str, float] = field(default_factory=dict)
    seed: Optional[int] = None

    def __post_init__(self) -> None:
        if self.result_image_url and self.result_image_url not in self.candidate_image_urls:
            self.candidate_image_urls.insert(0, self.result_image_url)


class ProviderError(RuntimeError):
    """Unified error type providers raise when a try-on fails.

    Provider-specific exceptions should be wrapped in this class so the
    runner has one error surface to log against.
    """

    def __init__(
        self,
        message: str,
        *,
        provider: str,
        retryable: bool = False,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.provider = provider
        self.retryable = retryable
        self.details = details or {}


# Type alias for the progress callback. Providers should call this with one
# of the PROVIDER_STAGE_* constants whenever the lifecycle moves forward.
ProgressCallback = Callable[[str], None]


class TryOnProvider(ABC):
    """Abstract base class for virtual try-on providers."""

    #: Short human-readable provider name (e.g. ``"fashn"``).
    name: str = "unknown"

    @abstractmethod
    def run(
        self,
        *,
        person_image_url: str,
        garment_image_url: str,
        garment_category: Optional[str],
        garment_description: Optional[str] = None,
        quality: str = "balanced",
        tryon_id: Optional[int] = None,
        on_progress: Optional[ProgressCallback] = None,
    ) -> ProviderResult:
        """Run a virtual try-on synchronously.

        Implementations must block until the try-on is complete (or has
        failed). Long-running calls should still surface intermediate
        progress via ``on_progress``.

        Args:
            person_image_url: Public URL of the model/person photo.
            garment_image_url: Public URL of the garment image (already
                background-removed when applicable).
            garment_category: Optional category hint (``"upperbody"``,
                ``"lowerbody"``, ``"dress"``, ``"full"``). Providers map
                this onto their own taxonomy.
            garment_description: Optional natural-language description.
            quality: Quality lane -- ``"fast"``, ``"balanced"`` or
                ``"best"``.
            tryon_id: Internal TryOn id, used by webhook-aware providers
                to wire callbacks back to the right row.
            on_progress: Optional callback invoked with stage names.

        Returns:
            A ``ProviderResult`` describing the produced image(s).

        Raises:
            ProviderError: When the try-on cannot be produced.
        """


__all__ = [
    "TryOnProvider",
    "ProviderResult",
    "ProviderError",
    "ProgressCallback",
    "PROVIDER_STAGE_QUEUED",
    "PROVIDER_STAGE_PROCESSING",
    "PROVIDER_STAGE_COMPLETED",
]
