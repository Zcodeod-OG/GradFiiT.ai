"""GradFiT - Fashn.ai Try-On Provider

Thin httpx-based client wrapping the Fashn.ai REST API. Sends a single
``/v1/run`` request, then either:

* Returns immediately and lets the runner wait for the configured webhook
  (when ``FASHN_WEBHOOK_URL`` is set) -- not implemented as the default
  here; the runner still calls :meth:`run` and we always poll synchronously
  so the existing thread/Celery model keeps working without architectural
  changes; OR
* Polls ``/v1/status/{id}`` with backoff until the prediction settles.

Quality lane mapping (per the plan):

* ``fast``     -> ``tryon-v1.6`` ``mode=performance``  ``output_format=jpeg``
* ``balanced`` -> ``tryon-v1.6`` ``mode=balanced``     ``output_format=png``
* ``best``     -> ``tryon-max``  ``generation_mode=quality`` ``num_images=N``

We pick the best candidate from a multi-sample run via the CLIP picker in
``tryon_providers/best_picker.py`` (only invoked for the ``best`` lane).
"""

from __future__ import annotations

import logging
import math
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin

import httpx

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


# ── Category mapping ──────────────────────────────────────────
# Fashn's tryon-v1.6 accepts a small enum: auto/tops/bottoms/one-pieces.
# Internally the codebase uses the OOTDiffusion taxonomy (upperbody,
# lowerbody, dress, full). Translate one-way; default to "auto" so the
# model can self-classify when we genuinely don't know.
_CATEGORY_MAP = {
    "upperbody": "tops",
    "upper_body": "tops",
    "top": "tops",
    "tops": "tops",
    "shirt": "tops",
    "tshirt": "tops",
    "t-shirt": "tops",
    "lowerbody": "bottoms",
    "lower_body": "bottoms",
    "bottom": "bottoms",
    "bottoms": "bottoms",
    "pants": "bottoms",
    "skirt": "bottoms",
    "shorts": "bottoms",
    "dress": "one-pieces",
    "dresses": "one-pieces",
    "one_piece": "one-pieces",
    "one-piece": "one-pieces",
    "jumpsuit": "one-pieces",
    "full": "one-pieces",
    "fullbody": "one-pieces",
}


# Polled lifecycle states
_TERMINAL_SUCCESS = {"completed"}
_TERMINAL_FAILURE = {"failed", "canceled", "error"}
_PROCESSING = {"starting", "in_queue", "queued", "processing"}


class FashnProvider(TryOnProvider):
    """Fashn.ai virtual try-on provider."""

    name = "fashn"

    def __init__(self) -> None:
        self._base_url = settings.FASHN_BASE_URL.rstrip("/") + "/"
        self._timeout = settings.FASHN_HTTP_TIMEOUT_SECONDS
        self._poll_interval = max(0.5, float(settings.FASHN_POLL_INTERVAL_SECONDS))
        self._max_wait = max(30, int(settings.FASHN_MAX_WAIT_SECONDS))

        # Cache the client so we reuse the connection pool across runs.
        # Headers/auth are attached per-request because the API key is
        # fetched dynamically (lets ops rotate keys without restart).
        self._client = httpx.Client(timeout=self._timeout)

    # ── Public API ────────────────────────────────────────────

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
        api_key = (settings.FASHN_API_KEY or "").strip()
        if not api_key:
            raise ProviderError(
                "FASHN_API_KEY is not configured",
                provider=self.name,
                retryable=False,
            )

        if on_progress:
            on_progress(PROVIDER_STAGE_QUEUED)

        quality_lane = (quality or "balanced").strip().lower()
        if quality_lane not in {"fast", "balanced", "best"}:
            quality_lane = "balanced"

        model_name, payload, num_outputs = self._build_payload(
            quality_lane=quality_lane,
            person_image_url=person_image_url,
            garment_image_url=garment_image_url,
            garment_category=garment_category,
        )

        params: Dict[str, str] = {}
        webhook_url = self._resolve_webhook_url(tryon_id)
        if webhook_url:
            params["webhook_url"] = webhook_url

        timings: Dict[str, float] = {}
        submit_started = time.time()

        prediction_id = self._submit_run(
            api_key=api_key,
            model_name=model_name,
            payload=payload,
            params=params,
        )
        timings["submit_seconds"] = round(time.time() - submit_started, 2)

        logger.info(
            "Fashn /run accepted: prediction_id=%s lane=%s model=%s webhook=%s",
            prediction_id,
            quality_lane,
            model_name,
            bool(webhook_url),
        )

        if on_progress:
            on_progress(PROVIDER_STAGE_PROCESSING)

        wait_started = time.time()
        outputs, raw_status = self._wait_for_outputs(api_key, prediction_id)
        timings["wait_seconds"] = round(time.time() - wait_started, 2)
        timings["total_seconds"] = round(
            timings["submit_seconds"] + timings["wait_seconds"], 2
        )

        if not outputs:
            raise ProviderError(
                "Fashn returned no output URLs",
                provider=self.name,
                retryable=True,
                details={"prediction_id": prediction_id, "raw": raw_status},
            )

        best_url, best_meta = self._pick_best(
            outputs=outputs,
            garment_image_url=garment_image_url,
            quality_lane=quality_lane,
        )

        if on_progress:
            on_progress(PROVIDER_STAGE_COMPLETED)

        provider_meta: Dict[str, Any] = {
            "provider": self.name,
            "model": model_name,
            "quality": quality_lane,
            "prediction_id": prediction_id,
            "request": payload,
            "raw_status": raw_status,
            "outputs": outputs,
            "best_picker": best_meta,
            "num_outputs": num_outputs,
        }

        return ProviderResult(
            result_image_url=best_url,
            candidate_image_urls=outputs,
            provider_meta=provider_meta,
            cost_estimate_usd=self._estimate_cost(model_name, payload, num_outputs),
            timings=timings,
            seed=payload.get("seed"),
        )

    # ── Helpers ───────────────────────────────────────────────

    def _build_payload(
        self,
        *,
        quality_lane: str,
        person_image_url: str,
        garment_image_url: str,
        garment_category: Optional[str],
    ) -> Tuple[str, Dict[str, Any], int]:
        """Return (model_name, inputs, num_outputs) tuned per lane."""
        output_format = (settings.TRYON_OUTPUT_FORMAT or "png").lower()

        if quality_lane == "best":
            model_name = settings.FASHN_BEST_MODEL or "tryon-max"
            num_outputs = max(1, int(settings.FASHN_BEST_NUM_SAMPLES or 1))
            inputs: Dict[str, Any] = {
                # NOTE: tryon-max uses `product_image` / `model_image` and
                # `num_images` (not the v1.6 `garment_image` / `num_samples`).
                "product_image": garment_image_url,
                "model_image": person_image_url,
                "generation_mode": "quality",
                "resolution": self._resolve_max_resolution(),
                "num_images": num_outputs,
                "output_format": output_format,
            }
            return model_name, inputs, num_outputs

        # fast / balanced -> tryon-v1.6
        model_name = settings.FASHN_DEFAULT_MODEL or "tryon-v1.6"
        mode = "performance" if quality_lane == "fast" else "balanced"
        # Force jpeg on fast for lower latency; otherwise honour the env.
        lane_format = "jpeg" if quality_lane == "fast" else output_format
        # Multi-sample on the balanced lane gives the postprocessor 2
        # candidates to score (CLIP garment + face identity). Fast stays
        # at 1 to keep its latency advantage.
        if quality_lane == "balanced":
            num_outputs = max(1, int(settings.FASHN_BALANCED_NUM_SAMPLES or 1))
        else:
            num_outputs = 1
        inputs = {
            "model_image": person_image_url,
            "garment_image": garment_image_url,
            "mode": mode,
            "category": _CATEGORY_MAP.get(
                (garment_category or "").strip().lower(), "auto"
            ),
            "garment_photo_type": "auto",
            "output_format": lane_format,
            "num_samples": num_outputs,
        }
        return model_name, inputs, num_outputs

    def _resolve_max_resolution(self) -> str:
        """Translate TRYON_OUTPUT_RESOLUTION into a tryon-max tier."""
        raw = (settings.TRYON_OUTPUT_RESOLUTION or "1024").strip().lower()
        # Allow both the v1.6 pixel form ("1024", "2048") and the tryon-max
        # tier form ("1k", "2k", "4k").
        if raw in {"1k", "2k", "4k"}:
            return raw
        try:
            pixels = int(raw)
        except ValueError:
            return "1k"
        if pixels >= 4000:
            return "4k"
        if pixels >= 2000:
            return "2k"
        return "1k"

    def _resolve_webhook_url(self, tryon_id: Optional[int]) -> Optional[str]:
        base = (settings.FASHN_WEBHOOK_URL or "").strip()
        if not base or tryon_id is None:
            return None
        # Allow the env to be either the bare callback host OR the full
        # ".../api/webhooks/fashn" prefix; we suffix the tryon id either way.
        if base.endswith("/"):
            base = base[:-1]
        if base.endswith("/fashn") or "/webhooks/fashn" in base:
            return f"{base}/{tryon_id}"
        return f"{base}/api/webhooks/fashn/{tryon_id}"

    def _submit_run(
        self,
        *,
        api_key: str,
        model_name: str,
        payload: Dict[str, Any],
        params: Dict[str, str],
    ) -> str:
        url = urljoin(self._base_url, "run")
        body = {"model_name": model_name, "inputs": payload}
        try:
            response = self._client.post(
                url,
                json=body,
                params=params or None,
                headers=self._auth_headers(api_key),
            )
        except httpx.HTTPError as exc:
            raise ProviderError(
                f"Fashn /run network error: {exc}",
                provider=self.name,
                retryable=True,
            ) from exc

        if response.status_code >= 400:
            raise ProviderError(
                f"Fashn /run rejected request ({response.status_code}): "
                f"{response.text[:500]}",
                provider=self.name,
                retryable=response.status_code in {429, 502, 503, 504},
                details={"status_code": response.status_code, "body": response.text},
            )

        try:
            data = response.json()
        except ValueError as exc:
            raise ProviderError(
                "Fashn /run returned invalid JSON",
                provider=self.name,
                retryable=True,
            ) from exc

        prediction_id = data.get("id")
        if not prediction_id:
            raise ProviderError(
                f"Fashn /run response missing prediction id: {data}",
                provider=self.name,
                retryable=True,
                details={"body": data},
            )
        return str(prediction_id)

    def _wait_for_outputs(
        self,
        api_key: str,
        prediction_id: str,
    ) -> Tuple[List[str], Dict[str, Any]]:
        """Poll /status until the prediction settles."""
        url = urljoin(self._base_url, f"status/{prediction_id}")
        deadline = time.time() + self._max_wait
        poll_count = 0
        last_payload: Dict[str, Any] = {}

        while True:
            poll_count += 1
            try:
                response = self._client.get(url, headers=self._auth_headers(api_key))
            except httpx.HTTPError as exc:
                # Transient network errors during polling shouldn't fail the
                # whole run; just sleep and try again until the deadline.
                logger.warning("Fashn /status network error (poll %s): %s", poll_count, exc)
                if time.time() >= deadline:
                    raise ProviderError(
                        f"Fashn /status timed out after {self._max_wait}s ({exc})",
                        provider=self.name,
                        retryable=True,
                    ) from exc
                time.sleep(self._poll_interval)
                continue

            if response.status_code == 429:
                # Rate-limited polling -- back off harder.
                time.sleep(min(5.0, self._poll_interval * 4))
                continue

            if response.status_code >= 500:
                if time.time() >= deadline:
                    raise ProviderError(
                        f"Fashn /status repeatedly returned {response.status_code}",
                        provider=self.name,
                        retryable=True,
                    )
                time.sleep(self._poll_interval)
                continue

            if response.status_code >= 400:
                raise ProviderError(
                    f"Fashn /status error ({response.status_code}): "
                    f"{response.text[:500]}",
                    provider=self.name,
                    retryable=False,
                    details={"status_code": response.status_code, "body": response.text},
                )

            try:
                payload = response.json()
            except ValueError as exc:
                raise ProviderError(
                    "Fashn /status returned invalid JSON",
                    provider=self.name,
                    retryable=True,
                ) from exc

            last_payload = payload
            state = (payload.get("status") or "").lower()
            if state in _TERMINAL_SUCCESS:
                outputs = payload.get("output") or []
                if isinstance(outputs, str):
                    outputs = [outputs]
                # Drop empties just in case.
                outputs = [o for o in outputs if isinstance(o, str) and o.strip()]
                return outputs, payload

            if state in _TERMINAL_FAILURE:
                error = payload.get("error") or {}
                message = (
                    error.get("message")
                    if isinstance(error, dict)
                    else str(error)
                )
                raise ProviderError(
                    f"Fashn prediction failed: {message or state}",
                    provider=self.name,
                    retryable=False,
                    details={"raw": payload},
                )

            if state and state not in _PROCESSING:
                logger.debug(
                    "Fashn /status: unknown state '%s' (treating as processing)",
                    state,
                )

            if time.time() >= deadline:
                raise ProviderError(
                    f"Fashn prediction did not finish within {self._max_wait}s",
                    provider=self.name,
                    retryable=True,
                    details={"prediction_id": prediction_id, "last_status": state},
                )

            # Mild exponential backoff on the polling cadence (caps at 4x).
            sleep_for = min(
                self._poll_interval * (1.0 + 0.15 * math.log(1 + poll_count)),
                self._poll_interval * 4,
            )
            time.sleep(sleep_for)

    def _pick_best(
        self,
        *,
        outputs: List[str],
        garment_image_url: str,
        quality_lane: str,
    ) -> Tuple[str, Dict[str, Any]]:
        """Pick the best candidate from a multi-sample run.

        Single-sample lanes short-circuit to the only output. The multi-sample
        path is only triggered on the best lane and falls back to the first
        candidate if the picker raises (we never want pick-time failures to
        fail the whole try-on).
        """
        if len(outputs) <= 1 or quality_lane != "best":
            return outputs[0], {"strategy": "single_candidate"}

        try:
            from .best_picker import pick_best_by_clip

            best_url, picker_meta = pick_best_by_clip(
                candidates=outputs,
                garment_image_url=garment_image_url,
            )
            return best_url, picker_meta
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning(
                "Fashn best-picker failed (%s); falling back to candidate[0]", exc
            )
            return outputs[0], {"strategy": "fallback_first", "error": str(exc)}

    def _auth_headers(self, api_key: str) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "gradfit/1.0 (+https://gradfit.ai)",
        }

    @staticmethod
    def _estimate_cost(
        model_name: str, payload: Dict[str, Any], num_outputs: int
    ) -> Optional[float]:
        """Best-effort USD cost estimate.

        Fashn bills in credits (~$0.04/credit at the time of writing). v1.6 is
        1 credit/output; tryon-max ranges 2-5 depending on resolution +
        generation_mode. We surface this purely for observability; finance
        should reconcile against the dashboard.
        """
        usd_per_credit = 0.04
        if model_name == "tryon-max":
            mode = (payload.get("generation_mode") or "quality").lower()
            res = (payload.get("resolution") or "1k").lower()
            credits_per_output = {
                ("balanced", "1k"): 2,
                ("balanced", "2k"): 3,
                ("balanced", "4k"): 4,
                ("quality", "1k"): 3,
                ("quality", "2k"): 4,
                ("quality", "4k"): 5,
            }.get((mode, res), 3)
            return round(credits_per_output * num_outputs * usd_per_credit, 4)
        # v1.6 = 1 credit per output
        return round(num_outputs * usd_per_credit, 4)


__all__ = ["FashnProvider"]
