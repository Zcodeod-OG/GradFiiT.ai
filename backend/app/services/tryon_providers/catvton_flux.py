"""GradFiT - CatVTON-Flux Try-On Provider (SageMaker tryon_v2).

Wraps the bundled SageMaker serving container's ``tryon_v2`` task, which
runs CatVTON-Flux (xiaozaa/catvton-flux-alpha + black-forest-labs/
FLUX.1-Fill-dev). CatVTON took SOTA on VITON-HD (FID 5.59) at ICLR 2025
and is Apache-2.0-clean for global commercial use, so it replaced the
earlier HunyuanVTO plan that turned out to be aspirational (no published
weights).

Why this provider over flux_sagemaker:
* CatVTON's in-context concat trick preserves prints/logos/textures
  without a ControlNet+IP-Adapter stack on top.
* Inference budget is ~7-10s warm on g5.2xlarge at the balanced lane vs.
  12-25s for FLUX inpaint with the full ControlNet/IP-Adapter chain.

Wire-format mirrors flux_sagemaker so the runner / Celery / API layers
don't need to know which serving task was hit. The provider slug
``hunyuan_vto`` is preserved as a deprecated alias in the registry so
existing rows in the ``tryons.provider`` column and old ``.env`` files
keep resolving.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from app.config import settings
from app.services.sagemaker import (
    SagemakerInferenceError,
    build_output_prefix,
    invoke_sync,
    s3_uri_to_public_url,
)

from .base import (
    PROVIDER_STAGE_COMPLETED,
    PROVIDER_STAGE_PROCESSING,
    PROVIDER_STAGE_QUEUED,
    ProgressCallback,
    ProviderError,
    ProviderResult,
    TryOnProvider,
)

logger = logging.getLogger(__name__)


class CatvtonFluxProvider(TryOnProvider):
    """CatVTON-Flux running on the bundled SageMaker endpoint (tryon_v2)."""

    name = "catvton_flux"

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
        if not settings.SAGEMAKER_ENDPOINT_NAME:
            raise ProviderError(
                "SAGEMAKER_ENDPOINT_NAME is not configured",
                provider=self.name,
                retryable=False,
            )

        scope_id = tryon_id if tryon_id is not None else f"adhoc-{int(time.time())}"
        output_prefix = build_output_prefix(scope="tryon_v2", scope_id=scope_id)

        if on_progress:
            on_progress(PROVIDER_STAGE_QUEUED)

        timings: Dict[str, float] = {}
        submit_started = time.time()
        try:
            result = invoke_sync(
                task=settings.CATVTON_FLUX_TASK or "tryon_v2",
                inputs={
                    "person_image_url": person_image_url,
                    "garment_image_url": garment_image_url,
                    "garment_category": garment_category,
                    "garment_description": garment_description,
                    "output_s3_prefix": output_prefix,
                },
                options=self._options_for_quality(quality),
                request_id=f"tryon-v2-{scope_id}-{int(submit_started)}",
                on_progress=lambda stage: on_progress(stage) if on_progress else None,
            )
        except SagemakerInferenceError as exc:
            raise ProviderError(
                f"CatVTON-Flux SageMaker invocation failed: {exc}",
                provider=self.name,
                retryable=exc.retryable,
                details=exc.details,
            ) from exc

        timings["sagemaker_total_seconds"] = round(time.time() - submit_started, 2)
        if on_progress:
            on_progress(PROVIDER_STAGE_PROCESSING)

        payload = result.payload or {}
        result_s3 = payload.get("result_image_uri")
        if not result_s3:
            raise ProviderError(
                "CatVTON-Flux returned no result_image_uri",
                provider=self.name,
                retryable=True,
                details={"payload": payload},
            )

        result_url = s3_uri_to_public_url(result_s3)

        candidates: List[str] = []
        for cand in payload.get("candidate_image_uris", []) or []:
            if cand:
                candidates.append(s3_uri_to_public_url(cand))
        if result_url not in candidates:
            candidates.insert(0, result_url)

        provider_meta: Dict[str, Any] = {
            "provider": self.name,
            "endpoint": settings.SAGEMAKER_ENDPOINT_NAME,
            "task": settings.CATVTON_FLUX_TASK or "tryon_v2",
            "inference_id": result.inference_id,
            "output_location": result.output_location,
            "result_image_s3": result_s3,
            "metadata": payload.get("metadata", {}),
            "container_timings": payload.get("timings", {}),
            "quality": quality,
        }

        if on_progress:
            on_progress(PROVIDER_STAGE_COMPLETED)

        return ProviderResult(
            result_image_url=result_url,
            candidate_image_urls=candidates,
            provider_meta=provider_meta,
            cost_estimate_usd=self._estimate_cost(payload),
            timings={
                **timings,
                **{
                    f"container_{k}": float(v)
                    for k, v in (payload.get("timings") or {}).items()
                    if isinstance(v, (int, float))
                },
            },
            seed=payload.get("seed"),
        )

    # ── Helpers ───────────────────────────────────────────────────

    @staticmethod
    def _options_for_quality(quality: str) -> Dict[str, Any]:
        lane = (quality or "balanced").lower()
        if lane not in {"fast", "balanced", "best"}:
            lane = "balanced"
        # CatVTON-Flux output is 768x1024; we no longer upscale on the
        # synchronous path. ResultsModal exposes an "Upscale" CTA that
        # hits /api/tryon/{id}/upscale on demand instead.
        return {"quality": lane}

    @staticmethod
    def _estimate_cost(payload: Dict[str, Any]) -> Optional[float]:
        """Best-effort USD estimate based on container timings.

        Same g5.2xlarge as flux_sagemaker (~$0.000422/s). CatVTON-Flux
        balanced-lane runs land in the 7-10s window so per-call cost is
        ~$0.003-0.005.
        """
        timings = payload.get("timings") or {}
        total_ms = timings.get("total_ms") or timings.get("catvton_ms")
        if not isinstance(total_ms, (int, float)):
            return None
        return round((total_ms / 1000.0) * 0.000422, 5)


__all__ = ["CatvtonFluxProvider"]
