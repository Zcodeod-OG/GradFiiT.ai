"""GradFiT - Kolors Virtual Try-On Provider (Replicate).

Specialized VTO model from Kuaishou's Kling team. Compared to FLUX inpaint,
the model bakes garment-image-conditioning into attention layers, so it
preserves prints/logos/seams better and runs in ~4-8s instead of 12-25s.

Routing: this provider is the second slot on the web fallback ladder
(after self-hosted catvton_flux). Surfaces via Replicate so we get
zero-ops scaling without provisioning a new SageMaker endpoint while we
benchmark quality against fashn/catvton_flux.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

import replicate
from replicate.exceptions import ReplicateError

from app.config import settings

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


# Kolors uses a small enum for garment placement that doesn't perfectly
# overlap with our internal taxonomy. Mapping mirrors fashn.py for
# consistency across providers.
_CATEGORY_MAP = {
    "upperbody": "upper",
    "upper_body": "upper",
    "top": "upper",
    "tops": "upper",
    "shirt": "upper",
    "tshirt": "upper",
    "t-shirt": "upper",
    "lowerbody": "lower",
    "lower_body": "lower",
    "bottom": "lower",
    "bottoms": "lower",
    "pants": "lower",
    "skirt": "lower",
    "shorts": "lower",
    "dress": "dress",
    "dresses": "dress",
    "one_piece": "dress",
    "one-piece": "dress",
    "jumpsuit": "dress",
    "full": "dress",
    "fullbody": "dress",
}


_TERMINAL_SUCCESS = {"succeeded"}
_TERMINAL_FAILURE = {"failed", "canceled"}


class KolorsVtoProvider(TryOnProvider):
    """Kling Kolors Virtual Try-On via Replicate."""

    name = "kolors_vto"

    def __init__(self) -> None:
        self._poll_interval = max(0.5, float(settings.KOLORS_VTO_POLL_INTERVAL_SECONDS))
        self._max_wait = max(15, int(settings.KOLORS_VTO_MAX_WAIT_SECONDS))

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
        token = (settings.REPLICATE_API_TOKEN or "").strip()
        if not token:
            raise ProviderError(
                "REPLICATE_API_TOKEN is not configured",
                provider=self.name,
                retryable=False,
            )

        if on_progress:
            on_progress(PROVIDER_STAGE_QUEUED)

        client = replicate.Client(api_token=token)
        model_ref = (settings.KOLORS_VTO_MODEL or "").strip()
        if not model_ref:
            raise ProviderError(
                "KOLORS_VTO_MODEL is not configured",
                provider=self.name,
                retryable=False,
            )

        # Build inputs. The Replicate Kolors-VTO contract accepts
        # human_img/garm_img + garment_des; quality lane drives sample count.
        category = _CATEGORY_MAP.get((garment_category or "").strip().lower(), "upper")
        num_samples = self._num_samples_for_quality(quality)

        inputs: Dict[str, Any] = {
            "human_img": person_image_url,
            "garm_img": garment_image_url,
            "category": category,
        }
        if garment_description:
            inputs["garment_des"] = garment_description[:300]

        timings: Dict[str, float] = {}
        submit_started = time.time()

        try:
            prediction = self._create_prediction(client, model_ref, inputs)
        except ReplicateError as exc:
            raise ProviderError(
                f"Kolors-VTO prediction.create failed: {exc}",
                provider=self.name,
                retryable=self._is_retryable_replicate_error(exc),
            ) from exc

        timings["submit_seconds"] = round(time.time() - submit_started, 2)
        logger.info(
            "Kolors-VTO prediction created: id=%s lane=%s category=%s",
            prediction.id,
            quality,
            category,
        )

        if on_progress:
            on_progress(PROVIDER_STAGE_PROCESSING)

        wait_started = time.time()
        outputs, raw_status = self._wait(prediction, client)
        timings["wait_seconds"] = round(time.time() - wait_started, 2)
        timings["total_seconds"] = round(
            timings["submit_seconds"] + timings["wait_seconds"], 2
        )

        if not outputs:
            raise ProviderError(
                "Kolors-VTO returned no output URLs",
                provider=self.name,
                retryable=True,
                details={"prediction_id": prediction.id, "raw_status": raw_status},
            )

        best_url = outputs[0]

        if on_progress:
            on_progress(PROVIDER_STAGE_COMPLETED)

        provider_meta: Dict[str, Any] = {
            "provider": self.name,
            "model": model_ref,
            "quality": quality,
            "prediction_id": prediction.id,
            "category": category,
            "num_samples": num_samples,
            "raw_status": raw_status,
            "outputs": outputs,
        }

        return ProviderResult(
            result_image_url=best_url,
            candidate_image_urls=outputs,
            provider_meta=provider_meta,
            cost_estimate_usd=self._estimate_cost(num_samples),
            timings=timings,
            seed=None,
        )

    # ── Helpers ───────────────────────────────────────────────

    @staticmethod
    def _num_samples_for_quality(quality: str) -> int:
        lane = (quality or "balanced").lower()
        return {"fast": 1, "balanced": 1, "best": 2}.get(lane, 1)

    @staticmethod
    def _create_prediction(
        client: replicate.Client, model_ref: str, inputs: Dict[str, Any]
    ):
        # Replicate accepts both pinned-version (slug:version) and
        # latest-version (slug) refs. predictions.create requires a pinned
        # version, so use models.get(...).predictions.create when only a
        # bare slug was supplied.
        if ":" in model_ref:
            return client.predictions.create(version=model_ref.split(":", 1)[1], input=inputs)
        return client.models.get(model_ref).predictions.create(input=inputs)

    def _wait(self, prediction, client: replicate.Client):
        deadline = time.time() + self._max_wait
        last_status = "starting"
        while True:
            try:
                prediction.reload()
            except ReplicateError as exc:
                if time.time() >= deadline:
                    raise ProviderError(
                        f"Kolors-VTO status reload timed out: {exc}",
                        provider=self.name,
                        retryable=True,
                    ) from exc
                time.sleep(self._poll_interval)
                continue

            status = (prediction.status or "").lower()
            last_status = status

            if status in _TERMINAL_SUCCESS:
                outputs = self._normalize_output(prediction.output)
                return outputs, {
                    "status": status,
                    "logs": (prediction.logs or "")[-1500:] if prediction.logs else None,
                    "metrics": getattr(prediction, "metrics", None),
                }

            if status in _TERMINAL_FAILURE:
                err = getattr(prediction, "error", None) or "unknown error"
                raise ProviderError(
                    f"Kolors-VTO prediction failed: {err}",
                    provider=self.name,
                    retryable=False,
                    details={"status": status, "error": str(err)},
                )

            if time.time() >= deadline:
                raise ProviderError(
                    f"Kolors-VTO did not finish within {self._max_wait}s "
                    f"(last_status={last_status})",
                    provider=self.name,
                    retryable=True,
                    details={"prediction_id": prediction.id, "last_status": last_status},
                )

            time.sleep(self._poll_interval)

    @staticmethod
    def _normalize_output(output: Any) -> List[str]:
        if not output:
            return []
        if isinstance(output, str):
            return [output]
        if isinstance(output, list):
            return [str(item) for item in output if item]
        # Some Replicate models return file objects with a .url attribute.
        url = getattr(output, "url", None)
        if isinstance(url, str):
            return [url]
        return []

    @staticmethod
    def _is_retryable_replicate_error(exc: ReplicateError) -> bool:
        text = str(exc).lower()
        return any(token in text for token in ("status: 429", "throttled", "rate limit", "5"))

    @staticmethod
    def _estimate_cost(num_samples: int) -> Optional[float]:
        # Kolors-VTO on Replicate runs on Nvidia A100 (~$0.0014/s, ~6s per
        # sample). Surface a coarse estimate for telemetry parity with the
        # other providers; finance reconciles against the Replicate dashboard.
        return round(num_samples * 6 * 0.0014, 4)


__all__ = ["KolorsVtoProvider"]
