"""ControlNet preprocessing helpers (canny + depth)."""

from __future__ import annotations

import logging
from typing import Any, Optional

import numpy as np
from PIL import Image

from .context import PipelineContext

logger = logging.getLogger(__name__)


def make_canny_map(image: Image.Image, *, low: int = 100, high: int = 200) -> Image.Image:
    """Compute a Canny edge map (uint8 grayscale).

    Uses OpenCV via opencv-python-headless. Falls back to a Pillow-based
    Sobel if cv2 isn't available (unit-test friendly path)."""
    try:
        import cv2  # type: ignore

        arr = np.array(image.convert("RGB"))
        gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
        edges = cv2.Canny(gray, low, high)
        return Image.fromarray(edges).convert("RGB")
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("cv2 canny unavailable: %s; falling back to PIL Sobel", exc)
        from PIL import ImageFilter

        gray = image.convert("L")
        return gray.filter(ImageFilter.FIND_EDGES).convert("RGB")


def make_depth_map(ctx: PipelineContext, image: Image.Image) -> Optional[Image.Image]:
    """Run depth estimation. Returns ``None`` if the estimator is unavailable."""
    estimator = ctx.depth_estimator
    if estimator is None:
        return None
    try:
        out = estimator(image)
        depth = out["depth"] if isinstance(out, dict) else out
        if isinstance(depth, Image.Image):
            return depth.convert("RGB")
        if hasattr(depth, "convert"):
            return depth.convert("RGB")
        arr = np.array(depth, dtype=np.float32)
        if arr.ndim == 2:
            arr = (arr - arr.min()) / max(1e-6, arr.max() - arr.min())
            arr = (arr * 255).astype(np.uint8)
            return Image.fromarray(arr).convert("RGB")
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Depth estimation failed: %s", exc)
    return None


__all__ = ["make_canny_map", "make_depth_map"]
