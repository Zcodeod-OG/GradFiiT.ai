"""GradFiT Studios - thin orchestration layer for the FLUX endpoint.

Both Design and Stylist studios are CRUD-style: persist a row in
``designs`` / ``outfits`` with status=``processing``, fire a synchronous
SageMaker async-invoke (the wrapper polls S3 for the result), then write
back the produced image URLs.

We keep the orchestration tiny and synchronous here because the FastAPI
worker can afford to block while polling -- the heavy lifting happens on
the SageMaker side. If we ever need true background fan-out we can move
this into Celery without touching the routes.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.brand_dna import BrandDNA
from app.models.design import Design
from app.models.outfit import Outfit
from app.services.sagemaker import (
    SagemakerInferenceError,
    build_output_prefix,
    invoke_sync,
    s3_uri_to_public_url,
)

logger = logging.getLogger(__name__)


def _to_public(uri: Optional[str]) -> Optional[str]:
    if not uri:
        return None
    if uri.startswith("s3://"):
        return s3_uri_to_public_url(uri)
    return uri


def _extract_image_urls(payload: Dict[str, Any]) -> List[str]:
    """Normalise the serving container's image fields into a flat list.

    Design and Stylist tasks return ``primary_image_uri`` + ``image_uris``
    (see ``ml-pipeline/serving/src/routes.py``); we also accept the older
    ``image`` / ``images`` / ``image_url`` shapes for forward/backward
    compatibility. The primary uri is listed first so it ends up as
    ``image_urls[0]`` (the stored primary)."""
    images: List[str] = []
    single = (
        payload.get("primary_image_uri")
        or payload.get("image_uri")
        or payload.get("image_url")
        or payload.get("image")
    )
    if isinstance(single, str):
        images.append(single)
    bulk = (
        payload.get("image_uris")
        or payload.get("images")
        or payload.get("image_urls")
        or []
    )
    if isinstance(bulk, list):
        for entry in bulk:
            if isinstance(entry, str):
                images.append(entry)
            elif isinstance(entry, dict):
                url = entry.get("url") or entry.get("image_url") or entry.get("uri")
                if isinstance(url, str):
                    images.append(url)
    deduped: List[str] = []
    seen = set()
    for url in images:
        if url not in seen:
            seen.add(url)
            deduped.append(url)
    return [_to_public(u) or u for u in deduped]


def _compact(options: Dict[str, Any]) -> Dict[str, Any]:
    """Drop ``None`` values so the serving container's ``int()`` / ``float()``
    coercions fall back to their defaults instead of crashing on ``None``."""
    return {k: v for k, v in options.items() if v is not None}


def _stylist_pieces(pieces: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """Map stored stylist pieces onto the serving container's schema.

    The backend persists pieces as ``{slot, description, color, fabric}``
    but the FLUX stylist runner expects ``{role, description}`` (see
    ``run_stylist_generation``). We rename ``slot`` -> ``role`` and fold
    colour/fabric into the description so that detail isn't lost."""
    mapped: List[Dict[str, Any]] = []
    for piece in pieces or []:
        if not isinstance(piece, dict):
            continue
        parts = [piece.get("color"), piece.get("fabric"), piece.get("description")]
        description = " ".join(str(p).strip() for p in parts if p)
        if not description:
            continue
        mapped.append(
            {
                "role": piece.get("role") or piece.get("slot") or "item",
                "description": description,
            }
        )
    return mapped


def load_brand_dna_context(db: Session, user_id: int) -> Optional[BrandDNA]:
    """Fetch the user's Brand DNA singleton, or ``None`` if unconfigured.

    Shared by ``run_design`` and ``run_stylist`` so closet and studios read
    the same source of truth (voice / palette / LoRA / model references)."""
    return db.query(BrandDNA).filter(BrandDNA.user_id == user_id).first()


def _brand_prompt_prefix(brand: BrandDNA) -> str:
    """Render the brand voice + palette into a short prompt prefix."""
    parts: List[str] = []
    voice = (brand.voice or "").strip()
    if voice:
        parts.append(voice)
    palette = [c for c in (brand.palette or []) if isinstance(c, str)][:6]
    if palette:
        parts.append("Brand palette: " + ", ".join(palette))
    return ". ".join(parts)


def _apply_brand_to_prompt(prompt: str, brand: BrandDNA) -> str:
    prefix = _brand_prompt_prefix(brand)
    return f"{prefix}. {prompt}" if prefix else prompt


def brand_dna_is_active(brand: Optional[BrandDNA]) -> bool:
    """True when the user has configured something meaningful in Brand DNA."""
    if brand is None:
        return False
    voice = (brand.voice or "").strip()
    palette = [c for c in (brand.palette or []) if isinstance(c, str) and c.strip()]
    refs = [r for r in (brand.model_references or []) if isinstance(r, str) and r.strip()]
    lora = (brand.lora_uri or "").strip()
    return bool(voice or palette or refs or lora)


def _apply_brand_dna_to_design(
    design: Design,
    brand: BrandDNA,
) -> Dict[str, Any]:
    """Mutate ``design`` in place with Brand DNA conditioning. Returns a
    small audit blob for ``pipeline_metadata``."""
    applied: Dict[str, Any] = {"voice": False, "palette": False, "lora": False}

    design.prompt = _apply_brand_to_prompt(design.prompt, brand)
    if (brand.voice or "").strip():
        applied["voice"] = True
    if brand.palette:
        applied["palette"] = True

    if not design.lora_uri and brand.lora_uri and brand.lora_status == "ready":
        design.lora_uri = brand.lora_uri
        applied["lora"] = True
    if design.lora_scale is None and brand.lora_strength is not None:
        design.lora_scale = brand.lora_strength

    return applied


def _apply_brand_dna_to_outfit(
    outfit: Outfit,
    brand: BrandDNA,
) -> Dict[str, Any]:
    """Mutate ``outfit`` in place with Brand DNA conditioning."""
    applied: Dict[str, Any] = {
        "voice": False,
        "palette": False,
        "lora": False,
        "model_reference": False,
    }

    outfit.prompt = _apply_brand_to_prompt(outfit.prompt, brand)
    if (brand.voice or "").strip():
        applied["voice"] = True
    if brand.palette:
        applied["palette"] = True

    refs = [r for r in (brand.model_references or []) if isinstance(r, str) and r.strip()]
    if not outfit.model_reference_url and refs:
        outfit.model_reference_url = refs[0]
        applied["model_reference"] = True

    if not outfit.lora_uri and brand.lora_uri and brand.lora_status == "ready":
        outfit.lora_uri = brand.lora_uri
        applied["lora"] = True
    if outfit.lora_scale is None and brand.lora_strength is not None:
        outfit.lora_scale = brand.lora_strength

    return applied


def run_design(
    *,
    db: Session,
    design: Design,
    use_brand_dna: bool = True,
) -> Design:
    """Run a Design generation against the FLUX endpoint and persist the
    output image URLs back onto ``design``."""
    started = time.time()
    design.status = "processing"
    db.commit()

    brand_applied: Optional[Dict[str, Any]] = None
    if use_brand_dna:
        brand = load_brand_dna_context(db, design.user_id)
        if brand_dna_is_active(brand):
            brand_applied = _apply_brand_dna_to_design(design, brand)
            db.commit()

    output_prefix = build_output_prefix(scope="designs", scope_id=design.id)
    inputs: Dict[str, Any] = {
        "prompt": design.prompt,
        "negative_prompt": design.negative_prompt,
        "sketch_image_url": design.sketch_image_url,
        "style_reference_url": design.style_reference_url,
        "output_s3_prefix": output_prefix,
    }
    options: Dict[str, Any] = _compact(
        {
            "width": design.width,
            "height": design.height,
            "guidance_scale": design.guidance_scale,
            "num_inference_steps": design.num_inference_steps,
            "num_images": design.num_images,
            "seed": design.seed,
            "lora_uri": design.lora_uri,
            "lora_scale": design.lora_scale,
            "return_metadata": True,
        }
    )

    try:
        result = invoke_sync(
            task="design",
            inputs=inputs,
            options=options,
        )
    except SagemakerInferenceError as exc:
        design.status = "failed"
        design.error_message = str(exc)
        design.pipeline_metadata = {
            **(design.pipeline_metadata or {}),
            "error": {"message": str(exc), "details": exc.details},
        }
        db.commit()
        raise

    image_urls = _extract_image_urls(result.payload)
    design.image_urls = image_urls
    design.primary_image_url = image_urls[0] if image_urls else None
    design.status = "completed" if image_urls else "failed"
    design.error_message = None if image_urls else "no images returned"
    design.inference_id = result.inference_id
    design.pipeline_metadata = {
        **(design.pipeline_metadata or {}),
        "inference_id": result.inference_id,
        "elapsed_ms": result.elapsed_ms,
        "total_ms": int((time.time() - started) * 1000),
        "container": result.payload.get("metadata"),
        "brand_dna_applied": brand_applied,
    }
    db.commit()
    db.refresh(design)
    return design


def run_stylist(
    *,
    db: Session,
    outfit: Outfit,
    use_brand_dna: bool = True,
) -> Outfit:
    """Run a Stylist generation against the FLUX endpoint."""
    started = time.time()
    outfit.status = "processing"
    db.commit()

    brand_applied: Optional[Dict[str, Any]] = None
    if use_brand_dna:
        brand = load_brand_dna_context(db, outfit.user_id)
        if brand_dna_is_active(brand):
            brand_applied = _apply_brand_dna_to_outfit(outfit, brand)
            db.commit()

    output_prefix = build_output_prefix(scope="outfits", scope_id=outfit.id)
    inputs: Dict[str, Any] = {
        "prompt": outfit.prompt,
        "pieces": _stylist_pieces(outfit.pieces),
        "background": outfit.background,
        "model_reference_url": outfit.model_reference_url,
        "output_s3_prefix": output_prefix,
    }
    options: Dict[str, Any] = _compact(
        {
            "seed": outfit.seed,
            "num_images": outfit.num_images,
            "lora_uri": outfit.lora_uri,
            "lora_scale": outfit.lora_scale,
            "return_metadata": True,
        }
    )

    try:
        result = invoke_sync(
            task="stylist",
            inputs=inputs,
            options=options,
        )
    except SagemakerInferenceError as exc:
        outfit.status = "failed"
        outfit.error_message = str(exc)
        outfit.pipeline_metadata = {
            **(outfit.pipeline_metadata or {}),
            "error": {"message": str(exc), "details": exc.details},
        }
        db.commit()
        raise

    image_urls = _extract_image_urls(result.payload)
    outfit.image_urls = image_urls
    outfit.primary_image_url = image_urls[0] if image_urls else None
    outfit.status = "completed" if image_urls else "failed"
    outfit.error_message = None if image_urls else "no images returned"
    outfit.inference_id = result.inference_id
    outfit.pipeline_metadata = {
        **(outfit.pipeline_metadata or {}),
        "inference_id": result.inference_id,
        "elapsed_ms": result.elapsed_ms,
        "total_ms": int((time.time() - started) * 1000),
        "container": result.payload.get("metadata"),
        "brand_dna_applied": brand_applied,
    }
    db.commit()
    db.refresh(outfit)
    return outfit


__all__ = [
    "brand_dna_is_active",
    "load_brand_dna_context",
    "run_design",
    "run_stylist",
]
