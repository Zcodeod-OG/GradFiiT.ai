"""GradFiT - Try-On Input Preprocessor

Quality-first input normalization shared by every provider:

* Validate the URL is reachable and points at a real image.
* Strip EXIF rotation, force RGB, drop alpha (single-call providers do
  worse with PNGs that hide a transparency channel under the model).
* Enforce a minimum dimension on each axis (default 768px); auto-crop
  the person image to a portrait aspect when wildly landscape, but never
  upscale.
* Re-upload the normalized image to S3 only when we actually changed it,
  cached by SHA-256 so repeated runs share the same artifact URL.

The preprocessor is intentionally best-effort: if we can't download or
normalize the image, we return the original URL unchanged and emit a
warning. The downstream provider will surface a real error if it matters.
"""

from __future__ import annotations

import hashlib
import io
import logging
from dataclasses import dataclass, field
from typing import Dict, Optional, Tuple

import httpx

try:
    from PIL import Image, ImageOps  # type: ignore
except ImportError:  # pragma: no cover - PIL is a hard dep but be safe
    Image = None  # type: ignore
    ImageOps = None  # type: ignore

from app.config import settings
from app.services.storage import get_storage

logger = logging.getLogger(__name__)


# Minimum on each axis. We default to 768 (Fashn requires >=512 to avoid
# pose detection errors; 768 gives a safety margin and keeps the visible
# detail acceptable for the "best" lane).
_MIN_DIMENSION = 768

# Auto-crop the person image to portrait when the source aspect ratio is
# wider than this. A portrait crop dramatically improves Fashn results
# because the model assumes a roughly portrait full-body framing.
_MAX_LANDSCAPE_RATIO = 1.05  # if width/height > this we crop to portrait

# Hard cap so we don't ship 4K masters to a provider that downscales them
# anyway.
_MAX_DIMENSION = 2048

_DOWNLOAD_TIMEOUT = 30


@dataclass
class PreprocessResult:
    """What the preprocessor returns to the caller."""

    person_image_url: str
    garment_image_url: str
    person_changed: bool = False
    garment_changed: bool = False
    notes: Dict[str, str] = field(default_factory=dict)


# Per-process cache: original_url -> normalized_url. Keeps repeat Celery
# replays cheap. Storage layer also dedupes by SHA-256 key on S3.
_NORMALIZED_URL_CACHE: Dict[str, str] = {}


class TryOnPreprocessor:
    """Normalize person/garment URLs before handing them to a provider."""

    def __init__(self) -> None:
        self._storage = get_storage()
        # Reused HTTPX client for downloads (provider URLs are usually warm).
        self._client = httpx.Client(timeout=_DOWNLOAD_TIMEOUT, follow_redirects=True)

    def preprocess(
        self,
        *,
        person_image_url: str,
        garment_image_url: str,
        person_role: str = "person",
        garment_role: str = "garment",
    ) -> PreprocessResult:
        notes: Dict[str, str] = {}
        person_url, person_changed, person_note = self._normalize(
            person_image_url, role=person_role, force_portrait=True
        )
        if person_note:
            notes[f"{person_role}"] = person_note

        garment_url, garment_changed, garment_note = self._normalize(
            garment_image_url, role=garment_role, force_portrait=False
        )
        if garment_note:
            notes[f"{garment_role}"] = garment_note

        return PreprocessResult(
            person_image_url=person_url,
            garment_image_url=garment_url,
            person_changed=person_changed,
            garment_changed=garment_changed,
            notes=notes,
        )

    # ── Internals ─────────────────────────────────────────────

    def _normalize(
        self, url: Optional[str], *, role: str, force_portrait: bool
    ) -> Tuple[str, bool, Optional[str]]:
        """Return (normalized_url, changed, note). On any failure return the
        original URL unchanged with an explanatory note."""
        if not url:
            return url or "", False, "missing_url"

        if Image is None or ImageOps is None:
            return url, False, "pillow_unavailable"

        cached = _NORMALIZED_URL_CACHE.get(url)
        if cached:
            return cached, cached != url, "cache_hit"

        try:
            data, content_type = self._download(url)
        except Exception as exc:
            logger.warning("Preprocessor: could not download %s (%s)", url, exc)
            return url, False, f"download_failed:{exc}"

        try:
            image = Image.open(io.BytesIO(data))
            image.load()
        except Exception as exc:
            logger.warning("Preprocessor: could not decode %s (%s)", url, exc)
            return url, False, f"decode_failed:{exc}"

        original_size = image.size
        normalized, mutations = self._apply_transforms(
            image, force_portrait=force_portrait
        )

        if not mutations:
            _NORMALIZED_URL_CACHE[url] = url
            return url, False, None

        try:
            blob, content_type, ext = self._encode(normalized)
        except Exception as exc:
            logger.warning("Preprocessor: encode failed for %s (%s)", url, exc)
            return url, False, f"encode_failed:{exc}"

        try:
            new_url = self._upload_normalized(blob, role=role, ext=ext, content_type=content_type)
        except Exception as exc:
            logger.warning("Preprocessor: upload failed for %s (%s)", url, exc)
            return url, False, f"upload_failed:{exc}"

        _NORMALIZED_URL_CACHE[url] = new_url
        note = ",".join(mutations) + f" (orig {original_size[0]}x{original_size[1]})"
        return new_url, True, note

    def _download(self, url: str) -> Tuple[bytes, str]:
        # Presign private-bucket URLs before fetching; otherwise the plain
        # virtual-hosted URL returns 403 and normalisation silently no-ops.
        fetch_url = self._storage.to_provider_access_url(url, expiration=600) or url
        response = self._client.get(fetch_url)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "").lower()
        return response.content, content_type

    def _apply_transforms(
        self, image: "Image.Image", *, force_portrait: bool
    ) -> Tuple["Image.Image", list]:
        mutations: list = []

        # 1. Apply EXIF rotation so the displayed orientation matches the
        # pixel orientation. This is the single biggest source of "model
        # is sideways" bugs in mobile uploads.
        try:
            transposed = ImageOps.exif_transpose(image)
            if transposed is not image:
                mutations.append("exif")
                image = transposed
        except Exception:
            pass

        # 2. Force RGB (drops alpha). Most VTON pipelines treat alpha as a
        # mask and produce halo artifacts when it sneaks through.
        if image.mode != "RGB":
            mutations.append(f"mode:{image.mode}->RGB")
            image = image.convert("RGB")

        # 3. Optional portrait crop for the person image. We center-crop
        # to a 3:4 (portrait) aspect when the source is significantly
        # wider than tall; we never crop a portrait shorter.
        if force_portrait:
            w, h = image.size
            if h > 0 and (w / h) > _MAX_LANDSCAPE_RATIO:
                target_ratio = 3 / 4  # width / height
                new_w = int(h * target_ratio)
                if new_w > 0 and new_w < w:
                    left = max(0, (w - new_w) // 2)
                    image = image.crop((left, 0, left + new_w, h))
                    mutations.append("portrait_crop")

        # 4. Cap maximum dimension so we don't ship 4K to providers that
        # downscale anyway.
        w, h = image.size
        long_edge = max(w, h)
        if long_edge > _MAX_DIMENSION:
            scale = _MAX_DIMENSION / float(long_edge)
            new_size = (max(1, int(w * scale)), max(1, int(h * scale)))
            image = image.resize(new_size, Image.LANCZOS)
            mutations.append(f"downscale:{long_edge}->{_MAX_DIMENSION}")

        # 5. Reject images that are too small on either axis. We don't
        # upscale (that always hurts quality); instead we record a note
        # and leave the original as-is so the provider can decide.
        w, h = image.size
        if min(w, h) < _MIN_DIMENSION:
            mutations.append(f"warn_min:{w}x{h}<{_MIN_DIMENSION}")

        return image, mutations

    def _encode(self, image: "Image.Image") -> Tuple[bytes, str, str]:
        fmt = (settings.TRYON_OUTPUT_FORMAT or "jpeg").upper()
        if fmt == "JPEG" or fmt == "JPG":
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=92, optimize=True, progressive=True)
            return buffer.getvalue(), "image/jpeg", "jpg"
        # Default to PNG for lossless input handoff.
        buffer = io.BytesIO()
        image.save(buffer, format="PNG", optimize=True)
        return buffer.getvalue(), "image/png", "png"

    def _upload_normalized(
        self,
        blob: bytes,
        *,
        role: str,
        ext: str,
        content_type: str,
    ) -> str:
        sha = hashlib.sha256(blob).hexdigest()
        key = f"tryon_inputs/{role}/{sha}.{ext}"

        s3 = self._storage.s3_client
        bucket = self._storage.bucket_name

        # Skip the PUT if the object already exists (S3 dedup via key).
        try:
            s3.head_object(Bucket=bucket, Key=key)
        except Exception:
            s3.put_object(
                Bucket=bucket,
                Key=key,
                Body=blob,
                ContentType=content_type,
                CacheControl="public, max-age=86400",
            )

        return f"https://{bucket}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"


_preprocessor: Optional[TryOnPreprocessor] = None


def get_tryon_preprocessor() -> TryOnPreprocessor:
    global _preprocessor
    if _preprocessor is None:
        _preprocessor = TryOnPreprocessor()
    return _preprocessor


__all__ = [
    "TryOnPreprocessor",
    "PreprocessResult",
    "get_tryon_preprocessor",
]
