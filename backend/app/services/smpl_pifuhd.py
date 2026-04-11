"""SMPL + PIFuHD integration service for 3D avatar and garment fitting."""

from __future__ import annotations

import logging
from typing import Any, Optional

import requests

from app.config import settings

logger = logging.getLogger(__name__)


class SmplPifuHdService:
    def __init__(self) -> None:
        self.base_url = (settings.SMPL_PIFUHD_API_BASE_URL or "").rstrip("/")
        self.api_key = settings.SMPL_PIFUHD_API_KEY

    @property
    def enabled(self) -> bool:
        return bool(self.base_url)

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _url(self, endpoint: str) -> str:
        if endpoint.startswith("http://") or endpoint.startswith("https://"):
            return endpoint
        if not self.base_url:
            return endpoint
        return f"{self.base_url}{endpoint}"

    def _request_json(self, method: str, endpoint: str, payload: Optional[dict] = None) -> dict:
        response = requests.request(
            method=method,
            url=self._url(endpoint),
            json=payload,
            headers=self._headers(),
            timeout=settings.SMPL_PIFUHD_HTTP_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        body = response.json()
        if not isinstance(body, dict):
            raise RuntimeError("SMPL+PIFuHD response was not an object")
        return body

    @staticmethod
    def _extract_data(payload: dict) -> dict:
        data = payload.get("data")
        if isinstance(data, dict):
            return data
        return payload

    def build_avatar(self, person_image_url: str, quality: str, metadata: Optional[dict] = None) -> dict[str, Any]:
        if not self.enabled:
            logger.warning("SMPL_PIFUHD_API_BASE_URL missing; using non-3D fallback avatar")
            return {
                "provider": "smpl_pifuhd_fallback",
                "model_id": None,
                "model_url": None,
                "preview_url": person_image_url,
                "turntable_url": None,
            }

        payload = {
            "person_image_url": person_image_url,
            "quality": quality,
            "metadata": metadata or {},
        }
        response = self._request_json("POST", settings.SMPL_PIFUHD_CREATE_AVATAR_ENDPOINT, payload)
        data = self._extract_data(response)

        return {
            "provider": "smpl_pifuhd",
            "model_id": data.get("model_id") or data.get("avatar_id"),
            "model_url": data.get("model_url") or data.get("mesh_url"),
            "preview_url": data.get("preview_url") or data.get("render_url") or person_image_url,
            "turntable_url": data.get("turntable_url") or data.get("spin_url"),
        }

    def fit_garment(
        self,
        avatar_model_id: Optional[str],
        avatar_model_url: Optional[str],
        garment_image_url: str,
        quality: str,
        pose_metadata: Optional[dict] = None,
    ) -> dict[str, Any]:
        if not self.enabled:
            return {
                "provider": "smpl_pifuhd_fallback",
                "model_url": avatar_model_url,
                "preview_url": garment_image_url,
                "turntable_url": None,
            }

        payload = {
            "avatar_model_id": avatar_model_id,
            "avatar_model_url": avatar_model_url,
            "garment_image_url": garment_image_url,
            "quality": quality,
            "pose": pose_metadata or {},
        }
        response = self._request_json("POST", settings.SMPL_PIFUHD_FIT_GARMENT_ENDPOINT, payload)
        data = self._extract_data(response)

        return {
            "provider": "smpl_pifuhd",
            "model_url": data.get("model_url") or data.get("mesh_url") or avatar_model_url,
            "preview_url": data.get("preview_url") or data.get("render_url") or garment_image_url,
            "turntable_url": data.get("turntable_url") or data.get("spin_url"),
        }


_smpl_pifuhd_service: Optional[SmplPifuHdService] = None


def get_smpl_pifuhd_service() -> SmplPifuHdService:
    global _smpl_pifuhd_service
    if _smpl_pifuhd_service is None:
        _smpl_pifuhd_service = SmplPifuHdService()
    return _smpl_pifuhd_service
