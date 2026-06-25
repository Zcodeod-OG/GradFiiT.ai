"""OAuth2 (Google, GitHub, Facebook) — authorize URL builders and user resolution."""

from __future__ import annotations

import base64
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlencode

import httpx
from jose import JWTError, jwt
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.models.oauth_identity import OAuthIdentity
from app.models.user import User

logger = logging.getLogger(__name__)

ALLOWED_PROVIDERS = frozenset({"google", "github", "facebook"})


def _state_signing_key() -> str:
    return (settings.OAUTH_STATE_SECRET or settings.SECRET_KEY).strip()


def _pkce_pair() -> Tuple[str, str]:
    """Return (code_verifier, code_challenge S256) for Google/GitHub."""
    verifier = secrets.token_urlsafe(48)[:96]
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return verifier, challenge


def create_oauth_state_jwt(
    provider: str, code_verifier: str, platform: str | None = None
) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=max(1, int(settings.OAUTH_STATE_EXPIRE_MINUTES)))
    payload = {
        "typ": "oauth_state",
        "p": provider,
        "nonce": secrets.token_urlsafe(12),
        "cv": code_verifier or "",
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    if platform == "app":
        payload["plat"] = "app"
    return jwt.encode(payload, _state_signing_key(), algorithm=settings.ALGORITHM)


def decode_oauth_state_jwt(token: str) -> Dict[str, Any]:
    payload = jwt.decode(
        token,
        _state_signing_key(),
        algorithms=[settings.ALGORITHM],
        options={"require_exp": True},
    )
    if payload.get("typ") != "oauth_state":
        raise ValueError("invalid state token")
    prov = (payload.get("p") or "").strip().lower()
    if prov not in ALLOWED_PROVIDERS:
        raise ValueError("invalid provider in state")
    return payload


def oauth_callback_url(provider: str) -> str:
    base = settings.BACKEND_URL.rstrip("/")
    return f"{base}/api/auth/oauth/{provider}/callback"


def provider_credentials_configured(provider: str) -> bool:
    if provider == "google":
        return bool(
            (settings.GOOGLE_CLIENT_ID or "").strip()
            and (settings.GOOGLE_CLIENT_SECRET or "").strip()
        )
    if provider == "github":
        return bool(
            (settings.GITHUB_CLIENT_ID or "").strip()
            and (settings.GITHUB_CLIENT_SECRET or "").strip()
        )
    if provider == "facebook":
        return bool(
            (settings.FACEBOOK_CLIENT_ID or "").strip()
            and (settings.FACEBOOK_CLIENT_SECRET or "").strip()
        )
    return False


def build_authorize_redirect_url(provider: str, platform: str | None = None) -> str:
    """Return full IdP authorize URL (caller returns RedirectResponse)."""
    if provider not in ALLOWED_PROVIDERS:
        raise ValueError("unsupported provider")
    if not provider_credentials_configured(provider):
        raise RuntimeError(f"OAuth not configured for provider={provider}")

    redirect_uri = oauth_callback_url(provider)
    plat = "app" if platform == "app" else None

    if provider == "google":
        verifier, challenge = _pkce_pair()
        state = create_oauth_state_jwt(provider, verifier, platform=plat)
        q = {
            "client_id": settings.GOOGLE_CLIENT_ID.strip(),
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "access_type": "online",
            "prompt": "select_account",
        }
        return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(q)

    if provider == "github":
        verifier, challenge = _pkce_pair()
        state = create_oauth_state_jwt(provider, verifier, platform=plat)
        q = {
            "client_id": settings.GITHUB_CLIENT_ID.strip(),
            "redirect_uri": redirect_uri,
            "scope": "read:user user:email",
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
        return "https://github.com/login/oauth/authorize?" + urlencode(q)

    # Facebook — no PKCE in the classic server-side secret flow
    state = create_oauth_state_jwt(provider, "", platform=plat)
    q = {
        "client_id": settings.FACEBOOK_CLIENT_ID.strip(),
        "redirect_uri": redirect_uri,
        "state": state,
        "scope": "email,public_profile",
    }
    return "https://www.facebook.com/v19.0/dialog/oauth?" + urlencode(q)


def _http() -> httpx.Client:
    return httpx.Client(timeout=30.0)


def exchange_google_code(
    code: str, redirect_uri: str, code_verifier: str
) -> Dict[str, Any]:
    with _http() as client:
        r = client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID.strip(),
                "client_secret": settings.GOOGLE_CLIENT_SECRET.strip(),
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
                "code_verifier": code_verifier,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        r.raise_for_status()
        tok = r.json()
    access = tok.get("access_token")
    if not access:
        raise RuntimeError("Google token response missing access_token")
    with _http() as client:
        u = client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access}"},
        )
        u.raise_for_status()
        return u.json()


def exchange_github_code(
    code: str, redirect_uri: str, code_verifier: str
) -> Dict[str, Any]:
    with _http() as client:
        r = client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": settings.GITHUB_CLIENT_ID.strip(),
                "client_secret": settings.GITHUB_CLIENT_SECRET.strip(),
                "code": code,
                "redirect_uri": redirect_uri,
                "code_verifier": code_verifier,
            },
            headers={"Accept": "application/json"},
        )
        r.raise_for_status()
        tok = r.json()
    access = tok.get("access_token")
    if not access:
        raise RuntimeError("GitHub token response missing access_token")

    with _http() as client:
        u = client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {access}",
                "Accept": "application/vnd.github+json",
            },
        )
        u.raise_for_status()
        profile = u.json()

        em = client.get(
            "https://api.github.com/user/emails",
            headers={
                "Authorization": f"Bearer {access}",
                "Accept": "application/vnd.github+json",
            },
        )
        em.raise_for_status()
        emails = em.json()

    primary_verified = None
    for row in emails:
        if row.get("primary") and row.get("verified"):
            primary_verified = row.get("email")
            break
    if not primary_verified:
        for row in emails:
            if row.get("verified"):
                primary_verified = row.get("email")
                break

    if not primary_verified:
        raise RuntimeError(
            "GitHub has no verified email for this account. "
            "Grant the user:email scope and ensure a verified email exists on GitHub."
        )

    normalized = primary_verified.strip().lower()

    return {
        "sub": str(profile.get("id")),
        "email": normalized,
        "email_verified": True,
        "name": profile.get("name") or profile.get("login"),
    }


def exchange_facebook_code(code: str, redirect_uri: str) -> Dict[str, Any]:
    with _http() as client:
        r = client.get(
            "https://graph.facebook.com/v19.0/oauth/access_token",
            params={
                "client_id": settings.FACEBOOK_CLIENT_ID.strip(),
                "client_secret": settings.FACEBOOK_CLIENT_SECRET.strip(),
                "redirect_uri": redirect_uri,
                "code": code,
            },
        )
        r.raise_for_status()
        tok = r.json()
    access = tok.get("access_token")
    if not access:
        raise RuntimeError("Facebook token response missing access_token")

    with _http() as client:
        u = client.get(
            "https://graph.facebook.com/me",
            params={"fields": "id,name,email", "access_token": access},
        )
        u.raise_for_status()
        profile = u.json()

    email_raw = (profile.get("email") or "").strip().lower()

    return {
        "sub": str(profile.get("id")),
        "email": email_raw or None,
        "email_verified": bool(email_raw),
        "name": profile.get("name"),
    }


def normalize_google_profile(data: Dict[str, Any]) -> Dict[str, Any]:
    email = (data.get("email") or "").strip().lower()
    verified = bool(data.get("email_verified"))
    return {
        "sub": str(data.get("sub")),
        "email": email,
        "email_verified": verified,
        "name": data.get("name"),
    }


def resolve_or_create_oauth_user(
    db: Session,
    *,
    provider: str,
    subject: str,
    email: str,
    email_verified: bool,
    full_name: Optional[str],
) -> User:
    if not subject:
        raise ValueError("missing subject from provider")
    if not email or not email_verified:
        raise ValueError(
            "Identity provider did not return a verified email; cannot create or link account."
        )

    normalized_email = email.strip().lower()

    existing_identity = (
        db.query(OAuthIdentity)
        .filter(
            OAuthIdentity.provider == provider,
            OAuthIdentity.subject == subject,
        )
        .first()
    )
    if existing_identity:
        user = db.query(User).filter(User.id == existing_identity.user_id).first()
        if user:
            return user

    user = db.query(User).filter(User.email == normalized_email).first()
    if user:
        already = (
            db.query(OAuthIdentity)
            .filter(
                OAuthIdentity.user_id == user.id,
                OAuthIdentity.provider == provider,
                OAuthIdentity.subject == subject,
            )
            .first()
        )
        if not already:
            db.add(OAuthIdentity(user_id=user.id, provider=provider, subject=subject))
            db.commit()
        db.refresh(user)
        return user

    user = User(
        email=normalized_email,
        hashed_password=None,
        full_name=full_name,
        subscription_tier="free_2d",
        preferred_tryon_mode="2d",
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        user = db.query(User).filter(User.email == normalized_email).first()
        if not user:
            raise
        already = (
            db.query(OAuthIdentity)
            .filter(
                OAuthIdentity.user_id == user.id,
                OAuthIdentity.provider == provider,
                OAuthIdentity.subject == subject,
            )
            .first()
        )
        if not already:
            db.add(OAuthIdentity(user_id=user.id, provider=provider, subject=subject))
            db.commit()
        db.refresh(user)
        return user

    db.add(OAuthIdentity(user_id=user.id, provider=provider, subject=subject))
    db.commit()
    db.refresh(user)
    return user


def complete_oauth_login(db: Session, *, provider: str, code: str, state_raw: str) -> User:
    payload = decode_oauth_state_jwt(state_raw)
    if (payload.get("p") or "").lower() != provider:
        raise ValueError("OAuth state does not match provider")

    code_verifier = (payload.get("cv") or "").strip()
    redirect_uri = oauth_callback_url(provider)

    if provider == "google":
        raw = exchange_google_code(code, redirect_uri, code_verifier)
        meta = normalize_google_profile(raw)
    elif provider == "github":
        meta = exchange_github_code(code, redirect_uri, code_verifier)
    elif provider == "facebook":
        meta = exchange_facebook_code(code, redirect_uri)
    else:
        raise ValueError("unsupported provider")

    return resolve_or_create_oauth_user(
        db,
        provider=provider,
        subject=str(meta["sub"]),
        email=str(meta.get("email") or ""),
        email_verified=bool(meta.get("email_verified")),
        full_name=meta.get("name"),
    )
