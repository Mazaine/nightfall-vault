from pathlib import Path
from urllib.parse import urlparse

from app.core.config import Settings

UNSAFE_SECRETS = {"", "change-me", "changeme", "development-secret", "replace-with-a-long-random-secret"}


def validate_production_settings(settings: Settings) -> None:
    if settings.environment.lower() != "production":
        return
    errors: list[str] = []
    if len(settings.secret_key) < 32 or settings.secret_key.lower() in UNSAFE_SECRETS:
        errors.append("SECRET_KEY must be a strong value of at least 32 characters.")
    if not settings.database_url.startswith(("postgresql://", "postgresql+psycopg://")):
        errors.append("DATABASE_URL must use PostgreSQL in production.")
    if not settings.redis_url.startswith(("redis://", "rediss://")):
        errors.append("REDIS_URL must use Redis in production.")
    if any(origin == "*" or "localhost" in origin or "127.0.0.1" in origin for origin in settings.backend_cors_origins):
        errors.append("BACKEND_CORS_ORIGINS must not contain wildcard or development hosts.")
    for name, value in (("APP_FRONTEND_URL", settings.app_frontend_url), ("APP_BACKEND_URL", settings.app_backend_url), ("FRONTEND_BASE_URL", settings.frontend_base_url)):
        parsed = urlparse(value)
        if parsed.scheme != "https" or not parsed.netloc:
            errors.append(f"{name} must be an absolute HTTPS URL.")
    if settings.development_admin_seed_enabled:
        errors.append("DEVELOPMENT_ADMIN_SEED_ENABLED must be false in production.")
    if settings.auction_scheduler_mode.lower() not in {"external", "worker"}:
        errors.append("AUCTION_SCHEDULER_MODE must be external or worker in production.")
    if settings.email_delivery_enabled:
        brevo_ready = bool(settings.brevo_api_key and settings.brevo_sender_email)
        smtp_ready = bool(settings.smtp_host and settings.smtp_user and settings.smtp_password and settings.smtp_from_email)
        if not (brevo_ready or smtp_ready):
            errors.append("Email delivery requires a complete Brevo or SMTP configuration.")
    if not settings.trusted_proxy_cidrs:
        errors.append("TRUSTED_PROXY_CIDRS must contain the reverse proxy network.")
    if settings.realtime_stream_max_length < 100:
        errors.append("REALTIME_STREAM_MAX_LENGTH must be at least 100.")
    media_root = Path(settings.media_root)
    if not media_root.is_absolute():
        errors.append("MEDIA_ROOT must be an absolute path.")
    if errors:
        raise RuntimeError("Invalid production configuration: " + " ".join(errors))
