"""Explicit production e-mail smoke CLI; never exposed through HTTP."""

import argparse
from email_validator import validate_email, EmailNotValidError

from app.core.config import settings
from app.services.email_service import send_test_email


def send_smoke(recipient: str, *, confirmed: bool) -> bool:
    if settings.environment.lower() != "production":
        raise RuntimeError("Az e-mail smoke kizárólag ENVIRONMENT=production környezetben futtatható.")
    if not confirmed:
        raise RuntimeError("A küldéshez explicit --confirm-send szükséges.")
    if not settings.email_delivery_enabled:
        raise RuntimeError("Az EMAIL_DELIVERY_ENABLED nincs engedélyezve.")
    try:
        normalized = validate_email(recipient, check_deliverability=False).normalized
    except EmailNotValidError as exc:
        raise ValueError("Érvényes explicit címzett szükséges.") from exc
    return send_test_email(
        normalized,
        "[Nightfall Vault] Production e-mail smoke",
        "<h1>Nightfall Vault e-mail próba</h1><p>Ez egy kézzel indított production kézbesítési ellenőrzés.</p>",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Kézzel jóváhagyott production e-mail smoke.")
    parser.add_argument("--to", required=True, help="Az egyetlen explicit címzett.")
    parser.add_argument("--confirm-send", action="store_true")
    args = parser.parse_args()
    if not send_smoke(args.to, confirmed=args.confirm_send):
        raise SystemExit("A szolgáltató nem igazolta vissza a tesztüzenetet.")
    print("A production e-mail smoke sikeresen elküldve.")


if __name__ == "__main__":
    main()
