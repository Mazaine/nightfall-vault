import json
import logging
import urllib.parse
import urllib.request

from fastapi import HTTPException, Request, status

from app.core.config import settings
from app.core.rate_limit import get_client_ip

logger = logging.getLogger(__name__)

TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def verify_turnstile_token(request: Request, token: str | None) -> None:
    if not settings.turnstile_secret_key:
        return

    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A botvédelem ellenőrzése kötelező.",
        )

    payload = urllib.parse.urlencode(
        {
            "secret": settings.turnstile_secret_key,
            "response": token,
            "remoteip": get_client_ip(request),
        },
    ).encode("utf-8")
    verify_request = urllib.request.Request(
        TURNSTILE_VERIFY_URL,
        data=payload,
        headers={"content-type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(verify_request, timeout=8) as response:
            result = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        logger.exception("Turnstile ellenőrzési hiba")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="A botvédelem ellenőrzése átmenetileg nem elérhető.",
        ) from exc

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A botvédelem ellenőrzése nem sikerült.",
        )
