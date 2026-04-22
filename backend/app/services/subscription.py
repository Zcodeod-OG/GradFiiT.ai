"""Subscription tiers and quota enforcement for try-on requests."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models.tryon import TryOn, TryOnStatus
from app.models.user import User


# Statuses that should *not* consume the user's quota. Provider / pipeline
# failures and dead-letters are the system's fault, not the user's intent,
# so they shouldn't burn their daily / monthly allowance.
_NON_BILLABLE_STATUSES = (
    TryOnStatus.FAILED,
    TryOnStatus.DEAD_LETTER,
    TryOnStatus.QUALITY_FAILED,
)


@dataclass(frozen=True)
class PlanRule:
    code: str
    display_name: str
    allowed_modes: tuple[str, ...]
    period: str
    limit: Optional[int]
    monthly_price_usd: Optional[float]
    # `purchasable=False` means the plan is visible on /pricing but the
    # Checkout button is disabled (used for "coming soon" or enterprise
    # tiers). `coming_soon=True` shows an explicit badge.
    purchasable: bool = True
    coming_soon: bool = False
    # Short sentence explaining the coming-soon state / sales CTA.
    cta_note: Optional[str] = None


PLAN_RULES: dict[str, PlanRule] = {
    "free_2d": PlanRule(
        code="free_2d",
        display_name="Free 2D",
        allowed_modes=("2d",),
        period="day",
        limit=4,
        monthly_price_usd=0.0,
        purchasable=True,  # default tier on signup; no Checkout needed
    ),
    "free_3d": PlanRule(
        code="free_3d",
        display_name="Free 3D",
        allowed_modes=("3d",),
        period="day",
        limit=2,
        monthly_price_usd=0.0,
        purchasable=False,
        coming_soon=True,
        cta_note="3D try-on is launching soon. Join the waitlist from your dashboard.",
    ),
    "premium_2d": PlanRule(
        code="premium_2d",
        display_name="Premium 2D",
        allowed_modes=("2d",),
        period="month",
        limit=195,
        monthly_price_usd=3.99,
        purchasable=True,
    ),
    "premium_3d": PlanRule(
        code="premium_3d",
        display_name="Premium 3D",
        allowed_modes=("3d",),
        period="month",
        limit=180,
        monthly_price_usd=5.99,
        purchasable=False,
        coming_soon=True,
        cta_note="3D try-on is launching soon. Join the waitlist from your dashboard.",
    ),
    "ultra": PlanRule(
        code="ultra",
        display_name="Ultra",
        allowed_modes=("2d", "3d"),
        period="month",
        limit=365,
        monthly_price_usd=15.99,
        purchasable=False,
        coming_soon=True,
        cta_note="Ultra unlocks when 3D ships. We'll email everyone on the waitlist.",
    ),
    "business": PlanRule(
        code="business",
        display_name="Business",
        allowed_modes=("2d", "3d"),
        period="none",
        limit=None,
        monthly_price_usd=None,
        purchasable=False,
        coming_soon=False,
        cta_note="Talk to our team for SLA, team seats, and custom integrations.",
    ),
}


# Map our internal plan codes to the Stripe Price IDs configured in env.
# Stripe Price IDs live in `settings` so we can have separate test vs.
# production values without touching code.
def get_stripe_price_id(plan_code: str) -> Optional[str]:
    mapping = {
        "premium_2d": getattr(settings, "STRIPE_PRICE_PREMIUM_2D", None),
        "premium_3d": getattr(settings, "STRIPE_PRICE_PREMIUM_3D", None),
        "ultra": getattr(settings, "STRIPE_PRICE_ULTRA", None),
    }
    price_id = mapping.get(plan_code)
    return price_id.strip() if price_id and price_id.strip() else None


def tier_from_stripe_price_id(price_id: str) -> Optional[str]:
    """Reverse lookup used by the Stripe webhook to translate an incoming
    subscription event back to a tier code."""
    if not price_id:
        return None
    for plan_code in ("premium_2d", "premium_3d", "ultra"):
        mapped = get_stripe_price_id(plan_code)
        if mapped and mapped == price_id:
            return plan_code
    return None


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

    query = (
        db.query(func.count(TryOn.id))
        .filter(TryOn.user_id == user.id)
        .filter(TryOn.status.notin_(_NON_BILLABLE_STATUSES))
    )
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
    catalog: list[dict] = []
    for plan in PLAN_RULES.values():
        catalog.append(
            {
                "code": plan.code,
                "display_name": plan.display_name,
                "allowed_modes": list(plan.allowed_modes),
                "period": plan.period,
                "limit": plan.limit,
                "monthly_price_usd": plan.monthly_price_usd,
                "purchasable": plan.purchasable,
                "coming_soon": plan.coming_soon,
                "cta_note": plan.cta_note,
                # Surface the Stripe Price ID (or None) so the UI can show
                # a disabled Checkout button when Stripe is unconfigured,
                # without exposing secrets.
                "stripe_price_configured": bool(get_stripe_price_id(plan.code)),
            }
        )
    return catalog
