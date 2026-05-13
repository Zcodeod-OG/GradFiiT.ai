"""Optional YOLO11 pose helper for quick preview alignment."""

from __future__ import annotations

import io
import logging
from typing import Any, Optional

import requests
from PIL import Image

from app.config import settings

logger = logging.getLogger(__name__)


class YoloPoseService:
    def __init__(self) -> None:
        self._model = None
        self._model_loaded = False
        # Sticky disable: once we've decided we can't load (env flag off,
        # missing dep, OOM, etc.), short-circuit forever instead of paying
        # the import + attempt cost on every request. Critical on small
        # hosts where ultralytics import alone is multi-hundred-MB.
        self._disabled = False

    def _load_model(self) -> bool:
        if self._disabled:
            return False
        if self._model_loaded:
            return self._model is not None

        # Re-check the env flag at load time (rather than once at import)
        # so flipping YOLO11_POSE_ENABLED via env doesn't require a code
        # change — but if it's off, we mark disabled and never re-enter.
        if not settings.YOLO11_POSE_ENABLED:
            self._disabled = True
            self._model_loaded = True
            logger.info("YOLO11 pose disabled via config; skipping load.")
            return False

        self._model_loaded = True
        try:
            from ultralytics import YOLO  # type: ignore

            self._model = YOLO(settings.YOLO11_POSE_MODEL)
            return True
        except Exception as exc:  # pragma: no cover - optional dependency path
            logger.warning("YOLO11 pose unavailable: %s", exc)
            self._model = None
            self._disabled = True
            return False

    def estimate_pose(self, image_url: str) -> Optional[dict[str, Any]]:
        """Return compact pose metadata when YOLO11 is available."""
        if not self._load_model() or not self._model:
            return None

        try:
            response = requests.get(image_url, timeout=8)
            response.raise_for_status()
            img = Image.open(io.BytesIO(response.content)).convert("RGB")

            result = self._model.predict(img, verbose=False)[0]
            keypoints = getattr(result, "keypoints", None)
            if keypoints is None or keypoints.xy is None or len(keypoints.xy) == 0:
                return None

            points = keypoints.xy[0].tolist()
            confidences = []
            if getattr(keypoints, "conf", None) is not None:
                confidences = keypoints.conf[0].tolist()

            return {
                "engine": "yolo11_pose",
                "num_keypoints": len(points),
                "keypoints": points,
                "confidences": confidences,
            }
        except Exception as exc:  # pragma: no cover - model/runtime dependent
            logger.warning("YOLO11 pose inference failed: %s", exc)
            return None


_pose_service: Optional[YoloPoseService] = None


def get_yolo_pose_service() -> YoloPoseService:
    global _pose_service
    if _pose_service is None:
        _pose_service = YoloPoseService()
    return _pose_service
