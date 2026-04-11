"""High-level 3D try-on orchestration service."""

from __future__ import annotations

from typing import Any, Optional

from app.config import settings
from app.services.smpl_pifuhd import get_smpl_pifuhd_service
from app.services.tripo import get_tripo_service
from app.services.yolo_pose import get_yolo_pose_service


class ThreeDTryOnService:
    def __init__(self) -> None:
        self._smpl_pifuhd = get_smpl_pifuhd_service()
        self._tripo = get_tripo_service()
        self._pose = get_yolo_pose_service()

    @staticmethod
    def _normalize_quality(quality: str) -> str:
        normalized = (quality or "best").strip().lower()
        if normalized not in {"fast", "balanced", "best"}:
            return "best"
        return normalized

    def _build_avatar_primary(self, person_image_url: str, quality: str, metadata: dict[str, Any]) -> dict[str, Any]:
        if settings.THREE_D_ENGINE == "tripo":
            return self._tripo.build_avatar(
                person_image_url=person_image_url,
                quality=quality,
                metadata=metadata,
            )
        return self._smpl_pifuhd.build_avatar(
            person_image_url=person_image_url,
            quality=quality,
            metadata=metadata,
        )

    def _fit_primary(
        self,
        avatar_model_id: Optional[str],
        avatar_model_url: Optional[str],
        garment_image_url: str,
        quality: str,
        pose_metadata: Optional[dict[str, Any]],
    ) -> dict[str, Any]:
        if settings.THREE_D_ENGINE == "tripo":
            return self._tripo.fit_garment(
                avatar_model_id=avatar_model_id,
                avatar_model_url=avatar_model_url,
                garment_image_url=garment_image_url,
                quality=quality,
                pose_metadata=pose_metadata,
            )
        return self._smpl_pifuhd.fit_garment(
            avatar_model_id=avatar_model_id,
            avatar_model_url=avatar_model_url,
            garment_image_url=garment_image_url,
            quality=quality,
            pose_metadata=pose_metadata,
        )

    def create_avatar_profile(
        self,
        person_image_url: str,
        quality: str = "best",
        body_profile: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        normalized_quality = self._normalize_quality(quality)
        metadata = {"body_profile": body_profile or {}}

        avatar = self._build_avatar_primary(
            person_image_url=person_image_url,
            quality=normalized_quality,
            metadata=metadata,
        )

        provider = str(avatar.get("provider") or "").lower()
        should_fallback_tripo = (
            settings.THREE_D_ALLOW_TRIPO_FALLBACK
            and settings.THREE_D_ENGINE == "smpl_pifuhd"
            and (provider.endswith("fallback") or not (avatar.get("model_id") or avatar.get("model_url")))
        )

        if should_fallback_tripo:
            avatar = self._tripo.build_avatar(
                person_image_url=person_image_url,
                quality=normalized_quality,
                metadata=metadata,
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
        fit = self._fit_primary(
            avatar_model_id=avatar.get("model_id"),
            avatar_model_url=avatar.get("model_url"),
            garment_image_url=garment_image_url,
            quality=normalized_quality,
            pose_metadata=pose_metadata,
        )

        fit_provider = str(fit.get("provider") or "").lower()
        should_fallback_tripo_fit = (
            settings.THREE_D_ALLOW_TRIPO_FALLBACK
            and settings.THREE_D_ENGINE == "smpl_pifuhd"
            and (fit_provider.endswith("fallback") or not (fit.get("model_url") or fit.get("preview_url")))
        )
        if should_fallback_tripo_fit:
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
