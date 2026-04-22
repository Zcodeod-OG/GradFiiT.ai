"""
AULTER.AI - Webhook Handlers
Handle webhooks from external services (Clerk, Replicate, Stripe, Fashn, etc.)
"""

import logging
import hmac
import hashlib
import json
from typing import Dict, Any
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.models import User, TryOn, TryOnStatus
from app.services.storage import get_storage, S3Storage
from app.config import get_settings

# Configure logging
logger = logging.getLogger(__name__)

# Get settings
settings = get_settings()

# Create router
router = APIRouter(prefix="/api/webhooks", tags=["Webhooks"])


# ==================== Helper Functions ====================

def verify_clerk_webhook(payload: bytes, headers: Dict[str, str]) -> bool:
    """
    Verify Clerk webhook signature.
    
    Args:
        payload: Raw request body
        headers: Request headers
        
    Returns:
        True if signature is valid
    """
    # Get signature from headers
    svix_id = headers.get("svix-id")
    svix_timestamp = headers.get("svix-timestamp")
    svix_signature = headers.get("svix-signature")
    
    if not all([svix_id, svix_timestamp, svix_signature]):
        logger.warning("⚠️  Missing Clerk webhook headers")
        return False
    
    # Construct signed content
    signed_content = f"{svix_id}.{svix_timestamp}.{payload.decode()}"
    
    # Get webhook secret
    secret = settings.CLERK_WEBHOOK_SECRET if hasattr(settings, 'CLERK_WEBHOOK_SECRET') else None
    
    if not secret:
        logger.warning("⚠️  CLERK_WEBHOOK_SECRET not configured")
        return True  # Allow in development
    
    # Compute expected signature
    secret_bytes = secret.encode()
    expected_signature = hmac.new(
        secret_bytes,
        signed_content.encode(),
        hashlib.sha256
    ).hexdigest()
    
    # Compare signatures
    passed_signatures = svix_signature.split(" ")
    
    for sig in passed_signatures:
        if sig.startswith("v1,"):
            sig = sig[3:]
            if hmac.compare_digest(sig, expected_signature):
                return True
    
    logger.warning("⚠️  Invalid Clerk webhook signature")
    return False


# ==================== Clerk Webhooks ====================

@router.post("/clerk")
async def clerk_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """
    Handle Clerk webhooks for user events.
    
    Events:
    - user.created: Create user in database
    - user.updated: Update user information
    - user.deleted: Soft delete user
    """
    try:
        # Get raw body and headers
        body = await request.body()
        headers = dict(request.headers)
        
        # Verify webhook signature
        if not verify_clerk_webhook(body, headers):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid webhook signature"
            )
        
        # Parse JSON
        payload = json.loads(body)
        
        event_type = payload.get("type")
        data = payload.get("data", {})
        
        logger.info(f"📨 Received Clerk webhook: {event_type}")
        
        # Handle different event types
        if event_type == "user.created":
            await handle_user_created(data, db)
        
        elif event_type == "user.updated":
            await handle_user_updated(data, db)
        
        elif event_type == "user.deleted":
            await handle_user_deleted(data, db)
        
        else:
            logger.info(f"ℹ️  Unhandled event type: {event_type}")
        
        return {"success": True}
        
    except HTTPException:
        raise
        
    except Exception as e:
        logger.error(f"❌ Webhook processing failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook processing failed"
        )


async def handle_user_created(data: Dict[str, Any], db: AsyncSession) -> None:
    """Handle user.created event."""
    try:
        clerk_user_id = data.get("id")
        
        # Check if user already exists
        result = await db.execute(
            select(User).where(User.clerk_user_id == clerk_user_id)
        )
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            logger.info(f"ℹ️  User already exists: {clerk_user_id}")
            return
        
        # Extract email
        email_addresses = data.get("email_addresses", [])
        primary_email = next(
            (e["email_address"] for e in email_addresses if e.get("id") == data.get("primary_email_address_id")),
            email_addresses[0]["email_address"] if email_addresses else None
        )
        
        if not primary_email:
            logger.warning(f"⚠️  No email for user: {clerk_user_id}")
            return
        
        # Create user
        user = User(
            clerk_user_id=clerk_user_id,
            email=primary_email,
            username=data.get("username"),
            first_name=data.get("first_name"),
            last_name=data.get("last_name"),
            profile_image_url=data.get("profile_image_url"),
            subscription_tier="free_2d",
        )
        
        db.add(user)
        await db.commit()
        
        logger.info(f"✅ User created via webhook: {user.email}")
        
    except Exception as e:
        logger.error(f"❌ Failed to create user: {str(e)}")
        await db.rollback()


async def handle_user_updated(data: Dict[str, Any], db: AsyncSession) -> None:
    """Handle user.updated event."""
    try:
        clerk_user_id = data.get("id")
        
        # Find user
        result = await db.execute(
            select(User).where(User.clerk_user_id == clerk_user_id)
        )
        user = result.scalar_one_or_none()
        
        if not user:
            logger.warning(f"⚠️  User not found for update: {clerk_user_id}")
            return
        
        # Update fields
        user.username = data.get("username")
        user.first_name = data.get("first_name")
        user.last_name = data.get("last_name")
        user.profile_image_url = data.get("profile_image_url")
        
        await db.commit()
        
        logger.info(f"✅ User updated via webhook: {user.email}")
        
    except Exception as e:
        logger.error(f"❌ Failed to update user: {str(e)}")
        await db.rollback()


async def handle_user_deleted(data: Dict[str, Any], db: AsyncSession) -> None:
    """Handle user.deleted event."""
    try:
        clerk_user_id = data.get("id")
        
        # Find user
        result = await db.execute(
            select(User).where(User.clerk_user_id == clerk_user_id)
        )
        user = result.scalar_one_or_none()
        
        if not user:
            logger.warning(f"⚠️  User not found for deletion: {clerk_user_id}")
            return
        
        # Soft delete
        user.soft_delete()
        
        await db.commit()
        
        logger.info(f"✅ User deleted via webhook: {user.email}")
        
    except Exception as e:
        logger.error(f"❌ Failed to delete user: {str(e)}")
        await db.rollback()


# ==================== Replicate Webhooks ====================

@router.post("/replicate/{tryon_id}")
async def replicate_webhook(
    tryon_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    storage: S3Storage = Depends(get_storage)
) -> Dict[str, Any]:
    """
    Handle webhook from Replicate when try-on completes.
    
    Args:
        tryon_id: TryOn ID
        request: FastAPI request with webhook payload
    """
    try:
        # Get webhook payload
        payload = await request.json()
        
        logger.info(f"📨 Replicate webhook for try-on: {tryon_id}")
        logger.info(f"   Status: {payload.get('status')}")
        
        # Find TryOn record
        result = await db.execute(
            select(TryOn).where(TryOn.id == tryon_id)
        )
        tryon = result.scalar_one_or_none()
        
        if not tryon:
            logger.warning(f"⚠️  TryOn not found: {tryon_id}")
            return {"success": False, "error": "TryOn not found"}
        
        # Get status and output
        status_value = payload.get("status")
        output = payload.get("output")
        error = payload.get("error")
        
        # Update TryOn based on status
        if status_value == "succeeded":
            logger.info(f"✅ Try-on succeeded: {tryon_id}")
            
            # Download result from Replicate
            if output:
                try:
                    import httpx
                    from io import BytesIO
                    
                    # Download image
                    async with httpx.AsyncClient() as client:
                        response = await client.get(output)
                        response.raise_for_status()
                        image_data = response.content
                    
                    # Upload to S3
                    s3_key = f"tryons/{tryon.user_id}/{tryon_id}/result.jpg"
                    result_url = storage.upload_file(
                        file_data=image_data,
                        key=s3_key,
                        content_type="image/jpeg"
                    )
                    
                    # Update TryOn
                    tryon.result_image_url = result_url
                    tryon.stage1_result_url = result_url
                    tryon.status = TryOnStatus.COMPLETED
                    tryon.lifecycle_status = "ready"
                    tryon.execution_finished_at = datetime.utcnow()

                    logger.info(f"✅ Result uploaded to S3: {result_url}")

                except Exception as e:
                    logger.error(f"❌ Failed to upload result: {str(e)}")
                    tryon.status = TryOnStatus.FAILED
                    tryon.lifecycle_status = "failed"
                    tryon.error_message = f"Failed to upload result: {str(e)}"
            else:
                tryon.status = TryOnStatus.FAILED
                tryon.lifecycle_status = "failed"
                tryon.error_message = "No output from Replicate"

        elif status_value == "failed":
            logger.error(f"❌ Try-on failed: {tryon_id}")
            tryon.status = TryOnStatus.FAILED
            tryon.lifecycle_status = "failed"
            tryon.error_message = error or "Unknown error"

        elif status_value == "canceled":
            logger.warning(f"⚠️  Try-on canceled: {tryon_id}")
            tryon.status = TryOnStatus.FAILED
            tryon.lifecycle_status = "failed"
            tryon.error_message = "Canceled by user or system"

        else:
            logger.info(f"ℹ️  Try-on status: {status_value}")
            # Keep as processing for intermediate states

        # Save metadata on the correct column (`metadata` is reserved by SQLAlchemy).
        existing_meta = dict(tryon.pipeline_metadata or {})
        existing_meta["replicate_webhook"] = payload
        tryon.pipeline_metadata = existing_meta

        await db.commit()
        
        return {"success": True}
        
    except Exception as e:
        logger.error(f"❌ Replicate webhook processing failed: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        
        return {"success": False, "error": str(e)}


# ==================== Stripe Webhooks (Optional) ====================

@router.post("/stripe")
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """
    Handle Stripe webhooks for payment events.
    
    Events:
    - checkout.session.completed: Upgrade user tier
    - customer.subscription.updated: Update subscription
    - customer.subscription.deleted: Downgrade user tier
    """
    try:
        # Get raw body and signature
        body = await request.body()
        sig_header = request.headers.get("stripe-signature")
        
        if not settings.STRIPE_WEBHOOK_SECRET:
            logger.warning("⚠️  STRIPE_WEBHOOK_SECRET not configured")
            return {"success": True}
        
        # Verify webhook signature (requires stripe library)
        # import stripe
        # event = stripe.Webhook.construct_event(
        #     body, sig_header, settings.STRIPE_WEBHOOK_SECRET
        # )
        
        # For now, just parse JSON
        payload = json.loads(body)
        event_type = payload.get("type")
        
        logger.info(f"📨 Received Stripe webhook: {event_type}")
        
        # Handle events
        if event_type == "checkout.session.completed":
            # Handle successful checkout
            pass
        
        elif event_type == "customer.subscription.updated":
            # Handle subscription update
            pass
        
        elif event_type == "customer.subscription.deleted":
            # Handle subscription cancellation
            pass
        
        return {"success": True}
        
    except Exception as e:
        logger.error(f"❌ Stripe webhook processing failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook processing failed"
        )


# ==================== Fashn.ai Webhooks ====================


@router.post("/fashn/{tryon_id}")
async def fashn_webhook(tryon_id: int, request: Request) -> Dict[str, Any]:
    """Handle Fashn.ai prediction completion callbacks.

    Fashn POSTs the same payload here that the ``/v1/status/{id}`` endpoint
    would have returned during polling. We update the TryOn row directly so
    the runner doesn't need to keep polling.

    The handler is intentionally idempotent: once the row is in a terminal
    state (``COMPLETED`` / ``FAILED``) we ignore subsequent callbacks but
    still return 200 so Fashn stops retrying.
    """
    try:
        payload = await request.json()
    except Exception as exc:
        logger.warning("Fashn webhook: invalid JSON for tryon %s: %s", tryon_id, exc)
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    logger.info(
        "Fashn webhook for tryon %s: status=%s prediction=%s",
        tryon_id,
        payload.get("status"),
        payload.get("id"),
    )

    db: Session = SessionLocal()
    try:
        tryon = db.query(TryOn).filter(TryOn.id == tryon_id).first()
        if not tryon:
            logger.warning("Fashn webhook: TryOn %s not found", tryon_id)
            return {"success": False, "error": "TryOn not found"}

        if tryon.status in {TryOnStatus.COMPLETED, TryOnStatus.FAILED, TryOnStatus.DEAD_LETTER}:
            logger.info(
                "Fashn webhook: TryOn %s already terminal (%s); ignoring",
                tryon_id,
                tryon.status.value,
            )
            return {"success": True, "ignored": True}

        state = (payload.get("status") or "").lower()
        outputs = payload.get("output") or []
        if isinstance(outputs, str):
            outputs = [outputs]
        outputs = [o for o in outputs if isinstance(o, str) and o.strip()]

        if state == "completed" and outputs:
            result_url = outputs[0]
            tryon.result_image_url = result_url
            tryon.stage1_result_url = result_url
            tryon.status = TryOnStatus.COMPLETED
            tryon.lifecycle_status = "ready"
            tryon.execution_finished_at = datetime.now(timezone.utc)
            logger.info("Fashn webhook: TryOn %s -> COMPLETED (%s)", tryon_id, result_url)
        elif state in {"failed", "canceled", "error"}:
            error = payload.get("error") or {}
            message = (
                error.get("message")
                if isinstance(error, dict)
                else str(error)
            )
            tryon.status = TryOnStatus.FAILED
            tryon.lifecycle_status = "failed"
            tryon.error_message = (message or f"Fashn returned {state}")[:500]
            tryon.execution_finished_at = datetime.now(timezone.utc)
            logger.warning("Fashn webhook: TryOn %s -> FAILED (%s)", tryon_id, message)
        else:
            # Intermediate progress ping: leave row alone (the runner is
            # the source of truth for fine-grained status). Still record
            # the latest webhook payload below for debugging.
            logger.debug(
                "Fashn webhook: tryon %s intermediate state '%s'; not mutating row",
                tryon_id,
                state,
            )

        existing_meta = dict(tryon.pipeline_metadata or {})
        existing_meta["fashn_webhook"] = payload
        tryon.pipeline_metadata = existing_meta

        db.commit()
        return {"success": True}
    except Exception as exc:
        logger.error("Fashn webhook processing failed for %s: %s", tryon_id, exc)
        db.rollback()
        # Return 200 anyway so Fashn doesn't keep retrying on a payload we
        # already saved (the runner's poll loop is still our backstop).
        return {"success": False, "error": str(exc)}
    finally:
        db.close()


# ==================== Export ====================

__all__ = ["router"]