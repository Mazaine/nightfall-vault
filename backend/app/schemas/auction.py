from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

AuctionStatus = Literal["draft", "scheduled", "active", "ended", "sold", "unsold", "cancelled", "suspended"]
AuctionCondition = Literal["fresh", "like_new", "played", "damaged", "worn", "misprint"]


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = " ".join(value.strip().split())
    return normalized or None


def _normalize_required_text(value: str) -> str:
    normalized = " ".join(value.strip().split())
    if not normalized:
        raise ValueError("This field is required.")
    return normalized


def _require_timezone(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Datetime must include timezone information.")
    return value


class UserSummary(BaseModel):
    id: int
    username: str
    full_name: str

    model_config = ConfigDict(from_attributes=True)


class AuctionBase(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    description: str = Field(min_length=10, max_length=5000)
    category: str = Field(min_length=2, max_length=80)
    condition: AuctionCondition
    starting_price: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    bid_increment: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    buy_now_enabled: bool = False
    buy_now_price: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    starts_at: datetime
    ends_at: datetime
    five_minute_rule_enabled: bool = True

    @field_validator("title", "description", "category")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return _normalize_required_text(value)

    @field_validator("starts_at", "ends_at")
    @classmethod
    def validate_timezone(cls, value: datetime) -> datetime:
        return _require_timezone(value)

    @model_validator(mode="after")
    def validate_prices_and_time(self) -> "AuctionBase":
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be later than starts_at.")
        if self.buy_now_enabled:
            if self.buy_now_price is None:
                raise ValueError("buy_now_price is required when buy now is enabled.")
            if self.buy_now_price <= self.starting_price:
                raise ValueError("buy_now_price must be greater than starting_price.")
        elif self.buy_now_price is not None:
            raise ValueError("buy_now_price must be empty when buy now is disabled.")
        return self


class AuctionCreate(AuctionBase):
    seller_declaration_accepted: bool
    seller_declaration_version: str = Field(default="2026-07-11", min_length=4, max_length=20)

    @model_validator(mode="after")
    def validate_declaration(self) -> "AuctionCreate":
        if not self.seller_declaration_accepted:
            raise ValueError("Seller declaration must be accepted.")
        return self


class AuctionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=180)
    description: str | None = Field(default=None, min_length=10, max_length=5000)
    category: str | None = Field(default=None, min_length=2, max_length=80)
    condition: AuctionCondition | None = None
    starting_price: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    bid_increment: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    buy_now_enabled: bool | None = None
    buy_now_price: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    five_minute_rule_enabled: bool | None = None

    @field_validator("title", "description", "category")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @field_validator("starts_at", "ends_at")
    @classmethod
    def validate_optional_timezone(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return _require_timezone(value)


class AuctionFinalizeRequest(BaseModel):
    status: Literal["sold", "unsold"]
    winner_id: int | None = None


class AuctionMessageCreate(BaseModel):
    message: str = Field(min_length=1, max_length=2000)

    @field_validator("message")
    @classmethod
    def normalize_message(cls, value: str) -> str:
        return _normalize_required_text(value)


class AuctionReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=1000)

    @field_validator("comment")
    @classmethod
    def normalize_comment(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)


class AuctionImageRead(BaseModel):
    id: int
    auction_id: int
    storage_key: str
    original_filename: str
    content_type: str
    file_size: int
    position: int
    is_cover: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuctionListItem(BaseModel):
    id: int
    seller_id: int
    title: str
    category: str
    condition: AuctionCondition
    status: AuctionStatus
    starting_price: Decimal
    bid_increment: Decimal
    buy_now_enabled: bool
    buy_now_price: Decimal | None
    starts_at: datetime
    ends_at: datetime
    five_minute_rule_enabled: bool
    winner_id: int | None
    seller: UserSummary | None = None
    images: list[AuctionImageRead] = []

    model_config = ConfigDict(from_attributes=True)


class AuctionResponse(AuctionListItem):
    description: str
    seller_declaration_accepted_at: datetime
    seller_declaration_version: str
    finalized_at: datetime | None
    created_at: datetime
    updated_at: datetime
    winner: UserSummary | None = None
    can_chat: bool = False
    can_review: bool = False
    is_owner: bool = False


class AuctionStatusResponse(BaseModel):
    id: int
    status: AuctionStatus
    starts_at: datetime
    ends_at: datetime
    winner_id: int | None
    finalized_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class AuctionMessageRead(BaseModel):
    id: int
    auction_id: int
    sender_id: int
    message: str
    created_at: datetime
    read_at: datetime | None
    sender: UserSummary | None = None

    model_config = ConfigDict(from_attributes=True)


class AuctionReviewRead(BaseModel):
    id: int
    auction_id: int
    reviewer_id: int
    reviewed_user_id: int
    rating: int
    comment: str | None
    created_at: datetime
    updated_at: datetime
    reviewer: UserSummary | None = None
    reviewed_user: UserSummary | None = None

    model_config = ConfigDict(from_attributes=True)
