import json
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx
import jwt
from jwt import PyJWKClient

from app.core.config import settings

PROVIDERS = ("google", "apple", "facebook")


@dataclass(frozen=True)
class ProviderIdentity:
    provider: str
    subject: str
    email: str | None
    email_verified: bool
    display_name: str | None = None


def provider_configured(provider: str) -> bool:
    if provider == "google":
        return bool(settings.google_oauth_client_id and settings.google_oauth_client_secret and settings.google_oauth_redirect_uri)
    if provider == "apple":
        return bool(settings.apple_oauth_client_id and settings.apple_oauth_team_id and settings.apple_oauth_key_id and settings.apple_oauth_private_key and settings.apple_oauth_redirect_uri)
    if provider == "facebook":
        return bool(settings.facebook_oauth_client_id and settings.facebook_oauth_client_secret and settings.facebook_oauth_redirect_uri)
    return False


def authorization_url(provider: str, state: str, nonce: str) -> str:
    if provider == "google":
        query = httpx.QueryParams({"client_id": settings.google_oauth_client_id, "redirect_uri": settings.google_oauth_redirect_uri, "response_type": "code", "scope": "openid email profile", "state": state, "nonce": nonce, "prompt": "select_account"})
        return f"https://accounts.google.com/o/oauth2/v2/auth?{query}"
    if provider == "apple":
        query = httpx.QueryParams({"client_id": settings.apple_oauth_client_id, "redirect_uri": settings.apple_oauth_redirect_uri, "response_type": "code", "response_mode": "form_post", "scope": "name email", "state": state, "nonce": nonce})
        return f"https://appleid.apple.com/auth/authorize?{query}"
    if provider == "facebook":
        query = httpx.QueryParams({"client_id": settings.facebook_oauth_client_id, "redirect_uri": settings.facebook_oauth_redirect_uri, "response_type": "code", "scope": "email,public_profile", "state": state})
        return f"https://www.facebook.com/v23.0/dialog/oauth?{query}"
    raise ValueError("Ismeretlen külső szolgáltató.")


def _apple_client_secret() -> str:
    now = datetime.now(timezone.utc)
    private_key = (settings.apple_oauth_private_key or "").replace("\\n", "\n")
    return jwt.encode(
        {"iss": settings.apple_oauth_team_id, "iat": now, "exp": now + timedelta(minutes=5), "aud": "https://appleid.apple.com", "sub": settings.apple_oauth_client_id},
        private_key,
        algorithm="ES256",
        headers={"kid": settings.apple_oauth_key_id},
    )


def _oidc_identity(provider: str, token_url: str, jwks_url: str, issuer: str | list[str], client_id: str, client_secret: str, redirect_uri: str, code: str, nonce: str) -> ProviderIdentity:
    with httpx.Client(timeout=10.0) as client:
        response = client.post(token_url, data={"grant_type": "authorization_code", "code": code, "client_id": client_id, "client_secret": client_secret, "redirect_uri": redirect_uri})
        response.raise_for_status()
        id_token = response.json().get("id_token")
    if not isinstance(id_token, str):
        raise ValueError("A szolgáltató nem adott érvényes azonosító tokent.")
    key = PyJWKClient(jwks_url).get_signing_key_from_jwt(id_token).key
    claims = jwt.decode(id_token, key, algorithms=["RS256"], audience=client_id, issuer=issuer)
    if not secrets.compare_digest(str(claims.get("nonce", "")), nonce):
        raise ValueError("Érvénytelen bejelentkezési nonce.")
    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject:
        raise ValueError("Hiányzó provider azonosító.")
    email = claims.get("email") if isinstance(claims.get("email"), str) else None
    verified = claims.get("email_verified") in {True, "true"}
    return ProviderIdentity(provider, subject, email.lower() if email else None, verified, claims.get("name"))


def exchange_code(provider: str, code: str, nonce: str) -> ProviderIdentity:
    if provider == "google":
        return _oidc_identity(provider, "https://oauth2.googleapis.com/token", "https://www.googleapis.com/oauth2/v3/certs", ["https://accounts.google.com", "accounts.google.com"], settings.google_oauth_client_id or "", settings.google_oauth_client_secret or "", settings.google_oauth_redirect_uri or "", code, nonce)
    if provider == "apple":
        return _oidc_identity(provider, "https://appleid.apple.com/auth/token", "https://appleid.apple.com/auth/keys", "https://appleid.apple.com", settings.apple_oauth_client_id or "", _apple_client_secret(), settings.apple_oauth_redirect_uri or "", code, nonce)
    if provider == "facebook":
        with httpx.Client(timeout=10.0) as client:
            token_response = client.get("https://graph.facebook.com/v23.0/oauth/access_token", params={"client_id": settings.facebook_oauth_client_id, "client_secret": settings.facebook_oauth_client_secret, "redirect_uri": settings.facebook_oauth_redirect_uri, "code": code})
            token_response.raise_for_status()
            access_token = token_response.json().get("access_token")
            debug_response = client.get("https://graph.facebook.com/debug_token", params={"input_token": access_token, "access_token": f"{settings.facebook_oauth_client_id}|{settings.facebook_oauth_client_secret}"})
            debug_response.raise_for_status()
            debug = debug_response.json().get("data", {})
            if not debug.get("is_valid") or str(debug.get("app_id")) != settings.facebook_oauth_client_id:
                raise ValueError("Érvénytelen Facebook token.")
            profile_response = client.get("https://graph.facebook.com/v23.0/me", params={"fields": "id,name,email", "access_token": access_token})
            profile_response.raise_for_status()
            profile = profile_response.json()
        subject = profile.get("id")
        if not isinstance(subject, str) or not subject:
            raise ValueError("Hiányzó Facebook azonosító.")
        email = profile.get("email") if isinstance(profile.get("email"), str) else None
        return ProviderIdentity(provider, subject, email.lower() if email else None, bool(email), profile.get("name"))
    raise ValueError("Ismeretlen külső szolgáltató.")


def safe_username(email: str | None, provider: str) -> str:
    stem = (email or f"{provider}-user").split("@", 1)[0]
    stem = re.sub(r"[^a-zA-Z0-9_-]", "-", stem).strip("-")[:55] or f"{provider}-user"
    return stem
