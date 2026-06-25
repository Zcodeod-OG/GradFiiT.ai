"""OAuth2 authorization-code redirects for Google, GitHub, and Facebook."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from jose import JWTError
from sqlalchemy.orm import Session

from app.api.routes.auth import create_access_token
from app.config import settings
from app.database import get_db
from app.services import oauth_login as oauth

logger = logging.getLogger(__name__)

router = APIRouter()


def _frontend_oauth_redirect(
    *, platform: str | None = None, **params: str
) -> RedirectResponse:
    qs = urlencode({k: v for k, v in params.items() if v})
    if platform == "app":
        scheme = settings.MOBILE_APP_URL_SCHEME.rstrip("/")
        url = f"{scheme}://auth/callback?{qs}"
    else:
        base = settings.FRONTEND_URL.rstrip("/")
        url = f"{base}/auth/callback?{qs}"
    return RedirectResponse(url=url, status_code=status.HTTP_302_FOUND)


def _platform_from_state(state: Optional[str]) -> Optional[str]:
    if not state:
        return None
    try:
        payload = oauth.decode_oauth_state_jwt(state)
    except JWTError:
        return None
    return payload.get("plat")


@router.get("/oauth/{provider}/authorize")
def oauth_authorize(
    provider: str,
    platform: Optional[str] = Query(None),
) -> RedirectResponse:
    prov = provider.strip().lower()
    if prov not in oauth.ALLOWED_PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown OAuth provider")
    if not oauth.provider_credentials_configured(prov):
        raise HTTPException(
            status_code=503,
            detail=f"OAuth is not configured for {prov}. Set client ID and secret.",
        )
    plat = "app" if platform == "app" else None
    try:
        url = oauth.build_authorize_redirect_url(prov, platform=plat)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        logger.exception("OAuth authorize failed: %s", e)
        raise HTTPException(
            status_code=500, detail="Could not start OAuth sign-in"
        ) from e
    return RedirectResponse(url=url, status_code=status.HTTP_302_FOUND)


@router.get("/oauth/{provider}/callback")
def oauth_callback(
    provider: str,
    db: Session = Depends(get_db),
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
) -> RedirectResponse:
    prov = provider.strip().lower()
    if prov not in oauth.ALLOWED_PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown OAuth provider")

    platform = _platform_from_state(state)

    if error:
        msg = (error_description or error or "access_denied")[:900]
        return _frontend_oauth_redirect(error="oauth_denied", message=msg, platform=platform)

    if not code or not state:
        return _frontend_oauth_redirect(
            error="oauth_invalid_request",
            message="Missing authorization code or state from the identity provider.",
            platform=platform,
        )

    try:
        user = oauth.complete_oauth_login(
            db, provider=prov, code=code, state_raw=state
        )
        platform = _platform_from_state(state) or platform
    except JWTError:
        logger.warning("OAuth callback: invalid or expired state")
        return _frontend_oauth_redirect(
            error="oauth_state_invalid",
            message="Sign-in session expired. Please try again.",
            platform=platform,
        )
    except ValueError as e:
        logger.info("OAuth callback rejected: %s", e)
        return _frontend_oauth_redirect(
            error="oauth_failed",
            message=str(e)[:900],
            platform=platform,
        )
    except Exception as e:
        logger.exception("OAuth callback failed: %s", e)
        return _frontend_oauth_redirect(
            error="oauth_failed",
            message="Could not complete sign-in. Please try again.",
            platform=platform,
        )

    if not user.is_active:
        return _frontend_oauth_redirect(
            error="oauth_inactive",
            message="This account is inactive.",
            platform=platform,
        )

    expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=expires,
    )
    return _frontend_oauth_redirect(token=access_token, platform=platform)
