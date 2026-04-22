"""GradFiT - Super-resolution via Real-ESRGAN (BSD-3).

Wraps the Replicate-hosted ``nightmareai/real-esrgan`` model. Identical
contract to ``face_restore.restore_face``: best-effort, returns
``(final_url, meta)`` and never raises into the orchestrator.

Real-ESRGAN ships with an optional ``face_enhance`` flag that runs
GFPGAN internally. We default it OFF because the postprocessor pipeline
runs face restore as its own step right before this one -- enabling
both produces over-processed, plastic-looking skin.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Tuple

from app.config import settings
from app.services.postprocess import (
    coerce_replicate_output_to_url,
    download_and_reupload,
)
from app.services.replicate import get_replicate_service

logger = logging.getLogger(__name__)


def upscale_image(image_url: str) -> Tuple[Optional[str], Dict[str, Any]]:
    if not settings.UPSCALE_ENABLED:
        return None, {"step": "upscale", "status": "disabled"}
    if not image_url:
        return None, {"step": "upscale", "status": "skipped_empty_url"}

    model_ref = (settings.UPSCALE_MODEL or "").strip()
    if not model_ref:
        return None, {"step": "upscale", "status": "skipped_no_model"}

    factor = max(2, min(4, int(settings.UPSCALE_FACTOR or 2)))

    inputs: Dict[str, Any] = {
        "image": image_url,
        "scale": factor,
        "face_enhance": bool(settings.UPSCALE_FACE_ENHANCE),
    }

    try:
        raw_output = get_replicate_service().run_model(model_ref, inputs)
    except Exception as exc:
        logger.warning("upscale: Real-ESRGAN call failed (%s)", exc)
        return None, {
            "step": "upscale",
            "status": "failed",
            "model": model_ref,
            "error": str(exc),
        }

    replicate_url = coerce_replicate_output_to_url(raw_output)
    if not replicate_url:
        logger.warning("upscale: Real-ESRGAN returned no URL (raw=%r)", raw_output)
        return None, {
            "step": "upscale",
            "status": "failed",
            "model": model_ref,
            "error": "empty_output",
        }

    try:
        final_url, _ = download_and_reupload(
            source_url=replicate_url,
            role="upscale",
        )
    except Exception as exc:
        logger.warning("upscale: re-upload failed (%s); keeping Replicate URL", exc)
        return replicate_url, {
            "step": "upscale",
            "status": "ok_no_rehost",
            "model": model_ref,
            "factor": factor,
            "face_enhance": inputs["face_enhance"],
            "replicate_url": replicate_url,
            "rehost_error": str(exc),
        }

    return final_url, {
        "step": "upscale",
        "status": "ok",
        "model": model_ref,
        "factor": factor,
        "face_enhance": inputs["face_enhance"],
        "replicate_url": replicate_url,
    }


__all__ = ["upscale_image"]
