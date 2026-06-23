import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException, Request, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import Deque, Dict, List, Optional

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.services.storage import StorageService
from app.api.deps import get_current_active_user, get_optional_active_user

router = APIRouter()

# In-memory per-IP rate counter for anonymous public uploads. Sliding 1h
# window. Sufficient for single-instance dev and small Render deployments;
# swap for Redis-backed counter on multi-worker prod hosts.
_PUBLIC_UPLOAD_HITS: Dict[str, Deque[float]] = defaultdict(deque)
_PUBLIC_UPLOAD_LOCK = Lock()
_PUBLIC_UPLOAD_WINDOW_SECONDS = 3600

# Anon public uploads are capped tighter than the authed flow to stop abuse.
_PUBLIC_UPLOAD_MAX_BYTES = 8 * 1024 * 1024  # 8 MiB
_PUBLIC_UPLOAD_ALLOWED_CT = {"image/jpeg", "image/png", "image/webp"}


def _client_ip(request: Request) -> str:
    """Best-effort client IP for rate limiting (honours X-Forwarded-For)."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip() or "anon"
    if request.client and request.client.host:
        return request.client.host
    return "anon"


def _check_public_upload_rate(ip: str) -> None:
    limit = max(0, int(getattr(settings, "ANON_PUBLIC_UPLOAD_HOURLY_LIMIT", 20)))
    if limit == 0:
        # Public uploads disabled by config.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Anonymous uploads are disabled. Please sign in.",
        )
    now = time.time()
    cutoff = now - _PUBLIC_UPLOAD_WINDOW_SECONDS
    with _PUBLIC_UPLOAD_LOCK:
        bucket = _PUBLIC_UPLOAD_HITS[ip]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    "Upload rate limit reached. Sign in for unlimited uploads, "
                    "or try again in an hour."
                ),
            )
        bucket.append(now)


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Upload an image file"""
    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an image",
        )

    # Upload to S3
    storage_service = StorageService()
    try:
        s3_key, url = storage_service.upload_file(
            file.file, file.filename, current_user.id
        )
        return {"s3_key": s3_key, "url": url}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload file: {str(e)}",
        )


@router.post("/garment")
async def upload_garment(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Upload a garment image"""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an image",
        )

    storage_service = StorageService()
    try:
        s3_key, url = storage_service.upload_garment(
            file.file, file.filename, current_user.id
        )
        return {"s3_key": s3_key, "url": url}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload garment: {str(e)}",
        )


@router.post("/public-image")
async def upload_public_image(
    request: Request,
    file: UploadFile = File(...),
    current_user: Optional[User] = Depends(get_optional_active_user),
):
    """Upload an image without requiring an account.

    Powers the friction-free guest flow on /try. Authenticated callers are
    routed to the normal per-user upload path so their files land in their
    own S3 prefix (and avoid the anon rate limit). Anonymous callers are
    rate-limited per IP and their files land under public-uploads/ with
    a 24h lifecycle expiry (configured on the bucket).
    """
    # Accept the standard JPG/PNG/WEBP set, but be lenient on any image/*
    # content-type (some browsers send e.g. image/heic when a phone photo
    # was auto-converted to JPG mid-upload).
    ct = (file.content_type or "").lower()
    if ct and ct not in _PUBLIC_UPLOAD_ALLOWED_CT and not ct.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a JPG, PNG, or WEBP image",
        )

    # Read into memory once so we can enforce a hard byte cap (UploadFile.size
    # is None for streamed multipart payloads).
    raw = await file.read()
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty file",
        )
    if len(raw) > _PUBLIC_UPLOAD_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {_PUBLIC_UPLOAD_MAX_BYTES // (1024 * 1024)} MB limit",
        )

    storage_service = StorageService()

    # Authenticated callers get the normal per-user path (no rate limit).
    if current_user is not None:
        import io

        try:
            s3_key, url = storage_service.upload_file(
                io.BytesIO(raw), file.filename or "upload.jpg", current_user.id
            )
            return {"s3_key": s3_key, "url": url, "guest": False}
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to upload file: {str(e)}",
            )

    # Anonymous: rate limit by IP, then push to public-uploads/.
    _check_public_upload_rate(_client_ip(request))

    import io

    try:
        s3_key, url = storage_service.upload_public(
            io.BytesIO(raw),
            file.filename or "guest.jpg",
            content_type=file.content_type,
        )
        return {"s3_key": s3_key, "url": url, "guest": True}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload file: {str(e)}",
        )

