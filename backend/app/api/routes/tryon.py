"""
GradFiT - Virtual Try-On API Endpoints

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
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

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
from app.services.tryon_runner import run_combo_tryon_pipeline, run_tryon_pipeline
from app.services.pipeline import get_pipeline_service
from app.services.storage import get_storage
from app.services.subscription import enforce_tryon_quota, get_usage_snapshot
from app.services.yolo_pose import get_yolo_pose_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tryon", tags=["Virtual Try-On"])
_QUICK_PREVIEW_CACHE: dict[str, Dict[str, Any]] = {}


# How long presigned image URLs in try-on responses stay valid. 1h is
# plenty for the UI to render + let the user keep the modal open. We
# intentionally re-sign on every status poll so the URL is always fresh
# for the active session.
_TRYON_PRESIGN_EXPIRATION = 3600


def _presign_for_browser(url: Optional[str]) -> Optional[str]:
    """Return a browser-loadable URL.

    Try-on records reference images in our private S3 bucket (user
    uploads, stage-1 intermediates, some final outputs when we mirror
    them) as well as external CDNs (Fashn.ai result URLs, retailer
    mirrors). The storage helper returns a short-lived presigned URL for
    the former and passes the latter through unchanged.
    """
    if not url:
        return url
    try:
        return get_storage().to_provider_access_url(
            url, expiration=_TRYON_PRESIGN_EXPIRATION
        ) or url
    except Exception:
        return url


def _presign_tryon_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    for field in (
        "person_image_url",
        "person_image_url_used",
        "garment_image_url",
        "extracted_garment_url",
        "stage1_result_url",
        "result_image_url",
        "result_model_url",
        "result_turntable_url",
    ):
        if field in payload and payload[field]:
            payload[field] = _presign_for_browser(payload[field])
    return payload


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
    provider_override: str | None = None,
    cached_default_person_url: str | None = None,
    cached_smart_crop_url: str | None = None,
    cached_face_url: str | None = None,
    cached_face_embedding: list | None = None,
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
        provider_override=provider_override,
        cached_default_person_url=cached_default_person_url,
        cached_smart_crop_url=cached_smart_crop_url,
        cached_face_url=cached_face_url,
        cached_face_embedding=cached_face_embedding,
    )


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _maybe_fail_stale_tryon(tryon: TryOn, db: Session) -> None:
    """Mark stale in-flight jobs as failed when execution likely got interrupted."""
    if tryon.lifecycle_status not in {"queued", "processing"}:
        return
    if tryon.execution_finished_at is not None:
        return

    started_at = tryon.execution_started_at or tryon.queue_enqueued_at or tryon.created_at
    if started_at is None:
        return

    if tryon.status in {
        TryOnStatus.QUALITY_CHECKING,
        TryOnStatus.QUALITY_PASSED,
        TryOnStatus.QUALITY_FAILED,
        TryOnStatus.STAGE2_PROCESSING,
        TryOnStatus.RATING_COMPUTING,
    }:
        max_age_seconds = max(settings.TRYON_STAGE3_TIMEOUT_SECONDS + settings.TRYON_STAGE4_TIMEOUT_SECONDS + 45, 150)
    else:
        max_age_seconds = max(settings.TRYON_HARD_TIME_LIMIT_SECONDS + 45, 180)
    age_seconds = (_utc_now() - started_at).total_seconds()
    if age_seconds <= max_age_seconds:
        return

    if not tryon.result_image_url and tryon.stage1_result_url:
        tryon.result_image_url = tryon.stage1_result_url
    if tryon.status in {TryOnStatus.STAGE1_PROCESSING, TryOnStatus.STAGE1_COMPLETED}:
        timeout_message = "Try-on timed out during generation."
    elif tryon.status in {
        TryOnStatus.QUALITY_CHECKING,
        TryOnStatus.QUALITY_PASSED,
        TryOnStatus.QUALITY_FAILED,
        TryOnStatus.STAGE2_PROCESSING,
        TryOnStatus.RATING_COMPUTING,
    }:
        timeout_message = "Try-on timed out in quality enhancement step; showing stage-1 result."
    else:
        timeout_message = "Try-on timed out before completion."
    tryon.status = TryOnStatus.FAILED
    tryon.lifecycle_status = "failed"
    tryon.error_message = timeout_message[:500]
    tryon.execution_finished_at = _utc_now()
    if tryon.execution_started_at and tryon.execution_finished_at:
        tryon.execution_ms = max(
            0,
            int((tryon.execution_finished_at - tryon.execution_started_at).total_seconds() * 1000),
        )
    if tryon.queue_enqueued_at and tryon.execution_finished_at:
        tryon.total_latency_ms = max(
            0,
            int((tryon.execution_finished_at - tryon.queue_enqueued_at).total_seconds() * 1000),
        )
    db.commit()


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


# Cache the worker-presence answer for a few seconds so we don't ping Celery on
# every single request, but still react quickly if the worker is started/stopped.
_WORKER_PROBE_CACHE: dict[str, Any] = {"checked_at": 0.0, "alive": False}
_WORKER_PROBE_TTL_SECONDS = 5.0


def _is_celery_worker_alive(timeout_seconds: float = 1.0) -> bool:
    """Return True only when at least one Celery worker responds to ping().

    Just having a reachable broker is not enough: if no worker is consuming
    the queue, dispatched try-on tasks sit forever and the user sees the job
    stuck on "Queued / Getting ready". We do a short cached ping so the
    request path stays cheap while still correctly falling back to the
    in-process thread runner when no worker is online.
    """
    now = time.time()
    if (now - _WORKER_PROBE_CACHE["checked_at"]) < _WORKER_PROBE_TTL_SECONDS:
        return bool(_WORKER_PROBE_CACHE["alive"])

    alive = False
    try:
        # Imported lazily to avoid pulling Celery into request paths that
        # never touch it (and to keep startup time low).
        from app.services.tasks import celery_app

        inspector = celery_app.control.inspect(timeout=timeout_seconds)
        replies = inspector.ping() or {}
        alive = bool(replies)
    except Exception as exc:  # pragma: no cover - best-effort probe
        logger.debug("Celery worker probe failed: %s", exc)
        alive = False

    _WORKER_PROBE_CACHE["checked_at"] = now
    _WORKER_PROBE_CACHE["alive"] = alive
    return alive


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
    x_tryon_provider: str | None = Header(default=None, alias="X-TryOn-Provider"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Start a virtual try-on generation."""
    requested_mode = (data.mode or current_user.preferred_tryon_mode or "2d").lower().strip()
    quota_snapshot = enforce_tryon_quota(db=db, user=current_user, requested_mode=requested_mode)
    storage = get_storage()

    person_image_url = (data.person_image_url or "").strip()
    used_default_person_photo = False
    if requested_mode == "3d":
        if not person_image_url and _is_http_url(current_user.avatar_source_image_url):
            person_image_url = current_user.avatar_source_image_url.strip()
        if not person_image_url and _is_http_url(current_user.avatar_preview_url):
            person_image_url = current_user.avatar_preview_url.strip()
        if not person_image_url and _is_http_url(current_user.default_person_image_url):
            person_image_url = current_user.default_person_image_url.strip()
            used_default_person_photo = True
        if not _is_http_url(person_image_url):
            raise HTTPException(
                status_code=422,
                detail=(
                    "3D try-on requires a person image URL, a ready avatar "
                    "profile, or a saved default person photo"
                ),
            )
    else:
        if not _is_http_url(person_image_url) and _is_http_url(
            current_user.default_person_image_url
        ):
            person_image_url = current_user.default_person_image_url.strip()
            used_default_person_photo = True
        if not _is_http_url(person_image_url):
            raise HTTPException(
                status_code=422,
                detail=(
                    "2D try-on requires a person_image_url or a saved default "
                    "person photo. Upload one in Settings -> Profile photo."
                ),
            )

    # Treat the input as a hit on the cached default photo when the URL
    # we're about to process matches the user's saved canonical photo.
    matches_default_photo = (
        _is_http_url(current_user.default_person_image_url)
        and current_user.default_person_image_url.strip() == person_image_url
    )
    cached_default_person_url = (
        current_user.default_person_image_url.strip()
        if matches_default_photo
        else None
    )
    cached_smart_crop_url = (
        current_user.default_person_smart_crop_url
        if matches_default_photo and current_user.default_person_smart_crop_url
        else None
    )
    cached_face_url = (
        current_user.default_person_face_url
        if matches_default_photo and current_user.default_person_face_url
        else None
    )
    cached_face_embedding = (
        list(current_user.default_person_face_embedding)
        if matches_default_photo and current_user.default_person_face_embedding
        else None
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

    provider_override = (x_tryon_provider or "").strip().lower() or None
    if provider_override and provider_override not in {"fashn", "replicate_legacy"}:
        raise HTTPException(
            status_code=400,
            detail="X-TryOn-Provider must be one of: fashn, replicate_legacy",
        )

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
            "provider_override": provider_override,
            "provider_default": settings.TRYON_PROVIDER,
            "used_default_person_photo": used_default_person_photo,
            "used_default_photo_cache": bool(matches_default_photo),
        },
    )
    db.add(tryon)
    db.commit()
    db.refresh(tryon)

    execution_mode = "celery"

    if settings.ENABLE_CELERY_TRYON:
        broker_reachable = _is_celery_broker_reachable()
        worker_alive = broker_reachable and _is_celery_worker_alive()
        if not broker_reachable or not worker_alive:
            if settings.ALLOW_THREAD_FALLBACK_FOR_TRYON:
                logger.warning(
                    "Celery %s for TryOn %s, using thread fallback",
                    "broker unavailable" if not broker_reachable else "worker not responding",
                    tryon.id,
                )
                execution_mode = "thread"
            else:
                tryon.status = TryOnStatus.FAILED
                tryon.lifecycle_status = "failed"
                tryon.error_message = (
                    "Queue broker unavailable" if not broker_reachable else "Queue worker unavailable"
                )
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
                        provider_override,
                        cached_default_person_url,
                        cached_smart_crop_url,
                        cached_face_url,
                        cached_face_embedding,
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
        metadata = dict(tryon.pipeline_metadata or {})
        metadata["queue_mode"] = "thread"
        tryon.pipeline_metadata = metadata
        db.commit()

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
                provider_override,
                cached_default_person_url,
                cached_smart_crop_url,
                cached_face_url,
                cached_face_embedding,
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
            "provider": provider_override or settings.TRYON_PROVIDER,
            "quota": quota_snapshot,
        },
    }


# ── Combo (multi-garment) try-on ───────────────────────────────────
# Users can stage 2-3 garments across browser tabs (e.g. a shirt from
# Zara and pants from H&M) and fire a single combo request. We chain
# the provider runs inside `run_combo_tryon_pipeline` so the output is
# one composite person wearing all of them.
class TryOnComboCreate(BaseModel):
    garment_ids: List[int] = Field(
        ..., min_length=1, max_length=3,
        description="Ordered garment ids. Apply top-layer garments last."
    )
    person_image_url: Optional[str] = None
    mode: Optional[str] = "2d"
    quality: Optional[str] = "fast"


def _run_combo_in_background(
    tryon_id: int,
    person_image_url: str,
    garments_payload: List[Dict[str, Any]],
    quality: str,
    provider_override: Optional[str] = None,
    cached_default_person_url: Optional[str] = None,
    cached_smart_crop_url: Optional[str] = None,
    cached_face_url: Optional[str] = None,
    cached_face_embedding: Optional[List[float]] = None,
) -> None:
    run_combo_tryon_pipeline(
        tryon_id=tryon_id,
        person_image_url=person_image_url,
        garments=garments_payload,
        quality=quality,
        provider_override=provider_override,
        cached_default_person_url=cached_default_person_url,
        cached_smart_crop_url=cached_smart_crop_url,
        cached_face_url=cached_face_url,
        cached_face_embedding=cached_face_embedding,
    )


@router.post("/combo")
def generate_combo_tryon(
    data: TryOnComboCreate,
    x_tryon_provider: str | None = Header(default=None, alias="X-TryOn-Provider"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Run a combo try-on that stitches 2-3 garments onto one person.

    Only 2D (Fashn) is supported -- the 3D path doesn't have a cheap
    chain-of-garments primitive yet. We count combo as a single try-on
    against the user's quota since it produces one artifact.
    """
    requested_mode = "2d"  # combo is 2D-only for now
    if (data.mode or "2d").lower() != "2d":
        raise HTTPException(
            status_code=400,
            detail="Combo try-on currently supports 2D mode only.",
        )

    quota_snapshot = enforce_tryon_quota(
        db=db, user=current_user, requested_mode=requested_mode
    )

    # Resolve the person image (explicit -> saved default -> 422).
    storage = get_storage()
    person_image_url = (data.person_image_url or "").strip()
    used_default_person_photo = False
    if not _is_http_url(person_image_url) and _is_http_url(
        current_user.default_person_image_url
    ):
        person_image_url = current_user.default_person_image_url.strip()
        used_default_person_photo = True
    if not _is_http_url(person_image_url):
        raise HTTPException(
            status_code=422,
            detail=(
                "Combo try-on requires a person_image_url or a saved "
                "default person photo. Upload one in Settings -> Profile photo."
            ),
        )

    matches_default_photo = (
        _is_http_url(current_user.default_person_image_url)
        and current_user.default_person_image_url.strip() == person_image_url
    )
    cached_default_person_url = (
        current_user.default_person_image_url.strip()
        if matches_default_photo
        else None
    )
    cached_smart_crop_url = (
        current_user.default_person_smart_crop_url
        if matches_default_photo and current_user.default_person_smart_crop_url
        else None
    )
    cached_face_url = (
        current_user.default_person_face_url
        if matches_default_photo and current_user.default_person_face_url
        else None
    )
    cached_face_embedding = (
        list(current_user.default_person_face_embedding)
        if matches_default_photo and current_user.default_person_face_embedding
        else None
    )

    # Deduplicate while preserving order (user might accidentally stage
    # the same garment twice).
    seen: set[int] = set()
    ordered_ids: List[int] = []
    for gid in data.garment_ids:
        if gid in seen:
            continue
        seen.add(gid)
        ordered_ids.append(gid)
    if not ordered_ids:
        raise HTTPException(status_code=422, detail="No garment_ids provided")
    if len(ordered_ids) < 2:
        raise HTTPException(
            status_code=422,
            detail=(
                "Combo try-on needs at least 2 garments. "
                "Use /api/tryon/generate for single-garment runs."
            ),
        )

    garments = (
        db.query(Garment)
        .filter(Garment.id.in_(ordered_ids), Garment.user_id == current_user.id)
        .all()
    )
    garment_by_id = {g.id: g for g in garments}
    missing = [gid for gid in ordered_ids if gid not in garment_by_id]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Garment(s) not found or not yours: {missing}",
        )

    # Build the ordered chain payload. Garments should generally be
    # ordered bottom-layer -> top-layer so the last applied garment sits
    # on top. The UI enforces this (pants first, then shirt) but we
    # don't second-guess it server-side.
    chain_payload: List[Dict[str, Any]] = []
    for gid in ordered_ids:
        g = garment_by_id[gid]
        # Prefer the background-removed garment crop when available --
        # gives the provider a cleaner input and a crisper composite.
        effective_garment_url = g.extracted_image_url or g.image_url
        effective_s3_key = g.extracted_s3_key if g.extracted_image_url else g.s3_key
        provider_url = (
            storage.to_provider_access_url(effective_garment_url, effective_s3_key)
            or effective_garment_url
        )
        chain_payload.append(
            {
                "garment_id": g.id,
                "image_url": provider_url,
                "category": (g.category or g.garment_type or "").strip().lower() or None,
                "description": (
                    g.description or g.category or g.garment_type or g.name or "a garment"
                ),
            }
        )

    # Force fast/balanced for combo -- the `best` lane's multi-sample +
    # CLIP pick isn't meaningful when we're chaining single-candidate
    # runs. Saves users from burning credits unnecessarily.
    quality = (data.quality or "fast").lower().strip()
    if quality not in {"fast", "balanced"}:
        quality = "balanced"

    provider_override = (x_tryon_provider or "").strip().lower() or None
    if provider_override and provider_override not in {"fashn", "replicate_legacy"}:
        raise HTTPException(
            status_code=400,
            detail="X-TryOn-Provider must be one of: fashn, replicate_legacy",
        )
    # Combo chaining only works with Fashn today -- the legacy Replicate
    # 5-stage pipeline isn't designed for feed-forward runs.
    effective_provider = provider_override or settings.TRYON_PROVIDER
    if effective_provider != "fashn":
        raise HTTPException(
            status_code=400,
            detail=(
                "Combo try-on requires the Fashn provider. "
                "Set TRYON_PROVIDER=fashn or pass X-TryOn-Provider: fashn."
            ),
        )

    # Persist the TryOn row. We point `garment_id` at the FIRST garment
    # (UI & affiliate "Buy this" defaults to that one). The full chain
    # lives in pipeline_metadata.combo_garment_ids so history can render
    # a multi-garment chip.
    primary_garment = garment_by_id[ordered_ids[0]]
    tryon = TryOn(
        user_id=current_user.id,
        garment_id=primary_garment.id,
        person_image_url=person_image_url,
        garment_image_url=primary_garment.image_url,
        tryon_mode=requested_mode,
        status=TryOnStatus.QUEUED,
        lifecycle_status="queued",
        queue_enqueued_at=_utc_now(),
        pipeline_metadata={
            "mode": requested_mode,
            "combo": True,
            "combo_garment_ids": ordered_ids,
            "quality_requested": data.quality,
            "quality_effective": quality,
            "queue_mode": "thread",
            "quota": quota_snapshot,
            "provider_override": provider_override,
            "provider_default": settings.TRYON_PROVIDER,
            "used_default_person_photo": used_default_person_photo,
            "used_default_photo_cache": bool(matches_default_photo),
        },
    )
    db.add(tryon)
    db.commit()
    db.refresh(tryon)

    # Combo always runs inline in a thread for now -- the dedicated
    # Celery task is scoped to single-garment runs and the chain logic
    # isn't idempotent enough yet to share a retry path. Quota is
    # enforced upstream so we aren't letting users dodge billing.
    person_for_provider = (
        storage.to_provider_access_url(person_image_url)
        if _is_http_url(person_image_url)
        else person_image_url
    )

    thread = threading.Thread(
        target=_run_combo_in_background,
        args=(
            tryon.id,
            person_for_provider,
            chain_payload,
            quality,
            provider_override,
            cached_default_person_url,
            cached_smart_crop_url,
            cached_face_url,
            cached_face_embedding,
        ),
        name=f"tryon-combo-{tryon.id}",
        daemon=True,
    )
    thread.start()

    return {
        "success": True,
        "data": {
            "tryon_id": tryon.id,
            "status": tryon.status.value,
            "estimated_time": f"{30 * len(ordered_ids)}-{90 * len(ordered_ids)} seconds",
            "execution_mode": "thread",
            "combo_garment_ids": ordered_ids,
            "quality_lane": quality,
            "mode": requested_mode,
            "provider": effective_provider,
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


# ── Progress + label maps ──────────────────────────────────────
#
# We support two execution shapes:
#   * Single-call providers (Fashn, future Klingai) — only emit the short
#     queued/processing/completed lifecycle. The labels below describe a
#     clean 3-step flow ("Queued -> Generating -> Complete").
#   * Legacy multi-stage Replicate pipeline — emits the richer set of
#     statuses (garment extraction, quality gate, refinement, rating).
#
# Both shapes share this single map; the legacy entries are essentially
# dead for the default provider but still populated for the
# `replicate_legacy` shim.

PROGRESS_MAP = {
    TryOnStatus.PENDING: 5,
    TryOnStatus.QUEUED: 10,
    TryOnStatus.STAGE1_PROCESSING: 55,
    TryOnStatus.STAGE1_COMPLETED: 80,
    # Layer 2 post-processing (Fashn provider only).
    TryOnStatus.POSTPROCESSING: 90,
    # Legacy multi-stage entries (only the replicate_legacy provider hits these).
    TryOnStatus.GARMENT_EXTRACTING: 15,
    TryOnStatus.GARMENT_EXTRACTED: 20,
    TryOnStatus.QUALITY_CHECKING: 65,
    TryOnStatus.QUALITY_PASSED: 70,
    TryOnStatus.QUALITY_FAILED: 70,
    TryOnStatus.STAGE2_PROCESSING: 85,
    TryOnStatus.RATING_COMPUTING: 95,
    # 3D path.
    TryOnStatus.AVATAR_3D_GENERATING: 35,
    TryOnStatus.GARMENT_FITTING_3D: 65,
    TryOnStatus.MODEL_RENDERING_3D: 90,
    TryOnStatus.COMPLETED: 100,
    TryOnStatus.FAILED: 0,
    TryOnStatus.DEAD_LETTER: 0,
}

STAGE_LABEL_MAP = {
    TryOnStatus.PENDING: "Preparing...",
    TryOnStatus.QUEUED: "Queued...",
    TryOnStatus.STAGE1_PROCESSING: "Generating your virtual try-on...",
    TryOnStatus.STAGE1_COMPLETED: "Finalizing try-on...",
    # Layer 2 post-processing. The sub-stage (face / upscale / identity) is
    # surfaced via pipeline_metadata.postprocess.current_stage when present.
    TryOnStatus.POSTPROCESSING: "Polishing your try-on...",
    # Legacy multi-stage labels.
    TryOnStatus.GARMENT_EXTRACTING: "Extracting garment from image...",
    TryOnStatus.GARMENT_EXTRACTED: "Garment extracted, starting try-on...",
    TryOnStatus.QUALITY_CHECKING: "Assessing try-on quality...",
    TryOnStatus.QUALITY_PASSED: "Quality check passed!",
    TryOnStatus.QUALITY_FAILED: "Improving result with AI refinement...",
    TryOnStatus.STAGE2_PROCESSING: "Refining with SDXL + ControlNet...",
    TryOnStatus.RATING_COMPUTING: "Computing final quality rating...",
    # 3D path.
    TryOnStatus.AVATAR_3D_GENERATING: "Building your 3D mannequin...",
    TryOnStatus.GARMENT_FITTING_3D: "Fitting garment on 3D mannequin...",
    TryOnStatus.MODEL_RENDERING_3D: "Rendering 360° 3D output...",
    TryOnStatus.COMPLETED: "Complete!",
    TryOnStatus.FAILED: "Failed",
    TryOnStatus.DEAD_LETTER: "Queued job failed permanently",
}

# Granular sub-stage labels for the Layer 2 postprocess pipeline. The
# runner stamps these onto pipeline_metadata.postprocess.current_stage
# so the frontend can show "Enhancing face..." instead of the generic
# POSTPROCESSING label when desired.
POSTPROCESS_STAGE_LABELS = {
    "postprocess_identity": "Checking identity match...",
    "postprocess_face": "Enhancing face details (GFPGAN)...",
    "postprocess_upscale": "Upscaling output (Real-ESRGAN)...",
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

    _maybe_fail_stale_tryon(tryon, db)
    db.refresh(tryon)

    # When we're inside the Layer 2 postprocess pipeline the runner stashes
    # the granular sub-stage on pipeline_metadata.postprocess.current_stage.
    # Promote that to the user-visible label so the UI can show "Enhancing
    # face..." instead of the generic "Polishing your try-on..." fallback.
    base_label = STAGE_LABEL_MAP.get(tryon.status, "Unknown")
    if tryon.status == TryOnStatus.POSTPROCESSING and isinstance(
        tryon.pipeline_metadata, dict
    ):
        sub_stage = (
            (tryon.pipeline_metadata.get("postprocess") or {}).get("current_stage")
        )
        if sub_stage in POSTPROCESS_STAGE_LABELS:
            base_label = POSTPROCESS_STAGE_LABELS[sub_stage]

    return {
        "success": True,
        "data": {
            "tryon_id": tryon.id,
            "status": tryon.status.value,
            "tryon_mode": tryon.tryon_mode,
            "progress": PROGRESS_MAP.get(tryon.status, 0),
            "current_stage": base_label,
            "extracted_garment_url": _presign_for_browser(tryon.extracted_garment_url),
            "stage1_result_url": _presign_for_browser(tryon.stage1_result_url),
            "result_image_url": _presign_for_browser(tryon.result_image_url),
            "result_model_url": _presign_for_browser(tryon.result_model_url),
            "result_turntable_url": _presign_for_browser(tryon.result_turntable_url),
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

    _maybe_fail_stale_tryon(tryon, db)
    db.refresh(tryon)

    return {
        "success": True,
        "data": _presign_tryon_payload(TryOnResponse.model_validate(tryon).model_dump()),
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
            "tryons": [
                _presign_tryon_payload(TryOnResponse.model_validate(t).model_dump())
                for t in tryons
            ],
            "total": len(tryons),
            "skip": skip,
            "limit": limit,
            "quota": quota_snapshot,
        },
    }
