"""Stripe billing integration.

Wraps Stripe Checkout, the Customer Portal, and webhook handling. Every
function degrades gracefully when `STRIPE_SECRET_KEY` is missing -- it
raises `HTTPException(503)` with a clear message instead of crashing, so
the rest of the app keeps working during early development.

The **Stripe webhook is the single source of truth** for tier changes.
The Checkout button only *starts* a session; it never optimistically
flips the tier. This is the only design that stays consistent with
refunds, dunning, manual cancellations in the Stripe dashboard, etc.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User
from app.services.subscription import (
    PLAN_RULES,
    get_stripe_price_id,
    tier_from_stripe_price_id,
)

logger = logging.getLogger(__name__)


# Stripe is imported lazily so the backend starts cleanly even without
# the SDK installed or without a secret key (useful in CI and local dev
# before the founder has a Stripe account).
def _stripe():
    try:
        import stripe  # type: ignore
    except ImportError as exc:  # pragma: no cover - clear error for ops
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Stripe SDK is not installed on the backend. "
                "Add `stripe>=8.0` to requirements.txt and reinstall."
            ),
        ) from exc

    key = (settings.STRIPE_SECRET_KEY or "").strip()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payments are not configured yet. Please check back soon.",
        )
    stripe.api_key = key
    return stripe


# ──────────────────────────────────────────────────────────────────────
# Customer bootstrap
# ──────────────────────────────────────────────────────────────────────


def get_or_create_customer(user: User, db: Session) -> str:
    """Ensure the user has a Stripe Customer and return its id."""
    if user.stripe_customer_id:
        return user.stripe_customer_id

    stripe = _stripe()
    customer = stripe.Customer.create(
        email=user.email,
        name=user.full_name or None,
        metadata={"gradfit_user_id": str(user.id)},
    )
    user.stripe_customer_id = customer["id"]
    db.add(user)
    db.commit()
    db.refresh(user)
    return user.stripe_customer_id


# ──────────────────────────────────────────────────────────────────────
# Checkout + Portal
# ──────────────────────────────────────────────────────────────────────


def create_checkout_session(
    *, user: User, plan_code: str, db: Session
) -> str:
    """Create a Stripe Checkout Session and return the hosted URL."""
    plan = PLAN_RULES.get(plan_code)
    if not plan:
        raise HTTPException(status_code=422, detail="Unknown plan code")
    if not plan.purchasable:
        raise HTTPException(
            status_code=409,
            detail=(
                plan.cta_note
                or f"{plan.display_name} is not available for purchase yet."
            ),
        )
    if plan.monthly_price_usd in (None, 0.0):
        raise HTTPException(
            status_code=409,
            detail=f"{plan.display_name} is free -- no checkout needed.",
        )

    price_id = get_stripe_price_id(plan_code)
    if not price_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                f"{plan.display_name} is missing a Stripe price. "
                "Set the matching STRIPE_PRICE_* env var and retry."
            ),
        )

    stripe = _stripe()
    customer_id = get_or_create_customer(user, db)

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            customer=customer_id,
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=settings.STRIPE_SUCCESS_URL,
            cancel_url=settings.STRIPE_CANCEL_URL,
            # Allows us to tie the webhook event back to our user even if
            # Stripe's Customer record is ever detached.
            client_reference_id=str(user.id),
            metadata={
                "gradfit_user_id": str(user.id),
                "gradfit_plan_code": plan_code,
            },
            subscription_data={
                "metadata": {
                    "gradfit_user_id": str(user.id),
                    "gradfit_plan_code": plan_code,
                },
            },
            # Lets the user edit payment methods from the portal later.
            allow_promotion_codes=True,
            # Required by Stripe when the customer is in India (RBI
            # e-mandate for recurring charges).
            payment_method_collection="always",
        )
    except Exception as exc:  # pragma: no cover - Stripe errors bubble up
        logger.exception("Stripe checkout session creation failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Stripe checkout failed: {exc}",
        ) from exc

    url = session.get("url")
    if not url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Stripe did not return a checkout URL",
        )
    return url


def create_portal_session(*, user: User, db: Session) -> str:
    """Create a Stripe Customer Portal session and return the URL."""
    if not user.stripe_customer_id:
        raise HTTPException(
            status_code=404,
            detail=(
                "No billing account found. Subscribe to a paid plan first "
                "before managing billing."
            ),
        )
    stripe = _stripe()
    try:
        session = stripe.billing_portal.Session.create(
            customer=user.stripe_customer_id,
            return_url=settings.STRIPE_BILLING_PORTAL_RETURN_URL,
        )
    except Exception as exc:  # pragma: no cover - Stripe errors
        logger.exception("Stripe billing portal session failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Stripe portal failed: {exc}",
        ) from exc

    url = session.get("url")
    if not url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Stripe did not return a portal URL",
        )
    return url


# ──────────────────────────────────────────────────────────────────────
# Webhook reconciliation
# ──────────────────────────────────────────────────────────────────────


def _extract_price_id(subscription: dict) -> Optional[str]:
    items = ((subscription or {}).get("items") or {}).get("data") or []
    if not items:
        return None
    price = (items[0] or {}).get("price") or {}
    return price.get("id")


def _sync_subscription_to_user(
    *, subscription: dict, user: User, db: Session
) -> None:
    """Mirror the Stripe subscription state onto the User row."""
    sub_id = subscription.get("id")
    sub_status = subscription.get("status") or "inactive"
    cancel_at_period_end = bool(subscription.get("cancel_at_period_end"))
    current_period_end = subscription.get("current_period_end")

    price_id = _extract_price_id(subscription)
    new_tier = tier_from_stripe_price_id(price_id) if price_id else None

    user.stripe_subscription_id = sub_id
    user.subscription_status = sub_status
    user.subscription_cancel_at_period_end = cancel_at_period_end
    if current_period_end:
        user.subscription_renews_at = datetime.fromtimestamp(
            int(current_period_end), tz=timezone.utc
        )
    else:
        user.subscription_renews_at = None

    # Active / trialing -> apply the paid tier. Anything else -> drop to
    # the free tier so the quota gate starts enforcing immediately.
    if sub_status in {"active", "trialing"} and new_tier:
        user.subscription_tier = new_tier
    elif sub_status in {"canceled", "incomplete_expired", "unpaid"}:
        user.subscription_tier = "free_2d"

    db.add(user)
    db.commit()


def handle_webhook_event(
    *, payload: bytes, signature: str, db: Session
) -> dict:
    """Verify the Stripe signature and process supported event types."""
    stripe = _stripe()
    webhook_secret = (settings.STRIPE_WEBHOOK_SECRET or "").strip()
    if not webhook_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook secret not configured",
        )

    try:
        event = stripe.Webhook.construct_event(
            payload, signature, webhook_secret
        )
    except Exception as exc:  # Invalid signature, malformed payload, etc.
        logger.warning("Stripe webhook signature verification failed: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid signature") from exc

    event_type = event.get("type")
    data_object: dict[str, Any] = (event.get("data") or {}).get("object") or {}
    logger.info("Stripe webhook received: %s", event_type)

    if event_type == "checkout.session.completed":
        # First-time subscription. Pull the subscription object so we can
        # write the tier + renewal date atomically.
        user_id_raw = (data_object.get("metadata") or {}).get("gradfit_user_id")
        if not user_id_raw:
            user_id_raw = data_object.get("client_reference_id")
        user = None
        if user_id_raw:
            try:
                user = db.query(User).filter(User.id == int(user_id_raw)).first()
            except (TypeError, ValueError):
                user = None
        if not user:
            customer_id = data_object.get("customer")
            if customer_id:
                user = (
                    db.query(User)
                    .filter(User.stripe_customer_id == customer_id)
                    .first()
                )
        if not user:
            logger.warning(
                "checkout.session.completed: could not map to a gradfit user"
            )
            return {"handled": False, "reason": "user_not_found"}

        customer_id = data_object.get("customer")
        if customer_id and not user.stripe_customer_id:
            user.stripe_customer_id = customer_id

        subscription_id = data_object.get("subscription")
        if subscription_id:
            subscription = stripe.Subscription.retrieve(subscription_id)
            _sync_subscription_to_user(
                subscription=subscription, user=user, db=db
            )
        else:
            db.add(user)
            db.commit()
        return {"handled": True}

    if event_type in (
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    ):
        customer_id = data_object.get("customer")
        user = (
            db.query(User)
            .filter(User.stripe_customer_id == customer_id)
            .first()
        )
        if not user:
            logger.warning(
                "%s: no user found for customer %s", event_type, customer_id
            )
            return {"handled": False, "reason": "user_not_found"}
        _sync_subscription_to_user(
            subscription=data_object, user=user, db=db
        )
        return {"handled": True}

    if event_type == "invoice.payment_failed":
        customer_id = data_object.get("customer")
        user = (
            db.query(User)
            .filter(User.stripe_customer_id == customer_id)
            .first()
        )
        if user:
            # Stripe will retry; we just surface the state so the UI can
            # show a gentle "Update your card" banner.
            user.subscription_status = "past_due"
            db.add(user)
            db.commit()
        return {"handled": True}

    # Unhandled events are not errors -- Stripe retries until we 2xx.
    return {"handled": False, "reason": "event_ignored", "type": event_type}
