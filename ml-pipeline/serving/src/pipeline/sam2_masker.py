"""SAM2-based segmentation for garments, person silhouettes and refs.

We keep the SAM2 surface narrow: every external caller asks for a single
binary mask and (optionally) a transparent cutout. Heuristics for picking
the right SAM2 prompt live here instead of leaking into the routes.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from PIL import Image

from .context import PipelineContext

logger = logging.getLogger(__name__)


@dataclass
class MaskResult:
    mask: Image.Image  # 'L' mode, 0/255
    cutout: Optional[Image.Image]  # 'RGBA' if requested
    bbox: List[int] = field(default_factory=list)  # [x0, y0, x1, y1]
    timings: Dict[str, float] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


def run_sam2_mask(
    *,
    ctx: PipelineContext,
    image: Image.Image,
    target: str = "garment",
    point_prompts: Optional[List[Tuple[int, int]]] = None,
    box_prompt: Optional[Tuple[int, int, int, int]] = None,
) -> MaskResult:
    """Produce a binary mask for ``target`` using SAM2.

    Args:
        target: ``"garment"`` (centred on the upper torso), ``"person"``
            (full silhouette), or ``"auto"`` (best-of-N).
        point_prompts: Optional explicit click points (image space).
        box_prompt: Optional bbox prompt as (x0, y0, x1, y1).
    """
    started = time.time()
    predictor = ctx.ensure_sam2()

    img_np = np.array(image.convert("RGB"))
    h, w = img_np.shape[:2]

    # Build a default prompt if the caller didn't pass one.
    points = point_prompts
    box = box_prompt
    if points is None and box is None:
        points, box = _heuristic_prompt(target=target, width=w, height=h)

    predictor.set_image(img_np)

    point_coords = None
    point_labels = None
    if points:
        point_coords = np.array(points, dtype=np.float32)
        point_labels = np.array([1] * len(points), dtype=np.int32)

    box_array = None
    if box is not None:
        box_array = np.array(box, dtype=np.float32)[None, :]

    masks, scores, _ = predictor.predict(
        point_coords=point_coords,
        point_labels=point_labels,
        box=box_array,
        multimask_output=True,
    )

    # Pick the highest-scoring mask. SAM2 returns float scores; we keep
    # the argmax mask and ignore the rest (the runner only needs one).
    best_idx = int(np.argmax(scores))
    mask = masks[best_idx].astype(np.uint8) * 255
    score = float(scores[best_idx])

    pil_mask = Image.fromarray(mask, mode="L")
    cutout = _apply_alpha_cutout(image, pil_mask)
    bbox = _mask_bbox(mask)

    elapsed_ms = int((time.time() - started) * 1000)
    return MaskResult(
        mask=pil_mask,
        cutout=cutout,
        bbox=bbox,
        timings={"sam2_ms": elapsed_ms},
        metadata={
            "target": target,
            "score": round(score, 4),
            "num_candidates": int(len(masks)),
            "image_size": [w, h],
        },
    )


def _heuristic_prompt(
    *, target: str, width: int, height: int
) -> Tuple[List[Tuple[int, int]], Optional[Tuple[int, int, int, int]]]:
    cx = width // 2
    if target in {"garment", "upper_garment", "auto"}:
        # Upper torso: a vertical strip of points around the chest line.
        cy = int(height * 0.45)
        points = [
            (cx, cy),
            (cx, int(cy * 0.85)),
            (cx, int(cy * 1.15)),
        ]
        # No box prompt — let SAM2 grow from the points.
        return points, None
    if target == "lower_garment":
        cy = int(height * 0.7)
        return [(cx, cy)], None
    if target == "person":
        # Full silhouette: tight box around the centre.
        margin_x = int(width * 0.1)
        margin_y = int(height * 0.05)
        return (
            [(cx, height // 2)],
            (margin_x, margin_y, width - margin_x, height - margin_y),
        )
    # Fallback: centre point.
    return [(cx, height // 2)], None


def _apply_alpha_cutout(image: Image.Image, mask: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    rgba.putalpha(mask)
    return rgba


def _mask_bbox(mask: np.ndarray) -> List[int]:
    ys, xs = np.where(mask > 0)
    if len(xs) == 0 or len(ys) == 0:
        return []
    return [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]


__all__ = ["run_sam2_mask", "MaskResult"]
