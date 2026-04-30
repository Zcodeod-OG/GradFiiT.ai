"""GradFiT - Super-resolution via Real-ESRGAN.

Real-ESRGAN now lives inside the bundled SageMaker serving container.
This module is a thin shim that calls the ``upscale`` task on the FLUX
endpoint. The Replicate-hosted variant has been retired -- keeping a
single inference surface keeps cost forecasting simple.

Identical contract to ``face_restore.restore_face``: best-effort,
returns ``(final_url, meta)`` and never raises into the orchestrator.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Tuple

from app.config import settings
from app.services.sagemaker import (
    SagemakerInferenceError,
    build_output_prefix,
    invoke_sync,
    s3_uri_to_public_url,
)

logger = logging.getLogger(__name__)


def _materialise(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    if url.startswith("s3://"):
        return s3_uri_to_public_url(url)
    return url


def upscale_image(image_url: str) -> Tuple[Optional[str], Dict[str, Any]]:
    if not settings.UPSCALE_ENABLED:
        return None, {"step": "upscale", "status": "disabled"}
    if not image_url:
        return None, {"step": "upscale", "status": "skipped_empty_url"}

    factor = max(2, min(4, int(settings.UPSCALE_FACTOR or 2)))
    output_prefix = build_output_prefix(scope="postprocess/upscale", scope_id="shared")

    inputs: Dict[str, Any] = {
        "image_url": image_url,
        "scale": factor,
        "output_s3_prefix": output_prefix,
    }

    try:
        result = invoke_sync(
            task="upscale",
            inputs=inputs,
            options={"return_metadata": True},
        )
    except SagemakerInferenceError as exc:
        logger.warning("upscale: SageMaker call failed (%s)", exc)
        return None, {
            "step": "upscale",
            "status": "failed",
            "error": str(exc),
        }
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("upscale: unexpected failure (%s)", exc)
        return None, {
            "step": "upscale",
            "status": "failed",
            "error": str(exc),
        }

    payload = result.payload or {}
    raw_url = payload.get("image_url") or payload.get("image") or payload.get("output")
    final_url = _materialise(raw_url if isinstance(raw_url, str) else None)
    if not final_url:
        logger.warning("upscale: serving container returned no URL (%r)", payload)
        return None, {
            "step": "upscale",
            "status": "failed",
            "error": "empty_output",
        }

    return final_url, {
        "step": "upscale",
        "status": "ok",
        "engine": "real-esrgan",
        "factor": factor,
        "elapsed_ms": result.elapsed_ms,
        "inference_id": result.inference_id,
    }


__all__ = ["upscale_image"]
