from pydantic import BaseModel, field_validator

from app.schemas.user import UserMeRead


class LoginRequest(BaseModel):
    email: str
    password: str
    captcha_token: str | None = None
    turnstile_token: str | None = None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserMeRead


class ForgotPasswordRequest(BaseModel):
    email: str
    captcha_token: str | None = None
    turnstile_token: str | None = None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class MessageResponse(BaseModel):
    message: str


class FieldError(BaseModel):
    field: str
    message: str


class FieldErrorResponse(BaseModel):
    message: str
    errors: list[FieldError]
