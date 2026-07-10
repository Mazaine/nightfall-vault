from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    project_name: str = "Nightfall Vault API"
    database_url: str = ""
    backend_cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"], validation_alias=AliasChoices("BACKEND_CORS_ORIGINS", "CORS_ORIGINS"))
    secret_key: str = ""
    access_token_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_from_name: str = "Nightfall Vault"
    brevo_api_key: str | None = None
    brevo_sender_email: str | None = None
    brevo_sender_name: str = "Nightfall Vault"
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
    newsletter_rate_limit_per_minute: int = 5
    order_admin_email: str | None = None

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

