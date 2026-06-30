import hmac
from hashlib import sha256

from app.core.config import settings


def normalize_newsletter_email(email: str) -> str:
    return email.strip().lower()


def create_unsubscribe_token(email: str) -> str:
    normalized_email = normalize_newsletter_email(email)
    return hmac.new(
        settings.secret_key.encode("utf-8"),
        normalized_email.encode("utf-8"),
        sha256,
    ).hexdigest()


def verify_unsubscribe_token(email: str, token: str) -> bool:
    expected_token = create_unsubscribe_token(email)
    return hmac.compare_digest(expected_token, token)
