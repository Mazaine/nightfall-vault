from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator


class Settings(BaseSettings):
    project_name: str = "Nightfall Vault API"
    database_url: str = ""
    backend_cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"], validation_alias=AliasChoices("backend_cors_origins", "BACKEND_CORS_ORIGINS", "CORS_ORIGINS"))
    secret_key: str = ""
    access_token_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30
    refresh_cookie_name: str = "nightfall_refresh"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_from_name: str = "Nightfall Vault"
    brevo_api_key: str | None = None
    brevo_sender_email: str | None = None
    brevo_sender_name: str = "Nightfall Vault"
    email_delivery_enabled: bool = False
    app_frontend_url: str = "http://localhost:5173"
    app_backend_url: str = "http://localhost:8000"
    frontend_base_url: str = "http://localhost:5173"
    bank_transfer_account_name: str = Field(default="Example Company Ltd.", validation_alias=AliasChoices("BANK_TRANSFER_ACCOUNT_NAME", "BANK_TRANSFER_BENEFICIARY_NAME"))
    bank_transfer_account_number: str = "00000000-00000000-00000000"
    bank_transfer_bank_name: str = "Example Bank"
    environment: str = "development"
    captcha_provider: str = "turnstile"
    captcha_enabled: bool = False
    recaptcha_secret_key: str | None = None
    turnstile_secret_key: str | None = None
    rate_limit_backend: str = "memory"
    redis_url: str = "redis://redis:6379/0"
    login_rate_limit_per_minute: int = 5
    register_rate_limit_per_minute: int = 3
    forgot_password_rate_limit_per_minute: int = 3
    resend_verification_rate_limit_per_minute: int = 3
    newsletter_rate_limit_per_minute: int = 5
    bid_rate_limit_per_minute: int = 30
    bid_withdrawal_rate_limit_per_minute: int = 10
    bid_withdrawal_min_remaining_seconds: int = 300
    bid_withdrawal_warning_threshold: int = 5
    chat_message_rate_limit_per_minute: int = 20
    vip_activation_rate_limit_per_minute: int = 10
    sse_connection_rate_limit_per_minute: int = 30
    realtime_heartbeat_rate_limit_per_minute: int = 10
    order_admin_email: str | None = None
    log_level: str = "INFO"
    log_format: str = "text"
    notification_email_enabled: bool = False
    storage_backend: str = "local"
    media_root: str = Field(default="/data/media", validation_alias=AliasChoices("media_root", "MEDIA_ROOT", "STORAGE_UPLOAD_DIR"))
    media_url_prefix: str = "/media"
    max_image_file_size_bytes: int = 20 * 1024 * 1024
    max_image_pixels: int = 50_000_000
    max_image_width: int = 10_000
    max_image_height: int = 10_000
    auction_scheduler_mode: str = "embedded"
    auction_scheduler_interval_seconds: int = 10
    auction_scheduler_lock_key: int = 8711042
    auction_scheduler_heartbeat_ttl_seconds: int = 30
    transaction_review_window_days: int = 30
    moderation_strike_alert_threshold: int = 3
    trusted_proxy_cidrs: list[str] = Field(default_factory=lambda: ["127.0.0.1/32", "::1/128"])
    development_admin_seed_enabled: bool = False
    error_tracking_dsn: str | None = None
    realtime_stream_max_length: int = 5000

    @field_validator("media_url_prefix")
    @classmethod
    def validate_media_url_prefix(cls, value: str) -> str:
        normalized = "/" + value.strip("/")
        if normalized in {"/", "/api"} or ".." in normalized or "\\" in normalized:
            raise ValueError("MEDIA_URL_PREFIX must be a safe dedicated URL prefix.")
        return normalized

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", populate_by_name=True)


settings = Settings()
