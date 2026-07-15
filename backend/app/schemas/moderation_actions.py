from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


ModerationActionType = Literal["warning", "auction_creation_ban", "bidding_ban", "chat_ban", "temporary_ban", "permanent_ban"]
StrikeSeverity = Literal["low", "medium", "high", "critical"]


def clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = " ".join(value.strip().split())
    if "<" in normalized or ">" in normalized:
        raise ValueError("HTML jelölés nem engedélyezett.")
    return normalized or None


class ModerationActionCreate(BaseModel):
    target_user_id: int
    action_type: ModerationActionType
    reason: str = Field(min_length=3, max_length=1000)
    internal_note: str | None = Field(default=None, max_length=2000)
    source_report_id: int | None = None
    expires_at: datetime | None = None

    @field_validator("reason", "internal_note")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class StrikeCreate(BaseModel):
    target_user_id: int
    reason: str = Field(min_length=3, max_length=1000)
    severity: StrikeSeverity
    source_report_id: int | None = None
    expires_at: datetime | None = None

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        return clean_text(value) or ""


class ModerationUserSummary(BaseModel):
    id: int
    username: str
    full_name: str

    model_config = ConfigDict(from_attributes=True)


class ModerationActionRead(BaseModel):
    id: int
    target_user_id: int
    target_user: ModerationUserSummary
    action_type: str
    reason: str
    internal_note: str | None
    created_by_admin_id: int
    source_report_id: int | None
    starts_at: datetime
    expires_at: datetime | None
    revoked_at: datetime | None
    revoked_by_admin_id: int | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserStrikeRead(BaseModel):
    id: int
    user_id: int
    user: ModerationUserSummary
    reason: str
    severity: str
    source_report_id: int | None
    issued_by_admin_id: int
    issued_at: datetime
    expires_at: datetime | None
    revoked_at: datetime | None
    revoked_by_admin_id: int | None

    model_config = ConfigDict(from_attributes=True)


class ModerationOverview(BaseModel):
    actions: list[ModerationActionRead]
    strikes: list[UserStrikeRead]
