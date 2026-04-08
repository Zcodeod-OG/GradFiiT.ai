from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user
from app.database import get_db
from app.models.user import User
from app.schemas.user import AvatarBuildRequest
from app.services.three_d_tryon import get_three_d_tryon_service
from app.services.subscription import PLAN_RULES, get_plan_rule, get_usage_snapshot, list_plan_catalog

router = APIRouter(prefix="/api/user", tags=["user"])


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
        service = get_three_d_tryon_service()
        avatar = service.create_avatar_profile(
            person_image_url=person_image_url,
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
