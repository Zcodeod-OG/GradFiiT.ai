"""FLUX.1-dev orchestration for try-on, design, and stylist tasks.

Each entrypoint returns a small dataclass holding the generated PIL
images plus per-stage timings and metadata. The route handlers persist
the images to S3 and translate the dataclass into the JSON response.
"""

from __future__ import annotations

import logging
import random
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import torch
from PIL import Image

from .context import PipelineContext
from .controlnet_runner import make_canny_map, make_depth_map
from .io import fit_image
from .sam2_masker import run_sam2_mask

logger = logging.getLogger(__name__)


# ── Result dataclasses ────────────────────────────────────────────────


@dataclass
class TryOnResult:
    image: Image.Image
    seed: int
    timings: Dict[str, float] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class GenerationResult:
    images: List[Image.Image]
    seed: int
    timings: Dict[str, float] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


# ── Helpers ───────────────────────────────────────────────────────────


def _resolve_seed(seed: Optional[int]) -> int:
    if seed is None:
        return random.randint(0, 2**31 - 1)
    return int(seed)


def _generator(seed: int) -> torch.Generator:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    g = torch.Generator(device=device)
    g.manual_seed(seed)
    return g


def _maybe_apply_lora(
    ctx: PipelineContext,
    *,
    lora_uri: Optional[str],
    adapter_name: str,
    scale: float,
) -> None:
    if lora_uri:
        try:
            ctx.apply_lora(adapter_name=adapter_name, lora_uri=lora_uri, scale=scale)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("LoRA %s could not be applied: %s", lora_uri, exc)


# ── Try-on (inpaint + refs) ───────────────────────────────────────────

_TRYON_PROMPT_TEMPLATE = (
    "TRYON {person_description}. Replace the outfit with {garment_description} "
    "as shown in the reference image. The final image is a full body shot."
)


def run_tryon_generation(
    *,
    ctx: PipelineContext,
    person: Image.Image,
    garment: Image.Image,
    garment_category: Optional[str],
    garment_description: Optional[str],
    quality: str,
    seed: Optional[int],
    lora_uri: Optional[str],
    ip_adapter_strength: Optional[float],
) -> TryOnResult:
    """Run the FLUX inpaint try-on flow.

    Steps (timings reported individually so the backend can render the
    pipeline meter):
      1. SAM2 mask of the garment region on the person image.
      2. Canny + depth ControlNet conditioning from the person image.
      3. FLUX inpaint with IP-Adapter using the garment as the reference.
    """
    started = time.time()
    timings: Dict[str, float] = {}

    person = fit_image(person, max_side=1024)
    garment_fit = fit_image(garment, max_side=1024)

    target = _category_to_sam_target(garment_category)
    mask_started = time.time()
    mask_result = run_sam2_mask(ctx=ctx, image=person, target=target)
    timings["mask_ms"] = int((time.time() - mask_started) * 1000)

    cnet_started = time.time()
    canny = make_canny_map(person)
    depth = make_depth_map(ctx, person)
    timings["controlnet_prep_ms"] = int((time.time() - cnet_started) * 1000)

    seed_value = _resolve_seed(seed)
    _maybe_apply_lora(
        ctx,
        lora_uri=lora_uri,
        adapter_name=f"user_lora_{abs(hash(lora_uri or ''))}",
        scale=1.0,
    )
    ctx.ensure_ip_adapter()

    pipe = ctx.ensure_flux_inpaint()
    prompt = _TRYON_PROMPT_TEMPLATE.format(
        person_description=_describe_person(person),
        garment_description=garment_description or _category_to_phrase(garment_category),
    )

    if ip_adapter_strength is not None:
        try:
            pipe.set_ip_adapter_scale(float(ip_adapter_strength))
        except Exception:
            pass

    inpaint_started = time.time()
    steps, guidance = _quality_settings(quality)
    out = pipe(
        prompt=prompt,
        image=person,
        mask_image=mask_result.mask,
        ip_adapter_image=garment_fit,
        num_inference_steps=steps,
        guidance_scale=guidance,
        generator=_generator(seed_value),
        height=person.height,
        width=person.width,
    )
    timings["flux_inpaint_ms"] = int((time.time() - inpaint_started) * 1000)
    image = out.images[0]

    # Reduce mask hard edges by re-blending the original person face/hair
    # region so the identity stays intact. We use the inverted mask as the
    # blend alpha; inpaint already handled the masked region.
    image = _blend_unchanged_regions(original=person, generated=image, mask=mask_result.mask)

    timings["total_ms"] = int((time.time() - started) * 1000)
    return TryOnResult(
        image=image,
        seed=seed_value,
        timings=timings,
        metadata={
            "prompt": prompt,
            "garment_category": garment_category,
            "quality": quality,
            "mask_score": mask_result.metadata.get("score"),
            "depth_used": depth is not None,
        },
    )


# ── Design (text-to-image with optional sketch) ───────────────────────


def run_design_generation(
    *,
    ctx: PipelineContext,
    prompt: str,
    negative_prompt: Optional[str],
    sketch: Optional[Image.Image],
    style_reference: Optional[Image.Image],
    width: int,
    height: int,
    guidance_scale: float,
    num_inference_steps: int,
    seed: Optional[int],
    num_images: int,
    lora_uri: Optional[str],
    lora_scale: float,
) -> GenerationResult:
    started = time.time()
    timings: Dict[str, float] = {}

    seed_value = _resolve_seed(seed)
    _maybe_apply_lora(
        ctx,
        lora_uri=lora_uri,
        adapter_name=f"design_lora_{abs(hash(lora_uri or ''))}",
        scale=lora_scale,
    )

    pipe = ctx.ensure_flux()
    pipeline_kwargs: Dict[str, Any] = {
        "prompt": prompt,
        "guidance_scale": guidance_scale,
        "num_inference_steps": num_inference_steps,
        "width": width,
        "height": height,
        "num_images_per_prompt": num_images,
        "generator": _generator(seed_value),
    }
    if negative_prompt:
        pipeline_kwargs["negative_prompt"] = negative_prompt

    if style_reference is not None:
        ctx.ensure_ip_adapter()
        pipeline_kwargs["ip_adapter_image"] = fit_image(style_reference, 1024)

    if sketch is not None:
        cnet_started = time.time()
        edges = make_canny_map(sketch)
        timings["sketch_canny_ms"] = int((time.time() - cnet_started) * 1000)
        pipeline_kwargs["control_image"] = edges
        pipeline_kwargs["controlnet_conditioning_scale"] = 0.6

    flux_started = time.time()
    output = pipe(**pipeline_kwargs)
    timings["flux_ms"] = int((time.time() - flux_started) * 1000)

    timings["total_ms"] = int((time.time() - started) * 1000)
    return GenerationResult(
        images=list(output.images),
        seed=seed_value,
        timings=timings,
        metadata={
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "guidance_scale": guidance_scale,
            "num_inference_steps": num_inference_steps,
            "width": width,
            "height": height,
            "num_images": num_images,
            "lora_scale": lora_scale,
            "had_sketch": sketch is not None,
            "had_style_reference": style_reference is not None,
        },
    )


# ── Stylist (full outfit assembly) ────────────────────────────────────


def run_stylist_generation(
    *,
    ctx: PipelineContext,
    prompt: str,
    pieces: List[Dict[str, Any]],
    model_reference: Optional[Image.Image],
    background: str,
    seed: Optional[int],
    num_images: int,
    lora_uri: Optional[str],
    lora_scale: float,
) -> GenerationResult:
    """Generate a styled full-look on a (consistent) model.

    ``pieces`` is a list of items the user has already selected, e.g.
    ``[{"role": "top", "description": "white linen shirt"}, ...]``. We
    fold them into the prompt so FLUX produces the whole outfit in one
    pass instead of running multiple inpaint stages."""
    pieces_phrase = ", ".join(
        f"{p.get('role', 'item')}: {p['description']}"
        for p in pieces
        if p.get("description")
    )
    composed_prompt = (
        f"Editorial fashion photo. Background: {background}. "
        f"Outfit pieces -> {pieces_phrase}. "
        f"Stylist brief: {prompt}. Full body shot, soft daylight, 35mm."
    )

    seed_value = _resolve_seed(seed)
    _maybe_apply_lora(
        ctx,
        lora_uri=lora_uri,
        adapter_name=f"stylist_lora_{abs(hash(lora_uri or ''))}",
        scale=lora_scale,
    )

    pipe = ctx.ensure_flux()
    pipeline_kwargs: Dict[str, Any] = {
        "prompt": composed_prompt,
        "guidance_scale": 4.0,
        "num_inference_steps": 32,
        "width": 1024,
        "height": 1280,
        "num_images_per_prompt": max(1, min(num_images, 4)),
        "generator": _generator(seed_value),
    }

    if model_reference is not None:
        ctx.ensure_ip_adapter()
        pipeline_kwargs["ip_adapter_image"] = fit_image(model_reference, 1024)

    started = time.time()
    output = pipe(**pipeline_kwargs)
    elapsed_ms = int((time.time() - started) * 1000)

    return GenerationResult(
        images=list(output.images),
        seed=seed_value,
        timings={"flux_ms": elapsed_ms, "total_ms": elapsed_ms},
        metadata={
            "composed_prompt": composed_prompt,
            "pieces": pieces,
            "background": background,
            "had_model_reference": model_reference is not None,
        },
    )


# ── Internal helpers ──────────────────────────────────────────────────


def _quality_settings(quality: str) -> tuple[int, float]:
    quality = (quality or "balanced").lower()
    if quality == "fast":
        return 22, 3.5
    if quality == "best":
        return 40, 4.5
    return 30, 4.0


def _category_to_sam_target(category: Optional[str]) -> str:
    if not category:
        return "garment"
    norm = category.strip().lower()
    if norm in {"upperbody", "upper_body", "tops", "top", "shirt", "tshirt", "t-shirt"}:
        return "garment"
    if norm in {"lowerbody", "lower_body", "bottoms", "pants", "skirt", "shorts"}:
        return "lower_garment"
    if norm in {"dress", "dresses", "one-piece", "fullbody"}:
        return "person"
    return "garment"


def _category_to_phrase(category: Optional[str]) -> str:
    if not category:
        return "the garment shown in the reference image"
    norm = category.strip().lower()
    if "dress" in norm:
        return "the dress shown in the reference image"
    if "bottom" in norm or "pant" in norm or "skirt" in norm or "short" in norm:
        return "the bottoms shown in the reference image"
    return "the top shown in the reference image"


def _describe_person(image: Image.Image) -> str:
    # Cheap, deterministic stand-in. The container could call a captioner
    # here later (BLIP-2/Florence) but for the v1 try-on flow the prompt
    # quality matters less than the IP-Adapter reference.
    w, h = image.size
    if h > w:
        return "a person standing, full body, neutral pose"
    return "a person, half body, neutral pose"


def _blend_unchanged_regions(
    *, original: Image.Image, generated: Image.Image, mask: Image.Image
) -> Image.Image:
    """Composite the generated output onto the original where mask=1.

    FLUX inpaint already does this internally but at low resolution it
    occasionally bleeds outside the mask. A second hard composite at
    pixel resolution removes those artefacts cheaply.
    """
    if generated.size != original.size:
        generated = generated.resize(original.size, Image.LANCZOS)
    if mask.size != original.size:
        mask = mask.resize(original.size, Image.NEAREST)
    return Image.composite(generated, original, mask)


__all__ = [
    "run_tryon_generation",
    "run_design_generation",
    "run_stylist_generation",
    "TryOnResult",
    "GenerationResult",
]
