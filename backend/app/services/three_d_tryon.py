"""High-level 3D try-on orchestration service."""

from __future__ import annotations

from typing import Any, Optional

from app.services.tripo import get_tripo_service
from app.services.yolo_pose import get_yolo_pose_service


class ThreeDTryOnService:
    def __init__(self) -> None:
        self._tripo = get_tripo_service()
        self._pose = get_yolo_pose_service()

    @staticmethod
    def _normalize_quality(quality: str) -> str:
        normalized = (quality or "best").strip().lower()
        if normalized not in {"fast", "balanced", "best"}:
            return "best"
        return normalized

    def create_avatar_profile(
        self,
        person_image_url: str,
        quality: str = "best",
        body_profile: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        avatar = self._tripo.build_avatar(
            person_image_url=person_image_url,
            quality=self._normalize_quality(quality),
            metadata={"body_profile": body_profile or {}},
        )
        return {
            "provider": avatar.get("provider"),
            "model_id": avatar.get("model_id"),
            "model_url": avatar.get("model_url"),
            "preview_url": avatar.get("preview_url"),
            "turntable_url": avatar.get("turntable_url"),
        }

    def run(
        self,
        person_image_url: str,
        garment_image_url: str,
        garment_description: str,
        quality: str = "best",
        existing_avatar_model_id: Optional[str] = None,
        existing_avatar_model_url: Optional[str] = None,
        existing_avatar_preview_url: Optional[str] = None,
        existing_avatar_turntable_url: Optional[str] = None,
        body_profile: Optional[dict[str, Any]] = None,
        force_rebuild_avatar: bool = False,
    ) -> dict[str, Any]:
        _ = garment_description  # Reserved for future prompt-based fit guidance.

        normalized_quality = self._normalize_quality(quality)
        can_reuse_avatar = bool(existing_avatar_model_id or existing_avatar_model_url)
        avatar_reused = bool(can_reuse_avatar and not force_rebuild_avatar)

        if avatar_reused:
            avatar = {
                "provider": "cached",
                "model_id": existing_avatar_model_id,
                "model_url": existing_avatar_model_url,
                "preview_url": existing_avatar_preview_url,
                "turntable_url": existing_avatar_turntable_url,
            }
        else:
            avatar = self.create_avatar_profile(
                person_image_url=person_image_url,
                quality=normalized_quality,
                body_profile=body_profile,
            )

        pose_metadata = self._pose.estimate_pose(person_image_url)
        fit = self._tripo.fit_garment(
            avatar_model_id=avatar.get("model_id"),
            avatar_model_url=avatar.get("model_url"),
            garment_image_url=garment_image_url,
            quality=normalized_quality,
            pose_metadata=pose_metadata,
        )

        result_image_url = (
            fit.get("preview_url")
            or avatar.get("preview_url")
            or garment_image_url
        )

        return {
            "provider": fit.get("provider") or avatar.get("provider"),
            "pose_engine": pose_metadata.get("engine") if pose_metadata else None,
            "avatar_reused": avatar_reused,
            "avatar": avatar,
            "garment_fit": fit,
            "result_image_url": result_image_url,
            "result_model_url": fit.get("model_url") or avatar.get("model_url"),
            "result_turntable_url": fit.get("turntable_url") or avatar.get("turntable_url"),
        }


_three_d_service: Optional[ThreeDTryOnService] = None


def get_three_d_tryon_service() -> ThreeDTryOnService:
    global _three_d_service
    if _three_d_service is None:
        _three_d_service = ThreeDTryOnService()
    return _three_d_service
