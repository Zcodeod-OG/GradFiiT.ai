"""GradFiT - Face restoration via GFPGAN (Apache 2.0).

Wraps the Replicate-hosted ``tencentarc/gfpgan`` model (Apache 2.0 weights
and code, commercial-safe). The wrapper:

* Reuses the existing ``ReplicateService`` for token rotation and retry.
* Re-uploads the restored image to our own S3 so the result URL doesn't
  expire when Replicate garbage-collects the prediction output.
* Is a pure no-op when ``FACE_RESTORE_ENABLED=false``.

GFPGAN does both detection and restoration internally, so we don't need
to crop the face -- we feed the whole VTON output and trust GFPGAN to
locate the face(s).
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


def restore_face(image_url: str) -> Tuple[Optional[str], Dict[str, Any]]:
    """Run GFPGAN on ``image_url``.

    Returns
    -------
    (final_url, meta)
        ``final_url`` is the new S3 URL pointing at the restored image,
        or ``None`` when the step was skipped/failed. ``meta`` contains
        the model slug, scale factor, and any error details.
    """
    if not settings.FACE_RESTORE_ENABLED:
        return None, {"step": "face_restore", "status": "disabled"}

    if not image_url:
        return None, {"step": "face_restore", "status": "skipped_empty_url"}

    model_ref = (settings.FACE_RESTORE_MODEL or "").strip()
    if not model_ref:
        return None, {
            "step": "face_restore",
            "status": "skipped_no_model",
        }

    scale = max(1, min(4, int(settings.FACE_RESTORE_SCALE or 2)))

    inputs: Dict[str, Any] = {
        "img": image_url,
        # GFPGAN's Replicate cog accepts `version` (v1.4 by default) and
        # `scale`. Some forks expose `weight`; we keep the input minimal
        # so it works against the canonical tencentarc/gfpgan slug.
        "version": "v1.4",
        "scale": scale,
    }

    replicate_service = get_replicate_service()

    try:
        raw_output = replicate_service.run_model(model_ref, inputs)
    except Exception as exc:
        logger.warning("face_restore: GFPGAN call failed (%s)", exc)
        return None, {
            "step": "face_restore",
            "status": "failed",
            "model": model_ref,
            "error": str(exc),
        }

    replicate_url = coerce_replicate_output_to_url(raw_output)
    if not replicate_url:
        logger.warning("face_restore: GFPGAN returned no URL (raw=%r)", raw_output)
        return None, {
            "step": "face_restore",
            "status": "failed",
            "model": model_ref,
            "error": "empty_output",
        }

    try:
        final_url, _ = download_and_reupload(
            source_url=replicate_url,
            role="face_restore",
        )
    except Exception as exc:
        logger.warning(
            "face_restore: re-upload failed (%s); keeping Replicate URL", exc
        )
        return replicate_url, {
            "step": "face_restore",
            "status": "ok_no_rehost",
            "model": model_ref,
            "scale": scale,
            "replicate_url": replicate_url,
            "rehost_error": str(exc),
        }

    return final_url, {
        "step": "face_restore",
        "status": "ok",
        "model": model_ref,
        "scale": scale,
        "replicate_url": replicate_url,
    }


__all__ = ["restore_face"]
