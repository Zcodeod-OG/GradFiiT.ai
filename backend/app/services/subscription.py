"""Subscription tiers and quota enforcement for try-on requests."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.tryon import TryOn
from app.models.user import User


@dataclass(frozen=True)
class PlanRule:
    code: str
    display_name: str
    allowed_modes: tuple[str, ...]
    period: str
    limit: Optional[int]
    monthly_price_usd: Optional[float]


PLAN_RULES: dict[str, PlanRule] = {
    "free_2d": PlanRule(
        code="free_2d",
        display_name="Free 2D",
        allowed_modes=("2d",),
        period="day",
        limit=4,
        monthly_price_usd=0.0,
    ),
    "free_3d": PlanRule(
        code="free_3d",
        display_name="Free 3D",
        allowed_modes=("3d",),
        period="day",
        limit=2,
        monthly_price_usd=0.0,
    ),
    "premium_2d": PlanRule(
        code="premium_2d",
        display_name="Premium 2D",
        allowed_modes=("2d",),
        period="month",
        limit=195,
        monthly_price_usd=3.99,
    ),
    "premium_3d": PlanRule(
        code="premium_3d",
        display_name="Premium 3D",
        allowed_modes=("3d",),
        period="month",
        limit=180,
        monthly_price_usd=5.99,
    ),
    "ultra": PlanRule(
        code="ultra",
        display_name="Ultra",
        allowed_modes=("2d", "3d"),
        period="month",
        limit=365,
        monthly_price_usd=15.99,
    ),
    "business": PlanRule(
        code="business",
        display_name="Business",
        allowed_modes=("2d", "3d"),
        period="none",
        limit=None,
        monthly_price_usd=None,
    ),
}


def _normalize_mode(value: str | None) -> str:
    mode = (value or "2d").strip().lower()
    if mode not in {"2d", "3d"}:
        raise HTTPException(status_code=422, detail="mode must be either '2d' or '3d'")
    return mode


def get_plan_rule(user: User) -> PlanRule:
    code = (user.subscription_tier or "free_2d").strip().lower()
    return PLAN_RULES.get(code, PLAN_RULES["free_2d"])


def _period_start(period: str, now_utc: datetime) -> Optional[datetime]:
    if period == "day":
        return now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "month":
        return now_utc.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return None


def get_usage_snapshot(db: Session, user: User, requested_mode: str) -> dict:
    mode = _normalize_mode(requested_mode)
    plan = get_plan_rule(user)
    now_utc = datetime.now(timezone.utc)
    period_start = _period_start(plan.period, now_utc)

    if plan.limit is None:
        return {
            "tier": plan.code,
            "tier_label": plan.display_name,
            "allowed_modes": list(plan.allowed_modes),
            "period": plan.period,
            "period_start": None,
            "limit": None,
            "used": 0,
            "remaining": None,
            "mode": mode,
        }

    query = db.query(func.count(TryOn.id)).filter(TryOn.user_id == user.id)
    if period_start is not None:
        query = query.filter(TryOn.created_at >= period_start)

    # Ultra is a shared bucket across 2D and 3D.
    if plan.code != "ultra":
        query = query.filter(TryOn.tryon_mode == mode)

    used = int(query.scalar() or 0)
    remaining = max(0, plan.limit - used)

    return {
        "tier": plan.code,
        "tier_label": plan.display_name,
        "allowed_modes": list(plan.allowed_modes),
        "period": plan.period,
        "period_start": period_start.isoformat() if period_start else None,
        "limit": plan.limit,
        "used": used,
        "remaining": remaining,
        "mode": mode,
    }


def enforce_tryon_quota(db: Session, user: User, requested_mode: str) -> dict:
    mode = _normalize_mode(requested_mode)
    plan = get_plan_rule(user)

    if mode not in plan.allowed_modes:
        raise HTTPException(
            status_code=403,
            detail=(
                f"Your {plan.display_name} plan supports {', '.join(plan.allowed_modes).upper()} try-ons only. "
                "Switch mode or upgrade your plan."
            ),
        )

    snapshot = get_usage_snapshot(db=db, user=user, requested_mode=mode)
    if snapshot["limit"] is not None and snapshot["remaining"] <= 0:
        raise HTTPException(
            status_code=429,
            detail=(
                f"{plan.display_name} quota reached ({snapshot['used']}/{snapshot['limit']} this {snapshot['period']})."
            ),
        )

    return snapshot


def list_plan_catalog() -> list[dict]:
    return [
        {
            "code": plan.code,
            "display_name": plan.display_name,
            "allowed_modes": list(plan.allowed_modes),
            "period": plan.period,
            "limit": plan.limit,
            "monthly_price_usd": plan.monthly_price_usd,
        }
        for plan in PLAN_RULES.values()
    ]
