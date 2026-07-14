from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.user import UserMeRead


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    captcha_token: str | None = None
    turnstile_token: str | None = None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserMeRead


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    captcha_token: str | None = None
    turnstile_token: str | None = None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()


class ResendVerificationRequest(ForgotPasswordRequest):
    pass


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20, max_length=256)
    new_password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)


class MessageResponse(BaseModel):
    message: str


class FieldError(BaseModel):
    field: str
    message: str


class FieldErrorResponse(BaseModel):
    message: str
    errors: list[FieldError]
