"""
ALTER.AI - Virtual Try-On API Endpoints

5-stage pipeline: Garment Extraction → OOTDiffusion → Quality Gate →
SDXL+ControlNet Refinement (conditional) → Final Rating
"""

import logging
import threading
import time
import hashlib
import socket
from urllib.parse import urlparse
from datetime import datetime, timezone
from typing import Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.garment import Garment
from app.models.tryon import TryOn, TryOnStatus
from app.schemas.tryon import (
    TryOnCreate,
    TryOnPreviewCreate,
    TryOnPreviewResponse,
    TryOnResponse,
    TryOnStatusResponse,
)
from app.api.deps import get_current_active_user, get_optional_active_user
from app.services.tasks import process_tryon_task
from app.services.tryon_runner import run_tryon_pipeline
from app.services.pipeline import get_pipeline_service
from app.services.storage import get_storage
from app.services.subscription import enforce_tryon_quota, get_usage_snapshot
from app.services.yolo_pose import get_yolo_pose_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tryon", tags=["Virtual Try-On"])
_QUICK_PREVIEW_CACHE: dict[str, Dict[str, Any]] = {}


def _is_http_url(url: str | None) -> bool:
    return bool(url) and (url.startswith("http://") or url.startswith("https://"))


def _preview_cache_key(
    garment_image_url: str,
    person_image_url: str,
    garment_description: str,
    quality: str,
    mode: str,
    use_yolo11_pose: bool,
) -> str:
    raw = "|".join(
        [
            garment_image_url.strip(),
            person_image_url.strip(),
            (garment_description or "a garment").strip(),
            quality.strip(),
            mode.strip(),
            str(use_yolo11_pose),
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _get_cached_preview(key: str) -> Dict[str, Any] | None:
    entry = _QUICK_PREVIEW_CACHE.get(key)
    if not entry:
        return None

    if (time.time() - entry["created_at"]) > settings.QUICK_PREVIEW_CACHE_TTL_SECONDS:
        _QUICK_PREVIEW_CACHE.pop(key, None)
        return None

    return entry["payload"]


def _set_cached_preview(key: str, payload: Dict[str, Any]) -> None:
    _QUICK_PREVIEW_CACHE[key] = {
        "created_at": time.time(),
        "payload": payload,
    }

    # Keep memory bounded for long-running API workers.
    if len(_QUICK_PREVIEW_CACHE) > 200:
        oldest_key = min(
            _QUICK_PREVIEW_CACHE,
            key=lambda k: _QUICK_PREVIEW_CACHE[k]["created_at"],
        )
        _QUICK_PREVIEW_CACHE.pop(oldest_key, None)


def _resolve_preview_person_image(
    data: TryOnPreviewCreate,
    current_user: User | None,
    db: Session,
) -> tuple[str, bool, bool]:
    # Explicit request image has top priority.
    if _is_http_url(data.person_image_url):
        return data.person_image_url.strip(), True, False

    # If authenticated, use the user's most recent try-on person image.
    if current_user:
        recent = (
            db.query(TryOn)
            .filter(TryOn.user_id == current_user.id)
            .order_by(TryOn.created_at.desc())
            .first()
        )
        if recent and _is_http_url(recent.person_image_url):
            return recent.person_image_url.strip(), True, False

    # Fall back to configured mannequin/model image.
    return settings.QUICK_PREVIEW_DEFAULT_PERSON_IMAGE_URL, False, True


def _run_pipeline_in_background(
    tryon_id: int,
    person_image_url: str,
    garment_image_url: str,
    garment_description: str,
    quality: str,
    garment_category: str | None = None,
    preprocessed_garment_url: str | None = None,
    mode: str = "2d",
):
    """Thread fallback path when Celery dispatch is unavailable."""
    run_tryon_pipeline(
        tryon_id=tryon_id,
        person_image_url=person_image_url,
        garment_image_url=garment_image_url,
        garment_description=garment_description,
        quality=quality,
        garment_category=garment_category,
        preprocessed_garment_url=preprocessed_garment_url,
        mode=mode,
    )


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _is_celery_broker_reachable(timeout_seconds: float = 0.35) -> bool:
    """Fast broker reachability probe to avoid long Celery connection stalls."""
    broker_url = (settings.CELERY_BROKER_URL or "").strip()
    parsed = urlparse(broker_url)

    # Non-Redis brokers are treated as reachable; Celery will handle their own errors.
    if parsed.scheme not in {"redis", "rediss"}:
        return True

    host = parsed.hostname or "localhost"
    port = parsed.port or 6379
    try:
        with socket.create_connection((host, port), timeout=timeout_seconds):
            return True
    except OSError:
        return False


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
    requested_mode = (data.mode or current_user.preferred_tryon_mode or "2d").lower().strip()
    quota_snapshot = enforce_tryon_quota(db=db, user=current_user, requested_mode=requested_mode)
    storage = get_storage()

    person_image_url = (data.person_image_url or "").strip()
    if requested_mode == "3d":
        if not person_image_url and _is_http_url(current_user.avatar_source_image_url):
            person_image_url = current_user.avatar_source_image_url.strip()
        if not person_image_url and _is_http_url(current_user.avatar_preview_url):
            person_image_url = current_user.avatar_preview_url.strip()
        if not _is_http_url(person_image_url):
            raise HTTPException(
                status_code=422,
                detail="3D try-on requires a person image URL or a ready avatar profile",
            )
    else:
        if not _is_http_url(person_image_url):
            raise HTTPException(
                status_code=422,
                detail="2D try-on requires a valid person_image_url",
            )

    person_image_url_for_provider = (
        storage.to_provider_access_url(person_image_url)
        if _is_http_url(person_image_url)
        else person_image_url
    )

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
    garment_image_url_for_provider = storage.to_provider_access_url(
        garment_image_url,
        garment.s3_key,
    )
    preprocessed_garment_url_for_provider = storage.to_provider_access_url(
        preprocessed_garment_url,
        garment.extracted_s3_key,
    )
    garment_description = (
        garment.description
        or garment.category
        or garment.garment_type
        or garment.name
        or "a garment"
    )
    garment_category = (
        (garment.category or garment.garment_type or "").strip().lower() or None
    )
    effective_quality = _select_quality_lane(data.quality, garment)

    idempotency_key = x_idempotency_key.strip() if x_idempotency_key else None

    if idempotency_key:
        existing = (
            db.query(TryOn)
            .filter(
                TryOn.user_id == current_user.id,
                TryOn.idempotency_key == idempotency_key,
                TryOn.tryon_mode == requested_mode,
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
                    "estimated_time": "90-240 seconds" if existing.tryon_mode == "3d" else "30-120 seconds",
                    "execution_mode": "existing",
                    "idempotency_key": idempotency_key,
                    "mode": existing.tryon_mode,
                    "quota": quota_snapshot,
                },
            }

    # Create TryOn record
    tryon = TryOn(
        user_id=current_user.id,
        garment_id=garment.id,
        person_image_url=person_image_url,
        garment_image_url=garment_image_url,
        tryon_mode=requested_mode,
        status=TryOnStatus.QUEUED,
        lifecycle_status="queued",
        idempotency_key=idempotency_key,
        queue_enqueued_at=_utc_now(),
        pipeline_metadata={
            "mode": requested_mode,
            "quality_requested": data.quality,
            "quality_effective": effective_quality,
            "queue_mode": "celery",
            "quota": quota_snapshot,
        },
    )
    db.add(tryon)
    db.commit()
    db.refresh(tryon)

    execution_mode = "celery"

    if settings.ENABLE_CELERY_TRYON:
        broker_reachable = _is_celery_broker_reachable()
        if not broker_reachable:
            if settings.ALLOW_THREAD_FALLBACK_FOR_TRYON:
                logger.warning(
                    "Celery broker unavailable for TryOn %s, using thread fallback",
                    tryon.id,
                )
                execution_mode = "thread"
            else:
                tryon.status = TryOnStatus.FAILED
                tryon.lifecycle_status = "failed"
                tryon.error_message = "Queue broker unavailable"
                tryon.execution_finished_at = _utc_now()
                db.commit()
                raise HTTPException(
                    status_code=503,
                    detail="Try-on queue is temporarily unavailable",
                )
        else:
            try:
                async_result = process_tryon_task.apply_async(
                    args=(
                        tryon.id,
                        person_image_url_for_provider,
                        garment_image_url_for_provider,
                        garment_description,
                        effective_quality,
                        garment_category,
                        preprocessed_garment_url_for_provider,
                        requested_mode,
                    ),
                    ignore_result=True,
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
                person_image_url_for_provider,
                garment_image_url_for_provider,
                garment_description,
                effective_quality,
                garment_category,
                preprocessed_garment_url_for_provider,
                requested_mode,
            ),
            daemon=True,
        )
        thread.start()

    return {
        "success": True,
        "data": {
            "tryon_id": tryon.id,
            "status": tryon.status.value,
            "estimated_time": "90-240 seconds" if requested_mode == "3d" else "30-120 seconds",
            "execution_mode": execution_mode,
            "idempotency_key": idempotency_key,
            "quality_lane": effective_quality,
            "mode": requested_mode,
            "quota": quota_snapshot,
        },
    }


@router.post("/preview")
def generate_quick_preview(
    data: TryOnPreviewCreate,
    current_user: User | None = Depends(get_optional_active_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Generate a fast quick-preview image for extension sidebar usage.

    Uses Stage 1 (OOTDiffusion) only for low-latency preview output and supports
    optional user personalization when auth token is provided.
    """
    if not _is_http_url(data.garment_image_url):
        raise HTTPException(status_code=400, detail="garment_image_url must be a valid http(s) URL")

    person_image_url, personalized, fallback_model_used = _resolve_preview_person_image(
        data=data,
        current_user=current_user,
        db=db,
    )
    storage = get_storage()
    provider_person_image_url = storage.to_provider_access_url(person_image_url)
    provider_garment_image_url = storage.to_provider_access_url(data.garment_image_url)
    quality = (data.quality or "fast").lower().strip()
    if quality not in {"fast", "balanced", "best"}:
        quality = "fast"
    mode = (data.mode or "2d").lower().strip()
    if mode not in {"2d", "3d"}:
        mode = "2d"
    use_yolo11_pose = bool(data.use_yolo11_pose and mode == "2d")

    pose_metadata = None
    if use_yolo11_pose:
        pose_service = get_yolo_pose_service()
        pose_metadata = pose_service.estimate_pose(person_image_url)
    pose_engine = "yolo11_pose" if pose_metadata else "none"

    cache_key = _preview_cache_key(
        garment_image_url=data.garment_image_url,
        person_image_url=person_image_url,
        garment_description=data.garment_description,
        quality=quality,
        mode=mode,
        use_yolo11_pose=use_yolo11_pose,
    )
    cached_payload = _get_cached_preview(cache_key)
    if cached_payload:
        payload = dict(cached_payload)
        payload["cached"] = True
        return {"success": True, "data": payload}

    started = time.perf_counter()
    try:
        pipeline = get_pipeline_service()
        preview_category_hint = (data.garment_description or "").strip().lower()
        stage1 = pipeline.run_stage1_oot_diffusion(
            person_image_url=provider_person_image_url,
            garment_image_url=provider_garment_image_url,
            garment_description=data.garment_description or "a garment",
            garment_category=preview_category_hint,
        )
        result_image_url = stage1.get("output_url")
        if not _is_http_url(result_image_url):
            raise RuntimeError("No preview image returned")

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        response_payload = TryOnPreviewResponse(
            result_image_url=result_image_url,
            person_image_url_used=person_image_url,
            garment_image_url=data.garment_image_url,
            quality="fast",
            mode=mode,
            pose_engine=pose_engine,
            processing_time_ms=elapsed_ms,
            cached=False,
            personalized=personalized,
            fallback_model_used=fallback_model_used,
        ).model_dump()

        _set_cached_preview(cache_key, response_payload)
        return {"success": True, "data": response_payload}
    except Exception as exc:
        logger.error("Quick preview generation failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="Quick preview generation failed",
        )


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
    TryOnStatus.AVATAR_3D_GENERATING: 35,
    TryOnStatus.GARMENT_FITTING_3D: 65,
    TryOnStatus.MODEL_RENDERING_3D: 90,
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
    TryOnStatus.STAGE1_PROCESSING: "Generating virtual try-on (OOTDiffusion)...",
    TryOnStatus.STAGE1_COMPLETED: "Try-on complete, checking quality...",
    TryOnStatus.QUALITY_CHECKING: "Assessing try-on quality...",
    TryOnStatus.QUALITY_PASSED: "Quality check passed!",
    TryOnStatus.QUALITY_FAILED: "Improving result with AI refinement...",
    TryOnStatus.STAGE2_PROCESSING: "Refining with SDXL + ControlNet...",
    TryOnStatus.AVATAR_3D_GENERATING: "Building your 3D mannequin...",
    TryOnStatus.GARMENT_FITTING_3D: "Fitting garment on 3D mannequin...",
    TryOnStatus.MODEL_RENDERING_3D: "Rendering 360° 3D output...",
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
            "tryon_mode": tryon.tryon_mode,
            "progress": PROGRESS_MAP.get(tryon.status, 0),
            "current_stage": STAGE_LABEL_MAP.get(tryon.status, "Unknown"),
            "extracted_garment_url": tryon.extracted_garment_url,
            "stage1_result_url": tryon.stage1_result_url,
            "result_image_url": tryon.result_image_url,
            "result_model_url": tryon.result_model_url,
            "result_turntable_url": tryon.result_turntable_url,
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
    quota_snapshot = get_usage_snapshot(
        db=db,
        user=current_user,
        requested_mode=current_user.preferred_tryon_mode,
    )
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
            "quota": quota_snapshot,
        },
    }
