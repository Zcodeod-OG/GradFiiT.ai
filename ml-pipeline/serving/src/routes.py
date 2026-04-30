"""GradFiT — task router for the bundled SageMaker handler.

Each task receives the parsed JSON payload plus a shared
:class:`PipelineContext` (lazy-loaded models). Heavy lifting lives in the
``pipeline.*`` modules; this file is intentionally just dispatch + thin
glue so the call graph stays readable.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Callable, Dict

from .pipeline.context import PipelineContext
from .pipeline.io import (
    download_image,
    persist_pil_to_s3,
)
from .pipeline.flux_runner import (
    run_design_generation,
    run_stylist_generation,
    run_tryon_generation,
)
from .pipeline.catvton_runner import run_catvton_tryon
from .pipeline.sam2_masker import run_sam2_mask
from .pipeline.esrgan_upscaler import run_realesrgan_upscale

logger = logging.getLogger(__name__)


# ── Task: try-on ──────────────────────────────────────────────────────


def _task_tryon(payload: Dict[str, Any], ctx: PipelineContext) -> Dict[str, Any]:
    inputs = payload.get("inputs") or {}
    options = payload.get("options") or {}

    person_url = _required(inputs, "person_image_url")
    garment_url = _required(inputs, "garment_image_url")
    output_prefix = _required(inputs, "output_s3_prefix")

    person = download_image(person_url)
    garment = download_image(garment_url)

    result = run_tryon_generation(
        ctx=ctx,
        person=person,
        garment=garment,
        garment_category=inputs.get("garment_category"),
        garment_description=inputs.get("garment_description"),
        quality=options.get("quality", "balanced"),
        seed=options.get("seed"),
        lora_uri=options.get("lora_uri"),
        ip_adapter_strength=options.get("ip_adapter_strength"),
    )

    upscaled = run_realesrgan_upscale(
        ctx=ctx,
        image=result.image,
        scale=options.get("upscale", 2),
    )

    final_uri = persist_pil_to_s3(upscaled.image, output_prefix, suffix="result.png")
    raw_uri = persist_pil_to_s3(result.image, output_prefix, suffix="raw.png")

    return {
        "task": "tryon",
        "result_image_uri": final_uri,
        "raw_image_uri": raw_uri,
        "candidate_image_uris": [final_uri],
        "seed": result.seed,
        "timings": {**result.timings, "upscale_ms": upscaled.timings["upscale_ms"]},
        "metadata": {**result.metadata, "upscale_scale": upscaled.scale},
    }


# ── Task: tryon_v2 (CatVTON-Flux specialized) ────────────────────────


def _task_tryon_v2(payload: Dict[str, Any], ctx: PipelineContext) -> Dict[str, Any]:
    """Specialized VTO path on CatVTON-Flux.

    Targets P50 7-10s on g5.2xlarge at the balanced (25-step) lane vs.
    12-25s for the legacy FLUX inpaint path. Output is 768x1024 from
    CatVTON; we no longer Real-ESRGAN on the synchronous lane. The user
    can opt into upscaling via the /api/tryon/{id}/upscale backend
    endpoint, which routes back to the legacy ``upscale`` task in this
    same container.
    """
    inputs = payload.get("inputs") or {}
    options = payload.get("options") or {}

    person_url = _required(inputs, "person_image_url")
    garment_url = _required(inputs, "garment_image_url")
    output_prefix = _required(inputs, "output_s3_prefix")

    person = download_image(person_url)
    garment = download_image(garment_url)

    result = run_catvton_tryon(
        ctx=ctx,
        person=person,
        garment=garment,
        garment_category=inputs.get("garment_category"),
        garment_description=inputs.get("garment_description"),
        quality=options.get("quality", "balanced"),
        seed=options.get("seed"),
    )

    final_uri = persist_pil_to_s3(result.image, output_prefix, suffix="result.png")

    return {
        "task": "tryon_v2",
        "result_image_uri": final_uri,
        "candidate_image_uris": [final_uri],
        "seed": result.seed,
        "timings": result.timings,
        "metadata": result.metadata,
    }


# ── Task: design ──────────────────────────────────────────────────────


def _task_design(payload: Dict[str, Any], ctx: PipelineContext) -> Dict[str, Any]:
    inputs = payload.get("inputs") or {}
    options = payload.get("options") or {}

    prompt = _required(inputs, "prompt")
    output_prefix = _required(inputs, "output_s3_prefix")

    sketch = None
    if inputs.get("sketch_image_url"):
        sketch = download_image(inputs["sketch_image_url"])

    style_ref = None
    if inputs.get("style_reference_url"):
        style_ref = download_image(inputs["style_reference_url"])

    num_images = max(1, min(int(options.get("num_images", 1)), 4))

    result = run_design_generation(
        ctx=ctx,
        prompt=prompt,
        negative_prompt=inputs.get("negative_prompt"),
        sketch=sketch,
        style_reference=style_ref,
        width=int(options.get("width", 1024)),
        height=int(options.get("height", 1024)),
        guidance_scale=float(options.get("guidance_scale", 4.5)),
        num_inference_steps=int(options.get("num_inference_steps", 35)),
        seed=options.get("seed"),
        num_images=num_images,
        lora_uri=options.get("lora_uri"),
        lora_scale=float(options.get("lora_scale", 1.0)),
    )

    image_uris = []
    for idx, img in enumerate(result.images):
        image_uris.append(
            persist_pil_to_s3(img, output_prefix, suffix=f"design_{idx}.png")
        )

    return {
        "task": "design",
        "image_uris": image_uris,
        "primary_image_uri": image_uris[0],
        "seed": result.seed,
        "timings": result.timings,
        "metadata": result.metadata,
    }


# ── Task: stylist ─────────────────────────────────────────────────────


def _task_stylist(payload: Dict[str, Any], ctx: PipelineContext) -> Dict[str, Any]:
    inputs = payload.get("inputs") or {}
    options = payload.get("options") or {}

    prompt = _required(inputs, "prompt")
    output_prefix = _required(inputs, "output_s3_prefix")

    model_ref = None
    if inputs.get("model_reference_url"):
        model_ref = download_image(inputs["model_reference_url"])

    result = run_stylist_generation(
        ctx=ctx,
        prompt=prompt,
        pieces=inputs.get("pieces") or [],
        model_reference=model_ref,
        background=inputs.get("background", "studio"),
        seed=options.get("seed"),
        num_images=int(options.get("num_images", 1)),
        lora_uri=options.get("lora_uri"),
        lora_scale=float(options.get("lora_scale", 1.0)),
    )

    image_uris = [
        persist_pil_to_s3(img, output_prefix, suffix=f"stylist_{idx}.png")
        for idx, img in enumerate(result.images)
    ]

    return {
        "task": "stylist",
        "image_uris": image_uris,
        "primary_image_uri": image_uris[0],
        "seed": result.seed,
        "timings": result.timings,
        "metadata": result.metadata,
    }


# ── Task: mask (SAM2 only) ────────────────────────────────────────────


def _task_mask(payload: Dict[str, Any], ctx: PipelineContext) -> Dict[str, Any]:
    inputs = payload.get("inputs") or {}
    options = payload.get("options") or {}

    image_url = _required(inputs, "image_url")
    output_prefix = _required(inputs, "output_s3_prefix")
    target = (options.get("target") or "garment").lower()

    image = download_image(image_url)
    result = run_sam2_mask(ctx=ctx, image=image, target=target)

    mask_uri = persist_pil_to_s3(result.mask, output_prefix, suffix="mask.png")
    cutout_uri = None
    if result.cutout is not None:
        cutout_uri = persist_pil_to_s3(result.cutout, output_prefix, suffix="cutout.png")

    return {
        "task": "mask",
        "mask_image_uri": mask_uri,
        "cutout_image_uri": cutout_uri,
        "bbox": result.bbox,
        "timings": result.timings,
        "metadata": result.metadata,
    }


# ── Task: upscale (Real-ESRGAN only) ──────────────────────────────────


def _task_upscale(payload: Dict[str, Any], ctx: PipelineContext) -> Dict[str, Any]:
    inputs = payload.get("inputs") or {}
    options = payload.get("options") or {}

    image_url = _required(inputs, "image_url")
    output_prefix = _required(inputs, "output_s3_prefix")
    scale = int(options.get("scale", 4))

    image = download_image(image_url)
    result = run_realesrgan_upscale(ctx=ctx, image=image, scale=scale)

    uri = persist_pil_to_s3(result.image, output_prefix, suffix=f"upscaled_x{scale}.png")
    return {
        "task": "upscale",
        "image_uri": uri,
        "scale": result.scale,
        "timings": result.timings,
        "metadata": result.metadata,
    }


# ── Task: warmup (lazy-load models without doing real work) ───────────


def _task_warmup(payload: Dict[str, Any], ctx: PipelineContext) -> Dict[str, Any]:
    """Trigger model load for a target task without running inference.

    Cheap path that the backend pings on user activity (login, garment
    upload, try-on studio mount) so the GPU pipeline is hot before the
    first real request lands. Returns warm-state for /ping parity.
    """
    options = payload.get("options") or {}
    target = (options.get("task") or "tryon_v2").lower()
    started = time.time()
    ctx.warmup_for_task(target)
    return {
        "task": "warmup",
        "warmed_for": target,
        "warm": ctx.is_initialised(),
        "elapsed_ms": int((time.time() - started) * 1000),
    }


# ── Dispatch table ────────────────────────────────────────────────────


_DISPATCH: Dict[str, Callable[[Dict[str, Any], PipelineContext], Dict[str, Any]]] = {
    "tryon": _task_tryon,
    "tryon_v2": _task_tryon_v2,
    "design": _task_design,
    "stylist": _task_stylist,
    "mask": _task_mask,
    "upscale": _task_upscale,
    "warmup": _task_warmup,
}


def dispatch(*, task: str, payload: Dict[str, Any], ctx: PipelineContext) -> Dict[str, Any]:
    """Route a task to its handler."""
    handler = _DISPATCH.get(task)
    if handler is None:
        raise KeyError(task)
    logger.info("Dispatching task=%s request_id=%s", task, payload.get("request_id"))
    return handler(payload, ctx)


def _required(d: Dict[str, Any], key: str) -> Any:
    if key not in d or d[key] in (None, "", []):
        raise ValueError(f"missing required field 'inputs.{key}'")
    return d[key]


__all__ = ["dispatch"]
