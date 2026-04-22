"""Billing + Stripe Checkout routes.

Every endpoint returns a graceful 503 when Stripe isn't configured
yet -- the app keeps running, just without paid upgrades. The webhook
endpoint is the **source of truth** for flipping user tiers; the
front-end never writes tier state directly.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user
from app.database import get_db
from app.models.user import User
from app.services import billing as billing_service
from app.services.subscription import (
    PLAN_RULES,
    list_plan_catalog,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])


# ──────────────────────────────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────────────────────────────


class CheckoutSessionRequest(BaseModel):
    plan_code: str = Field(
        ...,
        description="Internal plan code, e.g. 'premium_2d'",
        max_length=60,
    )


class CheckoutSessionResponse(BaseModel):
    success: bool = True
    url: str
    plan_code: str


class PortalResponse(BaseModel):
    success: bool = True
    url: str


class PlanListResponse(BaseModel):
    success: bool = True
    plans: list
    current_tier: str
    subscription_status: str
    subscription_renews_at: Optional[str] = None
    cancel_at_period_end: bool = False


# ──────────────────────────────────────────────────────────────────────
# Read
# ──────────────────────────────────────────────────────────────────────


@router.get("/plans", response_model=PlanListResponse)
def list_plans(
    current_user: User = Depends(get_current_active_user),
):
    """Return the pricing catalog + the caller's current subscription state."""
    return PlanListResponse(
        plans=list_plan_catalog(),
        current_tier=current_user.subscription_tier,
        subscription_status=current_user.subscription_status or "inactive",
        subscription_renews_at=(
            current_user.subscription_renews_at.isoformat()
            if current_user.subscription_renews_at
            else None
        ),
        cancel_at_period_end=bool(
            current_user.subscription_cancel_at_period_end
        ),
    )


# ──────────────────────────────────────────────────────────────────────
# Checkout + Portal
# ──────────────────────────────────────────────────────────────────────


@router.post("/checkout-session", response_model=CheckoutSessionResponse)
def create_checkout_session(
    payload: CheckoutSessionRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Start a Stripe Checkout session for the requested plan."""
    plan_code = (payload.plan_code or "").strip().lower()
    if plan_code not in PLAN_RULES:
        raise HTTPException(status_code=422, detail="Unknown plan code")

    url = billing_service.create_checkout_session(
        user=current_user, plan_code=plan_code, db=db
    )
    return CheckoutSessionResponse(url=url, plan_code=plan_code)


@router.post("/portal", response_model=PortalResponse)
def create_portal_session(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Open the Stripe Customer Portal for the caller to manage billing."""
    url = billing_service.create_portal_session(user=current_user, db=db)
    return PortalResponse(url=url)


# ──────────────────────────────────────────────────────────────────────
# Webhook
# ──────────────────────────────────────────────────────────────────────


@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None, alias="stripe-signature"),
    db: Session = Depends(get_db),
):
    """Stripe → backend webhook. Source of truth for tier changes."""
    if not stripe_signature:
        raise HTTPException(status_code=400, detail="Missing Stripe signature")
    payload = await request.body()
    result = billing_service.handle_webhook_event(
        payload=payload, signature=stripe_signature, db=db
    )
    return {"received": True, **result}
