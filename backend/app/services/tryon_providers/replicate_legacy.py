"""GradFiT - Legacy Replicate Pipeline Provider

Adapter that exposes the existing 5-stage Replicate pipeline behind the
:class:`TryOnProvider` interface. Lets us keep the old code path alive for
A/B comparisons (``X-TryOn-Provider: replicate_legacy``) without splitting
the runner into "old" and "new" branches.

This shim intentionally stays thin: it forwards args to
:meth:`PipelineService.run_full_pipeline`, then maps its dict back into a
:class:`ProviderResult`. Stage callbacks emitted by the legacy pipeline
(garment_extracting, stage1_processing, etc.) are forwarded *unchanged*
through ``on_progress`` because the runner already understands them.
"""

from __future__ import annotations

import logging
from typing import Optional

from app.services.pipeline import get_pipeline_service

from .base import (
    ProgressCallback,
    ProviderError,
    ProviderResult,
    TryOnProvider,
)

logger = logging.getLogger(__name__)


class ReplicateLegacyProvider(TryOnProvider):
    """Wraps :class:`PipelineService` so the legacy multi-stage pipeline
    can be selected via ``TRYON_PROVIDER=replicate_legacy``."""

    name = "replicate_legacy"

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
        pipeline = get_pipeline_service()

        def _stage_callback(stage_name: str) -> None:
            if on_progress:
                on_progress(stage_name)

        try:
            result = pipeline.run_full_pipeline(
                person_image_url=person_image_url,
                garment_image_url=garment_image_url,
                garment_description=garment_description or "a garment",
                garment_category=garment_category,
                quality=quality,
                preprocessed_garment_url=None,
                on_stage_update=_stage_callback,
                on_artifact_update=None,
            )
        except Exception as exc:  # pragma: no cover - defensive
            raise ProviderError(
                f"Legacy Replicate pipeline failed: {exc}",
                provider=self.name,
                retryable=False,
            ) from exc

        final_url = result.get("final_url") or result.get("stage1_url")
        if not final_url:
            raise ProviderError(
                "Legacy Replicate pipeline returned no result image",
                provider=self.name,
                retryable=False,
                details={"raw": result},
            )

        provider_meta = {
            "provider": self.name,
            "quality": result.get("quality"),
            "stages_run": result.get("stages_run", {}),
            "stage_status": result.get("stage_status", {}),
            "extracted_garment_url": result.get("extracted_garment_url"),
            "stage1_url": result.get("stage1_url"),
            "final_url": result.get("final_url"),
            "quality_gate_score": result.get("quality_gate_score"),
            "quality_gate_metrics": result.get("quality_gate_metrics"),
            "quality_gate_passed": result.get("quality_gate_passed"),
            "rating_score": result.get("rating_score"),
        }

        timings = {
            k: float(v)
            for k, v in (result.get("timings") or {}).items()
            if isinstance(v, (int, float))
        }

        return ProviderResult(
            result_image_url=final_url,
            candidate_image_urls=[final_url],
            provider_meta=provider_meta,
            cost_estimate_usd=None,
            timings=timings,
            seed=None,
        )


__all__ = ["ReplicateLegacyProvider"]
