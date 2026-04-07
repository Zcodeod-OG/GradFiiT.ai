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

    def _load_model(self) -> bool:
        if self._model_loaded:
            return self._model is not None

        self._model_loaded = True
        if not settings.YOLO11_POSE_ENABLED:
            return False

        try:
            from ultralytics import YOLO  # type: ignore

            self._model = YOLO(settings.YOLO11_POSE_MODEL)
            return True
        except Exception as exc:  # pragma: no cover - optional dependency path
            logger.warning("YOLO11 pose unavailable: %s", exc)
            self._model = None
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
