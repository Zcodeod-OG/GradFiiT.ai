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


def _frontend_oauth_redirect(**params: str) -> RedirectResponse:
    base = settings.FRONTEND_URL.rstrip("/")
    qs = urlencode({k: v for k, v in params.items() if v})
    return RedirectResponse(
        url=f"{base}/auth/callback?{qs}",
        status_code=status.HTTP_302_FOUND,
    )


@router.get("/oauth/{provider}/authorize")
def oauth_authorize(provider: str) -> RedirectResponse:
    prov = provider.strip().lower()
    if prov not in oauth.ALLOWED_PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown OAuth provider")
    if not oauth.provider_credentials_configured(prov):
        raise HTTPException(
            status_code=503,
            detail=f"OAuth is not configured for {prov}. Set client ID and secret.",
        )
    try:
        url = oauth.build_authorize_redirect_url(prov)
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

    if error:
        msg = (error_description or error or "access_denied")[:900]
        return _frontend_oauth_redirect(error="oauth_denied", message=msg)

    if not code or not state:
        return _frontend_oauth_redirect(
            error="oauth_invalid_request",
            message="Missing authorization code or state from the identity provider.",
        )

    try:
        user = oauth.complete_oauth_login(
            db, provider=prov, code=code, state_raw=state
        )
    except JWTError:
        logger.warning("OAuth callback: invalid or expired state")
        return _frontend_oauth_redirect(
            error="oauth_state_invalid",
            message="Sign-in session expired. Please try again.",
        )
    except ValueError as e:
        logger.info("OAuth callback rejected: %s", e)
        return _frontend_oauth_redirect(
            error="oauth_failed",
            message=str(e)[:900],
        )
    except Exception as e:
        logger.exception("OAuth callback failed: %s", e)
        return _frontend_oauth_redirect(
            error="oauth_failed",
            message="Could not complete sign-in. Please try again.",
        )

    if not user.is_active:
        return _frontend_oauth_redirect(
            error="oauth_inactive",
            message="This account is inactive.",
        )

    expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=expires,
    )
    return _frontend_oauth_redirect(token=access_token)
