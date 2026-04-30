"""Real-ESRGAN upscaling helper."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Dict

import numpy as np
from PIL import Image

from .context import PipelineContext

logger = logging.getLogger(__name__)


@dataclass
class UpscaleResult:
    image: Image.Image
    scale: int
    timings: Dict[str, float] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


def run_realesrgan_upscale(
    *, ctx: PipelineContext, image: Image.Image, scale: int = 2
) -> UpscaleResult:
    """Run Real-ESRGAN. Falls back to PIL Lanczos when the model isn't
    loadable (e.g. weights missing on a stripped image), so the pipeline
    can never fail at the upscale step alone."""
    started = time.time()
    upscaler = None
    try:
        upscaler = ctx.ensure_esrgan()
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Real-ESRGAN unavailable, using Lanczos fallback: %s", exc)

    if upscaler is None:
        new = image.resize(
            (image.width * scale, image.height * scale), Image.LANCZOS
        )
        return UpscaleResult(
            image=new,
            scale=scale,
            timings={"upscale_ms": int((time.time() - started) * 1000)},
            metadata={"engine": "lanczos_fallback"},
        )

    arr = np.array(image.convert("RGB"))
    output, _ = upscaler.enhance(arr, outscale=float(scale))
    new_image = Image.fromarray(output)
    return UpscaleResult(
        image=new_image,
        scale=scale,
        timings={"upscale_ms": int((time.time() - started) * 1000)},
        metadata={"engine": "real_esrgan_x4"},
    )


__all__ = ["run_realesrgan_upscale", "UpscaleResult"]
