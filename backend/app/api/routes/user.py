from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user
from app.database import get_db
from app.models.user import User
from app.schemas.user import AvatarBuildRequest
from app.services.face_processor import get_face_processor
from app.services.storage import get_storage
from app.services.subscription import PLAN_RULES, get_plan_rule, get_usage_snapshot, list_plan_catalog
from app.services.three_d_tryon import get_three_d_tryon_service
from app.services.tryon_input_gate import get_tryon_input_gate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/user", tags=["user"])


def _sign_for_browser(url: str | None) -> str | None:
    """Presign internal S3 URLs so the browser can render them directly."""
    if not url:
        return url
    try:
        return get_storage().to_provider_access_url(url, expiration=3600) or url
    except Exception:
        return url


def _person_photo_payload(user: User) -> dict:
    return {
        # All three of these live in our private bucket. We presign them on
        # the way out so the dashboard / try page / reveal slider can render
        # them straight into <img src> without 403'ing.
        "url": _sign_for_browser(user.default_person_image_url),
        "smart_crop_url": _sign_for_browser(user.default_person_smart_crop_url),
        "face_url": _sign_for_browser(user.default_person_face_url),
        "uploaded_at": (
            user.default_person_uploaded_at.isoformat()
            if user.default_person_uploaded_at
            else None
        ),
        "gate": user.default_person_input_gate_metrics or None,
        "has_embedding": bool(user.default_person_face_embedding),
    }


class UserPreferencesUpdate(BaseModel):
    preferred_tryon_mode: str | None = None
    subscription_tier: str | None = None


def _avatar_payload(user: User) -> dict:
    return {
        "status": user.avatar_status,
        "source_image_url": user.avatar_source_image_url,
        "model_id": user.avatar_model_id,
        "model_url": user.avatar_model_url,
        "preview_url": user.avatar_preview_url,
        "turntable_url": user.avatar_turntable_url,
        "metadata": user.avatar_metadata,
        "error_message": user.avatar_error_message,
        "updated_at": user.avatar_updated_at.isoformat() if user.avatar_updated_at else None,
    }


@router.get("/tier")
def get_user_tier(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    plan = get_plan_rule(current_user)
    snapshot = get_usage_snapshot(
        db=db,
        user=current_user,
        requested_mode=current_user.preferred_tryon_mode,
    )

    payload = {
        "tier": plan.code,
        "tier_label": plan.display_name,
        "preferred_mode": current_user.preferred_tryon_mode,
        "allowed_modes": list(plan.allowed_modes),
        "quota": snapshot,
        "avatar": _avatar_payload(current_user),
        "plans": list_plan_catalog(),
    }
    return {"success": True, **payload, "data": payload}


@router.patch("/preferences")
def update_user_preferences(
    updates: UserPreferencesUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if updates.subscription_tier is not None:
        tier = updates.subscription_tier.strip().lower()
        if tier not in PLAN_RULES:
            raise HTTPException(status_code=422, detail="Unsupported subscription tier")
        current_user.subscription_tier = tier

    if updates.preferred_tryon_mode is not None:
        mode = updates.preferred_tryon_mode.strip().lower()
        if mode not in {"2d", "3d"}:
            raise HTTPException(status_code=422, detail="preferred_tryon_mode must be '2d' or '3d'")
        current_user.preferred_tryon_mode = mode

    # Keep preference valid for selected plan.
    plan = get_plan_rule(current_user)
    if current_user.preferred_tryon_mode not in plan.allowed_modes:
        current_user.preferred_tryon_mode = plan.allowed_modes[0]

    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    snapshot = get_usage_snapshot(
        db=db,
        user=current_user,
        requested_mode=current_user.preferred_tryon_mode,
    )

    return {
        "success": True,
        "data": {
            "tier": current_user.subscription_tier,
            "preferred_mode": current_user.preferred_tryon_mode,
            "allowed_modes": list(get_plan_rule(current_user).allowed_modes),
            "quota": snapshot,
            "avatar": _avatar_payload(current_user),
        },
    }


@router.get("/avatar/status")
def get_avatar_status(current_user: User = Depends(get_current_active_user)):
    return {
        "success": True,
        "data": _avatar_payload(current_user),
    }


@router.post("/avatar/build")
def build_avatar_profile(
    payload: AvatarBuildRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    plan = get_plan_rule(current_user)
    if "3d" not in plan.allowed_modes:
        raise HTTPException(
            status_code=403,
            detail=f"Your {plan.display_name} plan does not include 3D avatar generation",
        )

    person_image_url = (payload.person_image_url or "").strip()
    if not (person_image_url.startswith("http://") or person_image_url.startswith("https://")):
        raise HTTPException(status_code=422, detail="person_image_url must be a valid http(s) URL")

    quality = (payload.quality or "best").strip().lower()
    if quality not in {"fast", "balanced", "best"}:
        quality = "best"

    body_profile = {
        "height_cm": payload.height_cm,
        "body_type": payload.body_type,
        "gender": payload.gender,
        "fit_preference": payload.fit_preference,
        "notes": payload.notes,
    }
    # Remove empty values to keep metadata clean.
    body_profile = {k: v for k, v in body_profile.items() if v not in (None, "")}

    current_user.avatar_status = "building"
    current_user.avatar_error_message = None
    db.add(current_user)
    db.commit()

    try:
        storage = get_storage()
        provider_person_image_url = storage.to_provider_access_url(person_image_url)
        service = get_three_d_tryon_service()
        avatar = service.create_avatar_profile(
            person_image_url=provider_person_image_url or person_image_url,
            quality=quality,
            body_profile=body_profile,
        )

        current_user.avatar_source_image_url = person_image_url
        current_user.avatar_model_id = avatar.get("model_id")
        current_user.avatar_model_url = avatar.get("model_url")
        current_user.avatar_preview_url = avatar.get("preview_url")
        current_user.avatar_turntable_url = avatar.get("turntable_url")
        current_user.avatar_metadata = {
            "provider": avatar.get("provider"),
            "quality": quality,
            "body_profile": body_profile,
        }
        current_user.avatar_status = "ready" if (current_user.avatar_model_id or current_user.avatar_model_url) else "failed"
        current_user.avatar_error_message = None if current_user.avatar_status == "ready" else "Avatar generation did not return a model"
        current_user.avatar_updated_at = datetime.now(timezone.utc)
        db.add(current_user)
        db.commit()
        db.refresh(current_user)
    except Exception as exc:
        current_user.avatar_status = "failed"
        current_user.avatar_error_message = str(exc)[:500]
        current_user.avatar_updated_at = datetime.now(timezone.utc)
        db.add(current_user)
        db.commit()
        raise HTTPException(status_code=502, detail="Avatar generation failed") from exc

    return {
        "success": True,
        "data": _avatar_payload(current_user),
    }


# ── Persistent default "person photo" ─────────────────────────────────
# Lets the user upload their try-on photo *once* and reuse it across
# every surface (web /try, dashboard Quick Try, Chrome extension).
# We synchronously run the Layer-1 input gate and pre-compute the CLIP
# face embedding so subsequent try-ons can skip those roundtrips.


_ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp"}


@router.get("/person-photo")
def get_person_photo(current_user: User = Depends(get_current_active_user)):
    return {
        "success": True,
        "data": _person_photo_payload(current_user),
    }


@router.post("/person-photo")
async def upload_person_photo(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if not file.content_type or file.content_type.lower() not in _ALLOWED_PHOTO_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Photo must be a JPEG, PNG, or WebP image",
        )

    storage = get_storage()
    try:
        s3_key, url = storage.upload_file(
            file.file, file.filename or "photo.jpg", current_user.id
        )
    except Exception as exc:
        logger.exception("Failed to upload person photo for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not upload photo: {exc}",
        ) from exc

    previous_key = current_user.default_person_image_s3_key
    if previous_key and previous_key != s3_key:
        try:
            storage.delete_file(previous_key)
        except Exception as exc:  # pragma: no cover - best-effort cleanup
            logger.warning("Could not delete previous person photo %s: %s", previous_key, exc)

    # Run the Layer-1 input gate synchronously so the wizard can show
    # actionable feedback ("face not visible", "image too blurry"). The
    # gate is best-effort: if numpy/Pillow/YOLO is unavailable we still
    # keep the photo and the runner falls back to a normal flow.
    gate_result = get_tryon_input_gate().validate(url)
    smart_crop_url = (
        gate_result.person_image_url
        if gate_result.smart_cropped and gate_result.person_image_url
        else None
    )

    face_processor = get_face_processor()
    face_url = None
    face_embedding = None
    try:
        face_url = face_processor.crop_face_url(smart_crop_url or url)
        if face_url:
            face_embedding = face_processor.embed_face(smart_crop_url or url)
    except Exception as exc:  # pragma: no cover - best-effort caching
        logger.warning("FaceProcessor caching failed for user %s: %s", current_user.id, exc)

    current_user.default_person_image_url = url
    current_user.default_person_image_s3_key = s3_key
    current_user.default_person_smart_crop_url = smart_crop_url
    current_user.default_person_face_url = face_url
    current_user.default_person_face_embedding = face_embedding
    current_user.default_person_input_gate_metrics = {
        "passed": gate_result.passed,
        "reasons": list(gate_result.reasons),
        "smart_cropped": gate_result.smart_cropped,
        "metrics": dict(gate_result.metrics),
    }
    current_user.default_person_uploaded_at = datetime.now(timezone.utc)

    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    return {
        "success": True,
        "data": _person_photo_payload(current_user),
    }


@router.delete("/person-photo")
def delete_person_photo(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    s3_key = current_user.default_person_image_s3_key
    if s3_key:
        try:
            get_storage().delete_file(s3_key)
        except Exception as exc:  # pragma: no cover - best-effort cleanup
            logger.warning("Could not delete person photo %s: %s", s3_key, exc)

    current_user.default_person_image_url = None
    current_user.default_person_image_s3_key = None
    current_user.default_person_smart_crop_url = None
    current_user.default_person_face_url = None
    current_user.default_person_face_embedding = None
    current_user.default_person_input_gate_metrics = None
    current_user.default_person_uploaded_at = None

    db.add(current_user)
    db.commit()

    return {"success": True, "data": _person_photo_payload(current_user)}
