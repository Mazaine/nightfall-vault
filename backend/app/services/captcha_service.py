import json
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException, Request, status

from app.core.config import settings
from app.core.rate_limit import get_client_ip

RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify"
TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def verify_captcha(token: str | None, action: str | None = None, request: Request | None = None) -> None:
    if not settings.captcha_enabled:
        return

    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A botvédelem ellenőrzése kötelező.",
        )

    provider = settings.captcha_provider.strip().lower()
    if provider == "recaptcha":
        _verify_provider_token(
            url=RECAPTCHA_VERIFY_URL,
            secret=settings.recaptcha_secret_key,
            token=token,
            action=action,
            remote_ip=get_client_ip(request) if request is not None else None,
            expected_hostname=None,
        )
        return

    if provider == "turnstile":
        _verify_provider_token(
            url=TURNSTILE_VERIFY_URL,
            secret=settings.turnstile_secret_key,
            token=token,
            action=action,
            remote_ip=get_client_ip(request) if request is not None else None,
            expected_hostname=(
                urlparse(settings.app_frontend_url).hostname
                if settings.environment.lower() == "production"
                else None
            ),
        )
        return

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Ismeretlen botvédelmi szolgáltató.",
    )


def _verify_provider_token(
    *,
    url: str,
    secret: str | None,
    token: str,
    action: str | None,
    remote_ip: str | None,
    expected_hostname: str | None,
) -> None:
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="A botvédelem nincs megfelelően beállítva.",
        )

    payload = {"secret": secret, "response": token}
    if remote_ip and remote_ip != "unknown":
        payload["remoteip"] = remote_ip

    try:
        response = httpx.post(url, data=payload, timeout=8)
        response.raise_for_status()
        result = response.json()
    except (httpx.HTTPError, json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="A botvédelem ellenőrzése átmenetileg nem sikerült.",
        ) from exc

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A botvédelem ellenőrzése sikertelen.",
        )

    if action and result.get("action") != action:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A botvédelem művelete nem egyezik.",
        )
    if expected_hostname and result.get("hostname") != expected_hostname:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A botvédelem domain-ellenőrzése nem sikerült.",
        )
