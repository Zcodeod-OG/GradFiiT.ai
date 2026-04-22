"""GradFiT - Background isolate + composite (rembg / BiRefNet, MIT).

Optional Layer 1/2 step: feed the VTON provider a person on a neutral
background, then composite the VTON output back onto the original
photo's background. Uses ``rembg`` for the alpha matte (BiRefNet weights
under the hood, all MIT-licensed and commercial-safe).

Both helpers are safe no-ops when their flags are off.
"""

from __future__ import annotations

import io
import logging
from typing import Any, Dict, Optional, Tuple

from app.config import settings
from app.services.postprocess import download_bytes, upload_artifact

logger = logging.getLogger(__name__)


_NEUTRAL_BG_RGB = (244, 244, 244)


def _ensure_pillow():
    try:
        from PIL import Image  # type: ignore
        return Image
    except ImportError:  # pragma: no cover
        logger.warning("bg_compose: Pillow unavailable")
        return None


def _ensure_rembg():
    try:
        from rembg import remove  # type: ignore
        return remove
    except ImportError:
        logger.warning(
            "bg_compose: 'rembg' not installed; install with `pip install rembg`"
        )
        return None


def isolate_person(person_image_url: str) -> Tuple[Optional[str], Dict[str, Any]]:
    """Replace the background of the person image with a neutral grey.

    Returns ``(new_url, meta)``. ``new_url`` is ``None`` when disabled
    or when the rembg call failed; the runner should fall back to the
    original URL in that case.
    """
    if not settings.BG_ISOLATE_ENABLED:
        return None, {"step": "bg_isolate", "status": "disabled"}

    Image = _ensure_pillow()
    rembg_remove = _ensure_rembg()
    if Image is None or rembg_remove is None:
        return None, {"step": "bg_isolate", "status": "skipped_missing_dep"}

    try:
        blob = download_bytes(person_image_url)
        person = Image.open(io.BytesIO(blob))
        person.load()
        if person.mode != "RGBA":
            person = person.convert("RGBA")

        alpha_blob = rembg_remove(blob)
        cutout = Image.open(io.BytesIO(alpha_blob))
        cutout.load()
        if cutout.mode != "RGBA":
            cutout = cutout.convert("RGBA")

        bg = Image.new("RGB", cutout.size, _NEUTRAL_BG_RGB)
        bg.paste(cutout, mask=cutout.split()[-1])

        buffer = io.BytesIO()
        bg.save(buffer, format="JPEG", quality=92, optimize=True, progressive=True)
        url = upload_artifact(
            buffer.getvalue(), role="bg_isolated", ext="jpg", content_type="image/jpeg"
        )
        return url, {"step": "bg_isolate", "status": "ok"}
    except Exception as exc:
        logger.warning("bg_isolate: failed (%s)", exc)
        return None, {"step": "bg_isolate", "status": "failed", "error": str(exc)}


def compose_back(
    *,
    vton_image_url: str,
    original_person_image_url: str,
) -> Tuple[Optional[str], Dict[str, Any]]:
    """Paste the VTON foreground (rembg-cut) onto the original person
    image's background. Useful only when ``isolate_person`` was used so
    the original BG is the user's actual photo.
    """
    if not settings.BG_COMPOSE_ENABLED:
        return None, {"step": "bg_compose", "status": "disabled"}

    Image = _ensure_pillow()
    rembg_remove = _ensure_rembg()
    if Image is None or rembg_remove is None:
        return None, {"step": "bg_compose", "status": "skipped_missing_dep"}

    try:
        bg_blob = download_bytes(original_person_image_url)
        bg_image = Image.open(io.BytesIO(bg_blob))
        bg_image.load()
        if bg_image.mode != "RGB":
            bg_image = bg_image.convert("RGB")

        vton_blob = download_bytes(vton_image_url)
        vton_cutout_blob = rembg_remove(vton_blob)
        cutout = Image.open(io.BytesIO(vton_cutout_blob))
        cutout.load()
        if cutout.mode != "RGBA":
            cutout = cutout.convert("RGBA")

        # Resize the BG to match the VTON dimensions (VTON usually
        # produces a fixed resolution like 1024x).
        if bg_image.size != cutout.size:
            bg_image = bg_image.resize(cutout.size, Image.Resampling.LANCZOS)

        bg_image.paste(cutout, mask=cutout.split()[-1])

        buffer = io.BytesIO()
        bg_image.save(buffer, format="JPEG", quality=92, optimize=True, progressive=True)
        url = upload_artifact(
            buffer.getvalue(), role="bg_composed", ext="jpg", content_type="image/jpeg"
        )
        return url, {"step": "bg_compose", "status": "ok"}
    except Exception as exc:
        logger.warning("bg_compose: failed (%s)", exc)
        return None, {"step": "bg_compose", "status": "failed", "error": str(exc)}


__all__ = ["isolate_person", "compose_back"]
