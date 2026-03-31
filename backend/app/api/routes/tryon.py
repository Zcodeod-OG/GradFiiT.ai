"""
ALTER.AI - Virtual Try-On API Endpoints

5-stage pipeline: Garment Extraction → IDM-VTON → Quality Gate →
SDXL+ControlNet Refinement (conditional) → Final Rating
"""

import logging
import threading
from datetime import datetime, timezone
from typing import Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.garment import Garment
from app.models.tryon import TryOn, TryOnStatus
from app.schemas.tryon import TryOnCreate, TryOnResponse, TryOnStatusResponse
from app.api.deps import get_current_active_user
from app.services.tasks import process_tryon_task
from app.services.tryon_runner import run_tryon_pipeline

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tryon", tags=["Virtual Try-On"])


def _run_pipeline_in_background(
    tryon_id: int,
    person_image_url: str,
    garment_image_url: str,
    garment_description: str,
    quality: str,
    preprocessed_garment_url: str | None = None,
):
    """Thread fallback path when Celery dispatch is unavailable."""
    run_tryon_pipeline(
        tryon_id=tryon_id,
        person_image_url=person_image_url,
        garment_image_url=garment_image_url,
        garment_description=garment_description,
        quality=quality,
        preprocessed_garment_url=preprocessed_garment_url,
    )


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _select_quality_lane(requested_quality: str, garment: Garment) -> str:
    """Route requests into fast vs quality lanes when `auto` is requested."""
    requested = (requested_quality or "balanced").lower().strip()
    if requested in {"fast", "balanced", "best"}:
        return requested

    complexity_markers = [
        (garment.category or "").lower(),
        (garment.garment_type or "").lower(),
        (garment.description or "").lower(),
        (garment.name or "").lower(),
    ]
    merged = " ".join(complexity_markers)

    hard_case_tokens = {
        "dress",
        "coat",
        "jacket",
        "hoodie",
        "layered",
        "outerwear",
        "full_body",
        "long",
    }
    is_hard_case = any(token in merged for token in hard_case_tokens)
    return "balanced" if is_hard_case else "fast"


@router.post("/generate")
def generate_tryon(
    data: TryOnCreate,
    x_idempotency_key: str | None = Header(default=None),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Start a virtual try-on generation."""
    # Validate garment exists and belongs to user
    garment = (
        db.query(Garment)
        .filter(Garment.id == data.garment_id, Garment.user_id == current_user.id)
        .first()
    )
    if not garment:
        raise HTTPException(status_code=404, detail="Garment not found")

    garment_image_url = garment.image_url
    preprocessed_garment_url = garment.extracted_image_url
    garment_description = (
        garment.description
        or garment.category
        or garment.garment_type
        or garment.name
        or "a garment"
    )
    effective_quality = _select_quality_lane(data.quality, garment)

    idempotency_key = x_idempotency_key.strip() if x_idempotency_key else None

    if idempotency_key:
        existing = (
            db.query(TryOn)
            .filter(
                TryOn.user_id == current_user.id,
                TryOn.idempotency_key == idempotency_key,
            )
            .order_by(TryOn.id.desc())
            .first()
        )
        if existing and existing.lifecycle_status in {
            "queued",
            "processing",
            "ready",
        }:
            return {
                "success": True,
                "data": {
                    "tryon_id": existing.id,
                    "status": existing.status.value,
                    "estimated_time": "30-120 seconds",
                    "execution_mode": "existing",
                    "idempotency_key": idempotency_key,
                },
            }

    # Create TryOn record
    tryon = TryOn(
        user_id=current_user.id,
        garment_id=garment.id,
        person_image_url=data.person_image_url,
        garment_image_url=garment_image_url,
        status=TryOnStatus.QUEUED,
        lifecycle_status="queued",
        idempotency_key=idempotency_key,
        queue_enqueued_at=_utc_now(),
        pipeline_metadata={
            "quality_requested": data.quality,
            "quality_effective": effective_quality,
            "queue_mode": "celery",
        },
    )
    db.add(tryon)
    db.commit()
    db.refresh(tryon)

    execution_mode = "celery"

    if settings.ENABLE_CELERY_TRYON:
        try:
            async_result = process_tryon_task.delay(
                tryon.id,
                data.person_image_url,
                garment_image_url,
                garment_description,
                effective_quality,
                preprocessed_garment_url,
            )
            tryon.worker_task_id = async_result.id
            db.commit()
        except Exception as exc:
            if settings.ALLOW_THREAD_FALLBACK_FOR_TRYON:
                logger.warning(
                    "Celery dispatch failed for TryOn %s, using thread fallback: %s",
                    tryon.id,
                    exc,
                )
                execution_mode = "thread"
            else:
                tryon.status = TryOnStatus.FAILED
                tryon.lifecycle_status = "failed"
                tryon.error_message = f"Queue dispatch failed: {exc}"[:500]
                tryon.execution_finished_at = _utc_now()
                db.commit()
                raise HTTPException(
                    status_code=503,
                    detail="Try-on queue is temporarily unavailable",
                )
    else:
        if settings.ALLOW_THREAD_FALLBACK_FOR_TRYON:
            execution_mode = "thread"
        else:
            tryon.status = TryOnStatus.FAILED
            tryon.lifecycle_status = "failed"
            tryon.error_message = "Celery try-on execution is disabled"
            tryon.execution_finished_at = _utc_now()
            db.commit()
            raise HTTPException(
                status_code=503,
                detail="Try-on queue is not enabled",
            )

    if execution_mode == "thread":
        thread = threading.Thread(
            target=_run_pipeline_in_background,
            args=(
                tryon.id,
                data.person_image_url,
                garment_image_url,
                garment_description,
                effective_quality,
                preprocessed_garment_url,
            ),
            daemon=True,
        )
        thread.start()

    return {
        "success": True,
        "data": {
            "tryon_id": tryon.id,
            "status": tryon.status.value,
            "estimated_time": "30-120 seconds",
            "execution_mode": execution_mode,
            "idempotency_key": idempotency_key,
            "quality_lane": effective_quality,
        },
    }


# ── Progress and label maps for the 5-stage pipeline ────────

PROGRESS_MAP = {
    TryOnStatus.PENDING: 5,
    TryOnStatus.QUEUED: 5,
    TryOnStatus.GARMENT_EXTRACTING: 10,
    TryOnStatus.GARMENT_EXTRACTED: 15,
    TryOnStatus.STAGE1_PROCESSING: 25,
    TryOnStatus.STAGE1_COMPLETED: 50,
    TryOnStatus.QUALITY_CHECKING: 55,
    TryOnStatus.QUALITY_PASSED: 60,
    TryOnStatus.QUALITY_FAILED: 60,
    TryOnStatus.STAGE2_PROCESSING: 75,
    TryOnStatus.RATING_COMPUTING: 90,
    TryOnStatus.COMPLETED: 100,
    TryOnStatus.FAILED: 0,
    TryOnStatus.DEAD_LETTER: 0,
}

STAGE_LABEL_MAP = {
    TryOnStatus.PENDING: "Preparing...",
    TryOnStatus.QUEUED: "Queued...",
    TryOnStatus.GARMENT_EXTRACTING: "Extracting garment from image...",
    TryOnStatus.GARMENT_EXTRACTED: "Garment extracted, starting try-on...",
    TryOnStatus.STAGE1_PROCESSING: "Generating virtual try-on (IDM-VTON)...",
    TryOnStatus.STAGE1_COMPLETED: "Try-on complete, checking quality...",
    TryOnStatus.QUALITY_CHECKING: "Assessing try-on quality...",
    TryOnStatus.QUALITY_PASSED: "Quality check passed!",
    TryOnStatus.QUALITY_FAILED: "Improving result with AI refinement...",
    TryOnStatus.STAGE2_PROCESSING: "Refining with SDXL + ControlNet...",
    TryOnStatus.RATING_COMPUTING: "Computing final quality rating...",
    TryOnStatus.COMPLETED: "Complete!",
    TryOnStatus.FAILED: "Failed",
    TryOnStatus.DEAD_LETTER: "Queued job failed permanently",
}


@router.get("/status/{tryon_id}")
def get_tryon_status(
    tryon_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Poll endpoint for pipeline progress."""
    tryon = (
        db.query(TryOn)
        .filter(TryOn.id == tryon_id, TryOn.user_id == current_user.id)
        .first()
    )
    if not tryon:
        raise HTTPException(status_code=404, detail="Try-on not found")

    return {
        "success": True,
        "data": {
            "tryon_id": tryon.id,
            "status": tryon.status.value,
            "progress": PROGRESS_MAP.get(tryon.status, 0),
            "current_stage": STAGE_LABEL_MAP.get(tryon.status, "Unknown"),
            "extracted_garment_url": tryon.extracted_garment_url,
            "stage1_result_url": tryon.stage1_result_url,
            "result_image_url": tryon.result_image_url,
            "quality_gate_score": tryon.quality_gate_score,
            "quality_gate_passed": tryon.quality_gate_passed,
            "rating_score": tryon.rating_score,
            "error_message": tryon.error_message,
            "pipeline_metadata": tryon.pipeline_metadata,
            "lifecycle_status": tryon.lifecycle_status,
            "worker_task_id": tryon.worker_task_id,
            "queue_wait_ms": tryon.queue_wait_ms,
            "execution_ms": tryon.execution_ms,
            "total_latency_ms": tryon.total_latency_ms,
            "created_at": tryon.created_at.isoformat() if tryon.created_at else None,
        },
    }


@router.get("/{tryon_id}")
def get_tryon(
    tryon_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get a specific try-on result."""
    tryon = (
        db.query(TryOn)
        .filter(TryOn.id == tryon_id, TryOn.user_id == current_user.id)
        .first()
    )
    if not tryon:
        raise HTTPException(status_code=404, detail="Try-on not found")

    return {
        "success": True,
        "data": TryOnResponse.model_validate(tryon).model_dump(),
    }


@router.get("/")
def list_tryons(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 20,
) -> Dict[str, Any]:
    """List user's try-ons."""
    tryons = (
        db.query(TryOn)
        .filter(TryOn.user_id == current_user.id)
        .order_by(TryOn.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {
        "success": True,
        "data": {
            "tryons": [TryOnResponse.model_validate(t).model_dump() for t in tryons],
            "total": len(tryons),
            "skip": skip,
            "limit": limit,
        },
    }
