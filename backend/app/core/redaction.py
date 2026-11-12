"""Output-boundary redaction; never log raw request bodies or partner payloads."""
import re
from app.core.config import settings

REDACTED = "[REDACTED]"
SENSITIVE_KEYS = {"authorization", "password", "token", "secret", "api_key", "email", "phone", "address", "buyer", "billing", "delivery", "note", "full_name", "recipient_name"}


def redact(value: str) -> str:
    # Actual configured secrets are removed even inside an unexpected exception.
    for key in type(settings).model_fields:
        if any(word in key for word in ("password", "secret", "api_key", "database_url", "redis_url")):
            secret = getattr(settings, key, None)
            if isinstance(secret, str) and len(secret) >= 8:
                value = value.replace(secret, REDACTED)
    value = re.sub(r"\b(?:postgres(?:ql)?(?:\+\w+)?|redis|rediss)://[^\s\"'<>]+", REDACTED, value, flags=re.I)
    value = re.sub(r"\bBearer\s+[^\s\"',;]+", "Bearer " + REDACTED, value, flags=re.I)
    value = re.sub(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", REDACTED, value)
    value = re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", REDACTED, value)
    # Includes quoted JSON/repr fields and common key=value diagnostics.
    keys = "|".join(sorted(SENSITIVE_KEYS | {"access_token", "refresh_token", "client_secret", "street_address", "tax_number"}))
    value = re.sub(rf'''(?i)(["']?(?:{keys})["']?\s*[:=]\s*)("[^"\n]*"|'[^'\n]*'|[^\s,;}}]+)''', lambda m: m[1] + REDACTED, value)
    # Access logs must not preserve arbitrary query parameter values.
    return re.sub(r"\?[^\s\"']+", "?[REDACTED]", value)


def redact_metadata(value):
    if isinstance(value, dict):
        return {key: REDACTED if any(word in str(key).lower() for word in SENSITIVE_KEYS) else redact_metadata(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact_metadata(item) for item in value]
    return redact(value) if isinstance(value, str) else value
