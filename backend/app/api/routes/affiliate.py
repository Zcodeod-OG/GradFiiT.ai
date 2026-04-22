"""Affiliate click routes.

* `GET  /api/affiliate/resolve/{garment_id}` -- returns the rewritten
  URL for a garment the caller owns (used to render the "Buy this"
  button with price/merchant label).
* `POST /api/affiliate/click`               -- logs the click for
  attribution, returns the same rewritten URL so the frontend can
  open it in a new tab.
* `GET  /api/affiliate/networks`            -- diagnostic endpoint
  used by the dashboard admin view to show which networks are live.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user
from app.database import get_db
from app.models.affiliate_click import AffiliateClick
from app.models.garment import Garment
from app.models.tryon import TryOn
from app.models.user import User
from app.services.affiliate import (
    AffiliateLink,
    detect_merchant,
    rewrite_to_affiliate,
    supported_networks_summary,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/affiliate", tags=["affiliate"])


# ──────────────────────────────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────────────────────────────


class AffiliateLinkPayload(BaseModel):
    original_url: str
    affiliate_url: str
    merchant: str
    network: str
    commission_rate_pct: Optional[float] = None
    disclosure_text: str
    has_commission: bool


class ResolveResponse(BaseModel):
    success: bool = True
    garment_id: int
    link: AffiliateLinkPayload


class ClickRequest(BaseModel):
    garment_id: Optional[int] = Field(
        None, description="Owned garment id; preferred when available"
    )
    tryon_id: Optional[int] = Field(None, description="Try-on that surfaced this product")
    url: Optional[str] = Field(
        None,
        description="Raw retailer URL, only used when garment_id is omitted",
        max_length=2048,
    )


class ClickResponse(BaseModel):
    success: bool = True
    link: AffiliateLinkPayload
    click_id: int


class NetworksResponse(BaseModel):
    success: bool = True
    networks: dict


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────


def _to_payload(link: AffiliateLink) -> AffiliateLinkPayload:
    return AffiliateLinkPayload(
        original_url=link.original_url,
        affiliate_url=link.affiliate_url,
        merchant=link.merchant,
        network=link.network,
        commission_rate_pct=link.commission_rate_pct,
        disclosure_text=link.disclosure_text,
        has_commission=link.network != "direct",
    )


def _user_owns_garment(db: Session, user: User, garment_id: int) -> Garment:
    garment = (
        db.query(Garment)
        .filter(Garment.id == garment_id, Garment.user_id == user.id)
        .first()
    )
    if not garment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Garment not found"
        )
    return garment


# ──────────────────────────────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────────────────────────────


@router.get("/networks", response_model=NetworksResponse)
def list_networks(
    _current_user: User = Depends(get_current_active_user),
):
    """Returns which affiliate networks are configured on this backend."""
    return NetworksResponse(networks=supported_networks_summary())


@router.get("/resolve/{garment_id}", response_model=ResolveResponse)
def resolve_affiliate_link(
    garment_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Return the affiliate URL for a garment the caller owns.

    If the garment has no `source_url` stored yet (e.g. uploaded via
    the dashboard instead of the Chrome extension) we still return a
    placeholder response with `network="direct"` and an empty URL so
    the UI can render a disabled button.
    """
    garment = _user_owns_garment(db, current_user, garment_id)
    link = rewrite_to_affiliate(garment.source_url)
    return ResolveResponse(garment_id=garment.id, link=_to_payload(link))


@router.post("/click", response_model=ClickResponse)
def log_affiliate_click(
    payload: ClickRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Record an outbound click and return the affiliate URL to open.

    The frontend performs the actual navigation (opens a new tab with
    the `affiliate_url` we return); this endpoint exists purely for
    attribution + analytics. Clicks for garments without a known
    `source_url` are rejected with 422 so we don't log noise.
    """
    original_url: Optional[str] = None
    garment: Optional[Garment] = None
    tryon: Optional[TryOn] = None

    if payload.garment_id is not None:
        garment = _user_owns_garment(db, current_user, payload.garment_id)
        original_url = garment.source_url
    elif payload.url:
        original_url = payload.url.strip()
        if not original_url.startswith(("http://", "https://")):
            raise HTTPException(
                status_code=422, detail="url must be an absolute http(s) URL"
            )
    else:
        raise HTTPException(
            status_code=422, detail="Provide either garment_id or url"
        )

    if not original_url:
        raise HTTPException(
            status_code=422,
            detail=(
                "This garment has no retailer URL recorded, so we cannot "
                "generate a Buy-this link."
            ),
        )

    if payload.tryon_id is not None:
        tryon = (
            db.query(TryOn)
            .filter(TryOn.id == payload.tryon_id, TryOn.user_id == current_user.id)
            .first()
        )
        # Non-fatal: if the try-on doesn't belong to us we just drop the
        # reference rather than failing the click.
        if tryon is None:
            logger.info(
                "affiliate.click: tryon_id=%s not owned by user %s, dropping",
                payload.tryon_id,
                current_user.id,
            )

    link = rewrite_to_affiliate(original_url)

    click = AffiliateClick(
        user_id=current_user.id,
        garment_id=garment.id if garment else None,
        tryon_id=tryon.id if tryon else None,
        network=link.network,
        merchant=link.merchant or detect_merchant(original_url) or None,
        original_url=link.original_url,
        affiliate_url=link.affiliate_url,
    )
    db.add(click)
    db.commit()
    db.refresh(click)

    return ClickResponse(link=_to_payload(link), click_id=click.id)
