from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ReportTargetType = Literal["auction", "user"]
ReportStatus = Literal["open", "under_review", "resolved", "dismissed"]
ReportPriority = Literal["low", "normal", "high", "urgent"]

AUCTION_REPORT_REASONS = {
    "counterfeit",
    "prohibited_item",
    "misleading_description",
    "copyright_content",
    "spam",
    "offensive_content",
    "suspicious_seller",
    "other",
}
USER_REPORT_REASONS = {
    "harassment",
    "suspected_fraud",
    "spam",
    "offensive_behavior",
    "auction_policy_violation",
    "impersonation",
    "other",
}


def normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = " ".join(value.strip().split())
    return normalized or None


class ReportCreate(BaseModel):
    reason: str = Field(min_length=2, max_length=80)
    details: str | None = Field(default=None, max_length=1200)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("details")
    @classmethod
    def normalize_details(cls, value: str | None) -> str | None:
        normalized = normalize_optional_text(value)
        if normalized and ("<" in normalized or ">" in normalized):
            raise ValueError("A jelentés nem tartalmazhat HTML-jelölést.")
        return normalized


class ReportUserSummary(BaseModel):
    username: str
    full_name: str

    model_config = ConfigDict(from_attributes=True)


class ReportAuctionSummary(BaseModel):
    id: int
    title: str
    status: str

    model_config = ConfigDict(from_attributes=True)


class ReportRead(BaseModel):
    id: int
    target_type: str
    auction_id: int | None
    reported_user: ReportUserSummary | None = None
    auction: ReportAuctionSummary | None = None
    reason: str
    details: str | None
    status: str
    public_resolution: str | None
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class ReportPage(BaseModel):
    items: list[ReportRead]
    total: int
    limit: int
    offset: int


class AdminReportRead(ReportRead):
    reporter: ReportUserSummary | None = None
    priority: str
    assigned_admin: ReportUserSummary | None = None
    admin_note: str | None
    related_open_reports: int = 0
    related_total_reports: int = 0


class AdminReportPage(BaseModel):
    items: list[AdminReportRead]
    total: int
    limit: int
    offset: int


class ReportStatusUpdate(BaseModel):
    status: ReportStatus
    public_resolution: str | None = Field(default=None, max_length=1000)

    @field_validator("public_resolution")
    @classmethod
    def normalize_resolution(cls, value: str | None) -> str | None:
        normalized = normalize_optional_text(value)
        if normalized and ("<" in normalized or ">" in normalized):
            raise ValueError("A lezárási összefoglaló nem tartalmazhat HTML-jelölést.")
        return normalized


class ReportPriorityUpdate(BaseModel):
    priority: ReportPriority


class ReportNoteUpdate(BaseModel):
    admin_note: str | None = Field(default=None, max_length=2000)

    @field_validator("admin_note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        normalized = normalize_optional_text(value)
        if normalized and ("<" in normalized or ">" in normalized):
            raise ValueError("Az adminisztrátori megjegyzés nem tartalmazhat HTML-jelölést.")
        return normalized


class BlockRead(BaseModel):
    username: str
    full_name: str
    blocked_at: datetime


class BlockStatusRead(BaseModel):
    username: str
    is_blocked: bool
    is_blocked_by_user: bool = False
