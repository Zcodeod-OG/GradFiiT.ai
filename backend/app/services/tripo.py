"""Tripo AI API integration for avatar generation and garment fitting."""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

import requests

from app.config import settings

logger = logging.getLogger(__name__)


class TripoService:
    def __init__(self) -> None:
        self.base_url = settings.TRIPO_API_BASE_URL.rstrip("/")
        self.api_key = settings.TRIPO_API_KEY

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _url(self, endpoint: str) -> str:
        if endpoint.startswith("http://") or endpoint.startswith("https://"):
            return endpoint
        return f"{self.base_url}{endpoint}"

    @staticmethod
    def _unwrap(data: Any, *keys: str) -> Any:
        value = data
        for key in keys:
            if isinstance(value, dict):
                value = value.get(key)
            else:
                return None
        return value

    def _request_json(self, method: str, endpoint: str, payload: Optional[dict] = None) -> dict:
        response = requests.request(
            method=method,
            url=self._url(endpoint),
            json=payload,
            headers=self._headers(),
            timeout=settings.TRIPO_HTTP_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        body = response.json()
        if not isinstance(body, dict):
            raise RuntimeError("Tripo response was not an object")
        return body

    def _wait_for_task(self, task_id: str) -> dict:
        deadline = time.time() + settings.TRIPO_MAX_WAIT_SECONDS
        endpoint_template = settings.TRIPO_TASK_STATUS_ENDPOINT

        while time.time() < deadline:
            payload = self._request_json(
                method="GET",
                endpoint=endpoint_template.format(task_id=task_id),
            )
            status = str(
                payload.get("status")
                or self._unwrap(payload, "data", "status")
                or self._unwrap(payload, "task", "status")
                or ""
            ).lower()

            if status in {"succeeded", "completed", "success", "done"}:
                return payload
            if status in {"failed", "error", "cancelled"}:
                raise RuntimeError(f"Tripo task failed with status={status}")

            time.sleep(settings.TRIPO_POLL_INTERVAL_SECONDS)

        raise TimeoutError("Timed out waiting for Tripo task completion")

    def _extract_asset(self, payload: dict) -> dict[str, Any]:
        task_id = (
            payload.get("task_id")
            or self._unwrap(payload, "data", "task_id")
            or self._unwrap(payload, "task", "id")
        )

        if task_id:
            payload = self._wait_for_task(str(task_id))

        data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
        model_url = (
            data.get("model_url")
            or data.get("glb_url")
            or self._unwrap(data, "model", "url")
            or self._unwrap(data, "asset", "model_url")
        )
        preview_url = (
            data.get("preview_url")
            or data.get("render_url")
            or self._unwrap(data, "asset", "preview_url")
        )
        turntable_url = (
            data.get("turntable_url")
            or self._unwrap(data, "asset", "turntable_url")
            or data.get("spin_url")
        )
        model_id = (
            data.get("model_id")
            or self._unwrap(data, "asset", "id")
            or self._unwrap(data, "model", "id")
        )

        return {
            "model_id": model_id,
            "model_url": model_url,
            "preview_url": preview_url,
            "turntable_url": turntable_url,
        }

    def build_avatar(self, person_image_url: str, quality: str, metadata: Optional[dict] = None) -> dict:
        if not self.enabled:
            logger.warning("TRIPO_API_KEY missing; using non-3D fallback")
            return {
                "provider": "fallback",
                "model_id": None,
                "model_url": None,
                "preview_url": person_image_url,
                "turntable_url": None,
            }

        payload = {
            "image_url": person_image_url,
            "quality": quality,
            "metadata": metadata or {},
        }
        response = self._request_json("POST", settings.TRIPO_CREATE_AVATAR_ENDPOINT, payload)
        asset = self._extract_asset(response)
        asset["provider"] = "tripo"
        return asset

    def fit_garment(
        self,
        avatar_model_id: Optional[str],
        avatar_model_url: Optional[str],
        garment_image_url: str,
        quality: str,
        pose_metadata: Optional[dict] = None,
    ) -> dict:
        if not self.enabled:
            return {
                "provider": "fallback",
                "model_url": avatar_model_url,
                "preview_url": garment_image_url,
                "turntable_url": None,
            }

        payload = {
            "model_id": avatar_model_id,
            "model_url": avatar_model_url,
            "garment_image_url": garment_image_url,
            "quality": quality,
            "pose": pose_metadata or {},
        }
        response = self._request_json("POST", settings.TRIPO_FIT_GARMENT_ENDPOINT, payload)
        asset = self._extract_asset(response)
        asset["provider"] = "tripo"
        return asset


_tripo_service: Optional[TripoService] = None


def get_tripo_service() -> TripoService:
    global _tripo_service
    if _tripo_service is None:
        _tripo_service = TripoService()
    return _tripo_service
