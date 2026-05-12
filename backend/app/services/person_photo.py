"""Background preprocessing for the user's canonical person photo.

The signup-time photo upload only stores the raw S3 URL on the user. The
heavy ML work (Layer-1 input gate via YOLO11-pose, face crop, CLIP face
embedding) runs here so it can be dispatched to a Celery worker instead
of blocking the upload HTTP request -- those steps take 60s+ on a cold
Render dyno and were timing out the signup flow.

This module is best-effort: every step is wrapped so a missing model,
unreachable Replicate API, or transient S3 error degrades to "cache not
populated" rather than raising. The try-on pipeline already re-runs the
gate and re-embeds the face when the cached fields are empty, so a
missed precompute just means the first try-on pays the cost.
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any, Mapping

from sqlalchemy.orm import Session

from app.models.user import User
from app.services.face_processor import get_face_processor
from app.services.tryon_input_gate import get_tryon_input_gate

logger = logging.getLogger(__name__)


def _normalize_face_embedding(embedding: Any) -> list[float] | None:
    if embedding is None:
        return None
    try:
        return [float(x) for x in embedding]
    except (TypeError, ValueError):
        return None


def _json_safe_gate_metrics(metrics: Mapping[str, Any]) -> dict[str, Any]:
    def _walk(obj: Any, depth: int = 0) -> Any:
        if depth > 14:
            return None
        if obj is None:
            return None
        if isinstance(obj, bool):
            return obj
        if isinstance(obj, int) and not isinstance(obj, bool):
            return obj
        if isinstance(obj, float):
            if math.isnan(obj) or math.isinf(obj):
                return None
            return obj
        if isinstance(obj, str):
            return obj if len(obj) <= 6000 else obj[:5997] + "..."
        if isinstance(obj, bytes):
            return None
        if isinstance(obj, Mapping):
            out: dict[str, Any] = {}
            for k, v in list(obj.items())[:100]:
                key = str(k)[:160]
                out[key] = _walk(v, depth + 1)
            return out
        if isinstance(obj, (list, tuple)):
            return [_walk(v, depth + 1) for v in list(obj)[:200]]
        if hasattr(obj, "item"):
            try:
                return _walk(obj.item(), depth + 1)
            except Exception:
                pass
        try:
            return float(obj)
        except (TypeError, ValueError):
            return str(obj)[:6000]

    cleaned = _walk(dict(metrics))
    return cleaned if isinstance(cleaned, dict) else {"_truncated": True}


def precompute_person_photo_artifacts(db: Session, user: User) -> bool:
    """Populate the cached gate/face fields for ``user.default_person_image_url``.

    Returns True when at least the input-gate step succeeded. Writes are
    committed by the caller (we only stage them on ``user``) so we don't
    fight with a surrounding transaction.
    """
    url = (user.default_person_image_url or "").strip()
    if not url:
        return False

    gate_result = get_tryon_input_gate().validate(url)
    smart_crop_url = (
        gate_result.person_image_url
        if gate_result.smart_cropped and gate_result.person_image_url
        else None
    )

    face_processor = get_face_processor()
    face_url: str | None = None
    face_embedding: list[float] | None = None
    try:
        face_url = face_processor.crop_face_url(smart_crop_url or url)
        if face_url:
            face_embedding = _normalize_face_embedding(
                face_processor.embed_face(smart_crop_url or url)
            )
    except Exception as exc:
        logger.warning("precompute_person_photo: face step failed for user %s: %s", user.id, exc)

    user.default_person_smart_crop_url = smart_crop_url
    user.default_person_face_url = face_url
    user.default_person_face_embedding = face_embedding
    user.default_person_input_gate_metrics = {
        "passed": bool(gate_result.passed),
        "reasons": [str(r)[:2000] for r in (gate_result.reasons or [])][:50],
        "smart_cropped": bool(gate_result.smart_cropped),
        "metrics": _json_safe_gate_metrics(gate_result.metrics or {}),
    }
    if user.default_person_uploaded_at is None:
        user.default_person_uploaded_at = datetime.now(timezone.utc)
    return True


__all__ = [
    "precompute_person_photo_artifacts",
    "_normalize_face_embedding",
    "_json_safe_gate_metrics",
]
