from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=80)
    full_name: str = Field(min_length=2, max_length=160)
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)
    accepted_terms: bool
    accepted_privacy: bool
    subscribed_newsletter: bool = False
    captcha_token: str | None = None
    turnstile_token: str | None = None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        normalized_value = value.strip()
        if not normalized_value:
            raise ValueError("Username is required.")
        return normalized_value

    @field_validator("full_name")
    @classmethod
    def normalize_full_name(cls, value: str) -> str:
        normalized_value = " ".join(value.strip().split())
        if not normalized_value:
            raise ValueError("Full name is required.")
        return normalized_value


class AccountDeleteRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)


class UserPublic(BaseModel):
    id: int
    email: str
    username: str
    full_name: str
    role: Literal["user", "admin"]
    is_active: bool
    is_email_verified: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserMeRead(BaseModel):
    id: int
    email: str
    username: str
    full_name: str
    role: Literal["user", "admin"]

    model_config = ConfigDict(from_attributes=True)


class UserProfileUpdate(BaseModel):
    email: EmailStr | None = None
    username: str | None = Field(default=None, min_length=3, max_length=80)
    full_name: str | None = Field(default=None, min_length=2, max_length=160)

    @field_validator("email")
    @classmethod
    def normalize_update_email(cls, value: EmailStr | None) -> str | None:
        if value is None:
            return None
        return str(value).strip().lower()

    @field_validator("username")
    @classmethod
    def normalize_update_username(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized_value = value.strip()
        if not normalized_value:
            raise ValueError("Username is required")
        return normalized_value

    @field_validator("full_name")
    @classmethod
    def normalize_update_full_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized_value = " ".join(value.strip().split())
        if not normalized_value:
            raise ValueError("Full name is required")
        return normalized_value


class UserAdminUpdate(BaseModel):
    role: Literal["user", "admin"] | None = None
    is_active: bool | None = None
    is_email_verified: bool | None = None
