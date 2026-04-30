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
    """The serving container returns either a single ``image`` field or a
    list under ``images`` depending on the task; normalise both."""
    images: List[str] = []
    single = payload.get("image_url") or payload.get("image")
    if isinstance(single, str):
        images.append(single)
    bulk = payload.get("images") or payload.get("image_urls") or []
    if isinstance(bulk, list):
        for entry in bulk:
            if isinstance(entry, str):
                images.append(entry)
            elif isinstance(entry, dict):
                url = entry.get("url") or entry.get("image_url")
                if isinstance(url, str):
                    images.append(url)
    deduped: List[str] = []
    seen = set()
    for url in images:
        if url not in seen:
            seen.add(url)
            deduped.append(url)
    return [_to_public(u) or u for u in deduped]


def run_design(
    *,
    db: Session,
    design: Design,
) -> Design:
    """Run a Design generation against the FLUX endpoint and persist the
    output image URLs back onto ``design``."""
    started = time.time()
    design.status = "processing"
    db.commit()

    output_prefix = build_output_prefix(scope="designs", scope_id=design.id)
    inputs: Dict[str, Any] = {
        "prompt": design.prompt,
        "negative_prompt": design.negative_prompt,
        "sketch_url": design.sketch_image_url,
        "style_reference_url": design.style_reference_url,
        "width": design.width,
        "height": design.height,
        "guidance_scale": design.guidance_scale,
        "num_inference_steps": design.num_inference_steps,
        "num_images": design.num_images,
        "seed": design.seed,
        "lora_uri": design.lora_uri,
        "lora_scale": design.lora_scale,
        "output_s3_prefix": output_prefix,
    }

    try:
        result = invoke_sync(
            task="design",
            inputs=inputs,
            options={"return_metadata": True},
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
    }
    db.commit()
    db.refresh(design)
    return design


def run_stylist(
    *,
    db: Session,
    outfit: Outfit,
) -> Outfit:
    """Run a Stylist generation against the FLUX endpoint."""
    started = time.time()
    outfit.status = "processing"
    db.commit()

    output_prefix = build_output_prefix(scope="outfits", scope_id=outfit.id)
    inputs: Dict[str, Any] = {
        "prompt": outfit.prompt,
        "pieces": outfit.pieces or [],
        "background": outfit.background,
        "model_reference_url": outfit.model_reference_url,
        "seed": outfit.seed,
        "num_images": outfit.num_images,
        "lora_uri": outfit.lora_uri,
        "lora_scale": outfit.lora_scale,
        "output_s3_prefix": output_prefix,
    }

    try:
        result = invoke_sync(
            task="stylist",
            inputs=inputs,
            options={"return_metadata": True},
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
    }
    db.commit()
    db.refresh(outfit)
    return outfit


__all__ = ["run_design", "run_stylist"]
