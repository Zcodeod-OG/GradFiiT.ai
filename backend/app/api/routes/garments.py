import io
import logging
import threading
from typing import List, Optional
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import settings
from app.models.user import User
from app.models.garment import Garment
from app.schemas.garment import Garment as GarmentSchema, GarmentCreate, GarmentUpdate
from app.api.deps import get_current_active_user
from app.services.garment_runner import run_garment_preprocess
from app.services.storage import get_storage
from app.services.tasks import process_garment_task

logger = logging.getLogger(__name__)

router = APIRouter()


# Garment images live in a private S3 bucket, so the bare
# `https://bucket.s3.region.amazonaws.com/...` URL 403s when loaded
# directly by the browser. We always serialise garments through this
# helper so `image_url` / `extracted_image_url` come back as short-lived
# presigned URLs the UI can render straight into <img src>. External
# URLs (retailer CDN mirrors, etc.) pass through unchanged.
_GARMENT_PRESIGN_EXPIRATION = 3600


def _serialise_garment(garment: Garment) -> GarmentSchema:
    storage = get_storage()
    data = GarmentSchema.model_validate(garment)
    if garment.image_url:
        data.image_url = (
            storage.to_provider_access_url(
                garment.image_url,
                s3_key=garment.s3_key,
                expiration=_GARMENT_PRESIGN_EXPIRATION,
            )
            or garment.image_url
        )
    if garment.extracted_image_url:
        data.extracted_image_url = (
            storage.to_provider_access_url(
                garment.extracted_image_url,
                s3_key=garment.extracted_s3_key,
                expiration=_GARMENT_PRESIGN_EXPIRATION,
            )
            or garment.extracted_image_url
        )
    return data


class GarmentFromUrlRequest(BaseModel):
    """Payload for the Chrome extension's Quick Try flow.

    We ingest the garment image from any retailer page, so we only need
    the public image URL plus a friendly name. Everything else is
    optional metadata that helps later when the user revisits history.
    """

    image_url: str = Field(..., description="Public URL of the garment image")
    name: Optional[str] = Field(None, max_length=120)
    description: Optional[str] = Field(None, max_length=500)
    category: Optional[str] = Field(None, max_length=60)
    source_url: Optional[str] = Field(None, max_length=2048)
    save_to_closet: bool = False


_ALLOWED_IMAGE_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
}

_EXT_FROM_CONTENT_TYPE = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}


def _infer_extension(url: str, content_type: str) -> str:
    normalized = (content_type or "").lower().split(";")[0].strip()
    if normalized in _EXT_FROM_CONTENT_TYPE:
        return _EXT_FROM_CONTENT_TYPE[normalized]
    path = urlparse(url).path.lower()
    for ext in ("jpg", "jpeg", "png", "webp", "gif"):
        if path.endswith(f".{ext}"):
            return "jpg" if ext == "jpeg" else ext
    return "jpg"


@router.get("/", response_model=List[GarmentSchema])
def get_garments(
    skip: int = 0,
    limit: int = 100,
    saved_only: bool = False,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get all garments for current user"""
    query = db.query(Garment).filter(Garment.user_id == current_user.id)
    if saved_only:
        query = query.filter(Garment.saved_to_closet.is_(True))
    garments = query.offset(skip).limit(limit).all()
    return [_serialise_garment(g) for g in garments]


@router.get("/{garment_id}", response_model=GarmentSchema)
def get_garment(
    garment_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get a specific garment"""
    garment = (
        db.query(Garment)
        .filter(Garment.id == garment_id, Garment.user_id == current_user.id)
        .first()
    )
    if not garment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Garment not found"
        )
    return _serialise_garment(garment)


@router.post("/", response_model=GarmentSchema, status_code=status.HTTP_201_CREATED)
def create_garment(
    garment: GarmentCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Create a new garment"""
    db_garment = Garment(
        **garment.model_dump(),
        user_id=current_user.id,
        preprocess_status="queued",
        preprocess_error=None,
    )
    db.add(db_garment)
    db.commit()
    db.refresh(db_garment)

    if settings.ENABLE_CELERY_GARMENT_PREPROCESS:
        try:
            process_garment_task.apply_async(args=(db_garment.id,), ignore_result=True)
        except Exception:
            db_garment.preprocess_status = "processing"
            db.commit()
            run_garment_preprocess(db_garment.id)
    else:
        db_garment.preprocess_status = "processing"
        db.commit()
        run_garment_preprocess(db_garment.id)
    db.refresh(db_garment)
    return _serialise_garment(db_garment)


@router.put("/{garment_id}", response_model=GarmentSchema)
def update_garment(
    garment_id: int,
    garment_update: GarmentUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Update a garment"""
    db_garment = (
        db.query(Garment)
        .filter(Garment.id == garment_id, Garment.user_id == current_user.id)
        .first()
    )
    if not db_garment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Garment not found"
        )

    update_data = garment_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_garment, field, value)

    db.commit()
    db.refresh(db_garment)
    return _serialise_garment(db_garment)


@router.post("/from-url", response_model=GarmentSchema, status_code=status.HTTP_201_CREATED)
def create_garment_from_url(
    payload: GarmentFromUrlRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Download an external garment image, store it in S3, and register it.

    This powers the Chrome extension's Quick Try (one-tap) and the
    browser-floating launcher. Retailer images can't be used directly by
    the VTON provider because they're often behind CDN referrer checks,
    so we always mirror them to our own bucket first.
    """
    image_url = (payload.image_url or "").strip()
    if not image_url.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="image_url must be an absolute http(s) URL",
        )

    # 1. Fetch the image bytes. Many retailers 403 on missing Referer/UA,
    #    so we send a browser-like header set and follow redirects.
    try:
        with httpx.Client(
            timeout=20.0,
            follow_redirects=True,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0 Safari/537.36 GradFiT/1.0"
                ),
                "Accept": "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5",
            },
        ) as client:
            response = client.get(image_url)
    except httpx.HTTPError as exc:
        logger.warning("from-url: fetch failed for %s: %s", image_url, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not download image: {exc}",
        ) from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Source image returned HTTP {response.status_code}",
        )

    content_type = (response.headers.get("content-type") or "").split(";")[0].lower().strip()
    if content_type and content_type not in _ALLOWED_IMAGE_CONTENT_TYPES:
        # Some CDNs lie about content-type; fall back to extension sniffing
        # on the URL path rather than hard-failing if it still looks like
        # an image.
        url_path = urlparse(image_url).path.lower()
        if not any(url_path.endswith(f".{e}") for e in ("jpg", "jpeg", "png", "webp", "gif")):
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"Unsupported image content-type: {content_type}",
            )

    blob = response.content
    if not blob or len(blob) < 512:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Downloaded image is too small or empty",
        )

    ext = _infer_extension(image_url, content_type)
    filename = f"garment.{ext}"

    # 2. Upload mirror copy to S3.
    storage = get_storage()
    try:
        s3_key, mirror_url = storage.upload_garment(io.BytesIO(blob), filename, current_user.id)
    except Exception as exc:  # pragma: no cover - infrastructure failure path
        logger.error("from-url: S3 upload failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist garment image",
        ) from exc

    # 3. Persist the garment row and kick off preprocessing.
    friendly_name = (payload.name or "Garment").strip()[:120] or "Garment"
    # Keep `source_url` so we can later render the "Buy this" affiliate
    # button for this garment on every try-on result.
    source_url = (payload.source_url or "").strip() or None
    if source_url and not source_url.startswith(("http://", "https://")):
        source_url = None
    db_garment = Garment(
        name=friendly_name,
        description=(payload.description or None),
        category=(payload.category or None),
        image_url=mirror_url,
        s3_key=s3_key,
        user_id=current_user.id,
        saved_to_closet=bool(payload.save_to_closet),
        preprocess_status="queued",
        preprocess_error=None,
        source_url=source_url,
    )
    db.add(db_garment)
    db.commit()
    db.refresh(db_garment)

    # Preprocessing is intentionally fire-and-forget here. The Quick Try
    # flow is latency-sensitive (the Chrome extension aborts the request
    # after ~60s), and preprocessing can take 30-60s when Replicate is
    # rate-limited or Redis/Celery is unavailable. The VTON provider only
    # needs the mirrored S3 URL we already have, so we let preprocessing
    # complete in the background and return immediately.
    garment_id = db_garment.id
    celery_dispatched = False
    if settings.ENABLE_CELERY_GARMENT_PREPROCESS:
        try:
            process_garment_task.apply_async(args=(garment_id,), ignore_result=True)
            celery_dispatched = True
        except Exception as exc:
            logger.warning(
                "from-url: Celery dispatch failed for garment %s, falling back to thread: %s",
                garment_id,
                exc,
            )

    if not celery_dispatched:
        db_garment.preprocess_status = "processing"
        db.commit()

        def _preprocess_in_thread(gid: int) -> None:
            try:
                run_garment_preprocess(gid)
            except Exception as exc:  # pragma: no cover - background safety net
                logger.error(
                    "from-url: background preprocessing failed for garment %s: %s",
                    gid,
                    exc,
                )

        threading.Thread(
            target=_preprocess_in_thread,
            args=(garment_id,),
            name=f"garment-preprocess-{garment_id}",
            daemon=True,
        ).start()

    db.refresh(db_garment)
    return _serialise_garment(db_garment)


@router.delete("/{garment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_garment(
    garment_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Delete a garment"""
    db_garment = (
        db.query(Garment)
        .filter(Garment.id == garment_id, Garment.user_id == current_user.id)
        .first()
    )
    if not db_garment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Garment not found"
        )
    db.delete(db_garment)
    db.commit()
    return None

