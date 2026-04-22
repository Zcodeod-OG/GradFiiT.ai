"""GradFiT - VTON output post-processing primitives.

This package contains the individual Layer 2 steps (face restoration,
upscaling, background composition). Each module exposes a single
``run(...)`` function that returns either a normalized result URL or
raises an exception. The orchestrator in
``app.services.tryon_postprocessor`` wires them together with
best-effort fallthrough so a failure in any one step never breaks the
whole try-on.
"""

from __future__ import annotations

import hashlib
import io
import logging
from typing import Optional, Tuple

import httpx

from app.config import settings
from app.services.storage import get_storage

logger = logging.getLogger(__name__)


def download_bytes(url: str, *, timeout: Optional[int] = None) -> bytes:
    """Download a URL with the configured postprocess timeout."""
    if not url:
        raise ValueError("download_bytes requires a non-empty URL")
    response = httpx.get(
        url,
        timeout=timeout or settings.POSTPROCESS_HTTP_TIMEOUT_SECONDS,
        follow_redirects=True,
    )
    response.raise_for_status()
    return response.content


def upload_artifact(
    blob: bytes,
    *,
    role: str,
    ext: str = "jpg",
    content_type: str = "image/jpeg",
    cache_control: str = "public, max-age=86400",
) -> str:
    """Upload a post-processed artifact to S3 keyed by SHA-256.

    Repeated calls with identical bytes share the same key, so retries
    and replays cost nothing extra.
    """
    storage = get_storage()
    sha = hashlib.sha256(blob).hexdigest()
    key = f"tryon_postprocess/{role}/{sha}.{ext}"
    bucket = storage.bucket_name
    s3 = storage.s3_client
    try:
        s3.head_object(Bucket=bucket, Key=key)
    except Exception:
        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=blob,
            ContentType=content_type,
            CacheControl=cache_control,
        )
    return f"https://{bucket}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"


def coerce_replicate_output_to_url(output: object) -> Optional[str]:
    """Replicate clients return either a string URL, a list, or a
    ``FileOutput`` object depending on version. Normalize to a URL."""
    if output is None:
        return None
    if isinstance(output, str):
        return output or None
    if isinstance(output, (list, tuple)) and output:
        first = output[0]
        if isinstance(first, str):
            return first or None
        url_attr = getattr(first, "url", None)
        if isinstance(url_attr, str) and url_attr:
            return url_attr
    url_attr = getattr(output, "url", None)
    if isinstance(url_attr, str) and url_attr:
        return url_attr
    # Last-resort: stringify (Replicate FileOutput __str__ returns the URL).
    text = str(output)
    if text.startswith("http://") or text.startswith("https://"):
        return text
    return None


def download_and_reupload(
    *,
    source_url: str,
    role: str,
    ext: str = "jpg",
    content_type: str = "image/jpeg",
) -> Tuple[str, bytes]:
    """Download a Replicate-hosted result and re-host it on our S3 so the
    URL is stable past Replicate's hosted-output retention window."""
    blob = download_bytes(source_url)
    return upload_artifact(blob, role=role, ext=ext, content_type=content_type), blob


__all__ = [
    "download_bytes",
    "upload_artifact",
    "coerce_replicate_output_to_url",
    "download_and_reupload",
]
