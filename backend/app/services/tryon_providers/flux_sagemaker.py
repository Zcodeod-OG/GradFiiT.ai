"""GradFiT - FLUX.1-dev Try-On Provider (SageMaker).

Sends try-on jobs to the bundled GradFiT serving endpoint:
FLUX.1-dev + Clothing LoRA + ControlNet (canny+depth) + SAM2 +
Real-ESRGAN, all running in a single ml.g5.2xlarge container.

Why a dedicated provider class instead of inlining into the runner: it
reuses the abstract ``TryOnProvider`` contract the rest of the codebase
already understands, so the API/Celery/UI layers don't need to know we
swapped the backend. ``X-TryOn-Provider: flux_sagemaker`` (or the env
var ``TRYON_PROVIDER``) is enough to flip between Fashn and FLUX.
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


class FluxSagemakerProvider(TryOnProvider):
    """Bundled FLUX-dev pipeline running on SageMaker async inference."""

    name = "flux_sagemaker"

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
        output_prefix = build_output_prefix(scope="tryon", scope_id=scope_id)

        if on_progress:
            on_progress(PROVIDER_STAGE_QUEUED)

        timings: Dict[str, float] = {}
        submit_started = time.time()
        try:
            result = invoke_sync(
                task="tryon",
                inputs={
                    "person_image_url": person_image_url,
                    "garment_image_url": garment_image_url,
                    "garment_category": garment_category,
                    "garment_description": garment_description,
                    "output_s3_prefix": output_prefix,
                },
                options=self._options_for_quality(quality),
                request_id=f"tryon-{scope_id}-{int(submit_started)}",
                on_progress=lambda stage: on_progress(stage) if on_progress else None,
            )
        except SagemakerInferenceError as exc:
            raise ProviderError(
                f"FLUX SageMaker invocation failed: {exc}",
                provider=self.name,
                retryable=exc.retryable,
                details=exc.details,
            ) from exc

        timings["sagemaker_total_seconds"] = round(time.time() - submit_started, 2)
        if on_progress:
            on_progress(PROVIDER_STAGE_PROCESSING)

        payload = result.payload or {}
        result_s3 = payload.get("result_image_uri")
        raw_s3 = payload.get("raw_image_uri")
        if not result_s3:
            raise ProviderError(
                "FLUX SageMaker returned no result_image_uri",
                provider=self.name,
                retryable=True,
                details={"payload": payload},
            )

        result_url = s3_uri_to_public_url(result_s3)
        raw_url = s3_uri_to_public_url(raw_s3) if raw_s3 else None

        candidates: List[str] = []
        for cand in payload.get("candidate_image_uris", []) or []:
            if cand:
                candidates.append(s3_uri_to_public_url(cand))
        if result_url not in candidates:
            candidates.insert(0, result_url)

        provider_meta: Dict[str, Any] = {
            "provider": self.name,
            "endpoint": settings.SAGEMAKER_ENDPOINT_NAME,
            "inference_id": result.inference_id,
            "output_location": result.output_location,
            "result_image_s3": result_s3,
            "raw_image_s3": raw_s3,
            "raw_image_url": raw_url,
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
            timings={**timings, **{
                f"container_{k}": float(v)
                for k, v in (payload.get("timings") or {}).items()
                if isinstance(v, (int, float))
            }},
            seed=payload.get("seed"),
        )

    # ── Helpers ───────────────────────────────────────────────────

    def _options_for_quality(self, quality: str) -> Dict[str, Any]:
        lane = (quality or "balanced").lower()
        if lane not in {"fast", "balanced", "best"}:
            lane = "balanced"
        upscale = {"fast": 1, "balanced": 2, "best": 4}[lane]
        opts: Dict[str, Any] = {"quality": lane, "upscale": upscale}
        if settings.SAGEMAKER_DEFAULT_LORA_URI:
            opts["lora_uri"] = settings.SAGEMAKER_DEFAULT_LORA_URI
        return opts

    @staticmethod
    def _estimate_cost(payload: Dict[str, Any]) -> Optional[float]:
        """Best-effort USD estimate based on container timings.

        ml.g5.2xlarge is ~$1.52/hr -> $0.000422/s. We bill our internal
        cost telemetry off the container's reported total_ms so we don't
        double count idle warm-up time.
        """
        timings = payload.get("timings") or {}
        total_ms = timings.get("total_ms") or timings.get("flux_ms")
        if not isinstance(total_ms, (int, float)):
            return None
        return round((total_ms / 1000.0) * 0.000422, 5)


__all__ = ["FluxSagemakerProvider"]
