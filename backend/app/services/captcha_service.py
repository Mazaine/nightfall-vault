import json
import urllib.error
import urllib.parse
import urllib.request

from fastapi import HTTPException, status

from app.core.config import settings

RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify"
TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def verify_captcha(token: str | None, action: str | None = None) -> None:
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
        )
        return

    if provider == "turnstile":
        _verify_provider_token(
            url=TURNSTILE_VERIFY_URL,
            secret=settings.turnstile_secret_key,
            token=token,
            action=None,
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
) -> None:
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="A botvédelem nincs megfelelően beállítva.",
        )

    payload = urllib.parse.urlencode({"secret": secret, "response": token}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            result = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="A botvédelem ellenőrzése átmenetileg nem sikerült.",
        ) from exc

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A botvédelem ellenőrzése sikertelen.",
        )

    provider_action = result.get("action")
    if action and provider_action and provider_action != action:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A botvédelem művelete nem egyezik.",
        )
