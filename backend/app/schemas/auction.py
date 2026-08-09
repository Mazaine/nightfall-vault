from datetime import datetime
from decimal import Decimal
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator

from app.storage.paths import media_url

AuctionStatus = Literal["draft", "scheduled", "active", "ended", "sold", "unsold", "cancelled", "suspended"]
AuctionCondition = Literal["M", "NM", "EX", "GD", "LP", "PL", "PO"]
AuctionConditionRead = Literal["M", "NM", "EX", "GD", "LP", "PL", "PO", "fresh", "like_new", "played", "damaged", "worn", "misprint"]


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = " ".join(value.strip().split())
    return normalized or None


def _normalize_required_text(value: str) -> str:
    normalized = " ".join(value.strip().split())
    if not normalized:
        raise ValueError("A mező kitöltése kötelező.")
    return normalized


def _require_timezone(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Az időpontnak időzóna-információt is tartalmaznia kell.")
    return value


def _safe_external_url(value: str | None) -> str | None:
    normalized = value.strip() if value else None
    if not normalized:
        return None
    if any(character.isspace() or ord(character) < 32 for character in normalized) or any(character in normalized for character in '<>"\''):
        raise ValueError("A hivatkozás nem tartalmazhat szóközt vagy vezérlőkaraktert.")
    parsed = urlsplit(normalized)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError("Csak biztonságos http:// vagy https:// hivatkozás adható meg.")
    return normalized


class UserSummary(BaseModel):
    id: int
    username: str
    full_name: str

    model_config = ConfigDict(from_attributes=True)


class AuctionBase(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    description: str = Field(min_length=10, max_length=5000)
    external_link_label: str | None = Field(default=None, max_length=80)
    external_link_url: str | None = Field(default=None, max_length=1000)
    category: str = Field(min_length=2, max_length=80)
    condition: AuctionCondition
    has_printing_error: bool = False
    printing_error_description: str | None = Field(default=None, min_length=3, max_length=500)
    starting_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
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

    @field_validator("external_link_label", "printing_error_description")
    @classmethod
    def normalize_link_label(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @field_validator("external_link_url")
    @classmethod
    def validate_external_link(cls, value: str | None) -> str | None:
        return _safe_external_url(value)

    @field_validator("starts_at", "ends_at")
    @classmethod
    def validate_timezone(cls, value: datetime) -> datetime:
        return _require_timezone(value)

    @model_validator(mode="after")
    def validate_prices_and_time(self) -> "AuctionBase":
        if bool(self.external_link_label) != bool(self.external_link_url):
            raise ValueError("A hivatkozás feliratát és URL-jét együtt kell megadni.")
        if not self.has_printing_error and self.printing_error_description:
            raise ValueError("Hibaleírás csak nyomdahibás vagy gyártási hibás jelölés mellett adható meg.")
        if self.printing_error_description and any(character in self.printing_error_description for character in "<>"):
            raise ValueError("A hibaleírásban HTML-jelölés nem engedélyezett.")
        if self.ends_at <= self.starts_at:
            raise ValueError("A lejárati időnek későbbinek kell lennie a kezdési időnél.")
        if self.buy_now_enabled:
            if self.buy_now_price is None:
                raise ValueError("Bekapcsolt villámárnál kötelező megadni a villámár összegét.")
            if self.buy_now_price <= self.starting_price:
                raise ValueError("A villámárnak magasabbnak kell lennie a kezdőárnál.")
        elif self.buy_now_price is not None:
            raise ValueError("Kikapcsolt villámárnál nem adható meg villámárösszeg.")
        return self


class AuctionCreate(AuctionBase):
    creation_key: str | None = Field(default=None, min_length=36, max_length=36, pattern=r"^[0-9a-fA-F-]{36}$")
    seller_declaration_accepted: bool
    seller_declaration_version: str = Field(default="2026-07-11", min_length=4, max_length=20)

    @model_validator(mode="after")
    def validate_declaration(self) -> "AuctionCreate":
        if not self.seller_declaration_accepted:
            raise ValueError("Az eladói nyilatkozat elfogadása kötelező.")
        return self


class AuctionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=180)
    description: str | None = Field(default=None, min_length=10, max_length=5000)
    external_link_label: str | None = Field(default=None, max_length=80)
    external_link_url: str | None = Field(default=None, max_length=1000)
    category: str | None = Field(default=None, min_length=2, max_length=80)
    condition: AuctionCondition | None = None
    has_printing_error: bool | None = None
    printing_error_description: str | None = Field(default=None, min_length=3, max_length=500)
    starting_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    bid_increment: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    buy_now_enabled: bool | None = None
    buy_now_price: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    five_minute_rule_enabled: bool | None = None

    @field_validator("title", "description", "category", "external_link_label", "printing_error_description")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @field_validator("external_link_url")
    @classmethod
    def validate_optional_external_link(cls, value: str | None) -> str | None:
        return _safe_external_url(value)

    @model_validator(mode="after")
    def reject_html_in_printing_error(self) -> "AuctionUpdate":
        if self.printing_error_description and any(character in self.printing_error_description for character in "<>"):
            raise ValueError("A hibaleírásban HTML-jelölés nem engedélyezett.")
        return self

    @field_validator("starts_at", "ends_at")
    @classmethod
    def validate_optional_timezone(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return _require_timezone(value)


class AuctionFinalizeRequest(BaseModel):
    status: Literal["sold", "unsold"]
    winner_id: int | None = None


class AuctionModerationRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        return _normalize_required_text(value)


class BidCreate(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)


class BidWithdrawalRequest(BaseModel):
    reason_code: Literal["accidental", "wrong_amount", "technical_issue", "leave_auction", "other"]
    reason_text: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_reason_text(self):
        if self.reason_text is not None:
            self.reason_text = " ".join(self.reason_text.strip().split()) or None
        if self.reason_text and ("<" in self.reason_text or ">" in self.reason_text):
            raise ValueError("HTML jelölés nem engedélyezett.")
        if self.reason_code == "other" and (self.reason_text is None or len(self.reason_text) < 10):
            raise ValueError("Az Egyéb indoklás legalább 10 karakter hosszú legyen.")
        if self.reason_code != "other":
            self.reason_text = None
        return self


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
    width: int | None = None
    height: int | None = None
    thumbnail_storage_key: str | None = None
    list_storage_key: str | None = None
    detail_storage_key: str | None = None
    position: int
    is_cover: bool
    created_at: datetime

    @computed_field
    @property
    def url(self) -> str:
        return media_url(self.storage_key) or ""

    @computed_field
    @property
    def thumbnail_url(self) -> str | None:
        return media_url(self.thumbnail_storage_key)

    @computed_field
    @property
    def list_url(self) -> str | None:
        return media_url(self.list_storage_key)

    @computed_field
    @property
    def detail_url(self) -> str | None:
        return media_url(self.detail_storage_key)

    model_config = ConfigDict(from_attributes=True)


class BidRead(BaseModel):
    id: int
    auction_id: int
    amount: Decimal
    created_at: datetime
    bidder_label: str
    is_highest: bool = False
    reaches_buy_now: bool = False
    status: str = "active"


class BidHistoryItem(BaseModel):
    id: int
    amount: Decimal
    created_at: datetime
    bidder_label: str
    is_highest: bool = False
    status: str = "active"
    withdrawn_at: datetime | None = None
    can_withdraw: bool = False
    withdrawable_until: datetime | None = None
    withdrawal_block_reason: str | None = None
    is_top_active_bid: bool = False


class BidWithdrawalResponse(BaseModel):
    bid_id: int
    status: str
    auction_id: int
    auction_status: str
    highest_bid_id: int | None
    current_price: Decimal
    next_minimum_bid: Decimal
    leading_bidder_label: str | None
    next_withdrawable_bid: BidHistoryItem | None = None


class AuctionRealtimeSnapshot(BaseModel):
    auction_id: int
    status: AuctionStatus
    current_price: Decimal
    highest_bid_id: int | None
    bid_count: int
    winner_id: int | None
    ends_at: datetime
    is_listed: bool = True
    is_demo: bool = False
    bids: list[BidHistoryItem]


class NotificationRead(BaseModel):
    id: int
    auction_id: int | None
    type: str
    title: str
    message: str
    category: str = "system"
    target_url: str | None = None
    in_app_enabled: bool = True
    browser_enabled: bool = False
    email_enabled: bool = False
    is_read: bool
    created_at: datetime
    is_demo: bool = False

    model_config = ConfigDict(from_attributes=True)


class NotificationUnreadCount(BaseModel):
    unread_count: int


class AuctionListItem(BaseModel):
    id: int
    seller_id: int
    title: str
    external_link_label: str | None = None
    external_link_url: str | None = None
    category: str
    condition: AuctionConditionRead
    has_printing_error: bool = False
    printing_error_description: str | None = None
    status: AuctionStatus
    starting_price: Decimal
    bid_increment: Decimal
    current_price: Decimal
    buy_now_enabled: bool
    buy_now_price: Decimal | None
    starts_at: datetime
    ends_at: datetime
    five_minute_rule_enabled: bool
    winner_id: int | None
    highest_bid_id: int | None
    deleted_at: datetime | None = None
    moderated_at: datetime | None = None
    moderated_by_admin_id: int | None = None
    moderation_reason: str | None = None
    bid_count: int = 0
    seller_average_rating: float | None = None
    seller_review_count: int = 0
    is_featured: bool = False
    is_demo: bool = False
    viewer_is_leading: bool = False
    viewer_top_bid_id: int | None = None
    viewer_can_withdraw: bool = False
    viewer_withdrawal_block_reason: str | None = None
    viewer_personal_status: Literal["leading", "outbid", "watched", "exited"] | None = None
    viewer_is_watched: bool = False
    owner_sale_status: Literal["not_sold", "sale_pending", "sale_sent"] | None = None
    seller: UserSummary | None = None
    images: list[AuctionImageRead] = []

    model_config = ConfigDict(from_attributes=True)


class MyBidAuctionItem(BaseModel):
    auction: AuctionListItem
    my_highest_bid: Decimal | None = None
    is_leading: bool
    has_won: bool
    is_outbid: bool
    my_last_bid_at: datetime | None = None
    transaction_id: int | None = None
    top_bid_id: int | None = None
    can_withdraw: bool = False
    withdrawal_block_reason: str | None = None
    has_exited: bool = False
    is_watched: bool = False
    participation_note: str | None = None


class MyBidAuctionPage(BaseModel):
    items: list[MyBidAuctionItem]
    total: int
    limit: int
    offset: int
    server_time: datetime


class WatchlistItemRead(BaseModel):
    id: int
    auction: AuctionListItem
    created_at: datetime

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
    chat_read_only: bool = False
    can_review: bool = False
    is_owner: bool = False


class AuctionStatusResponse(BaseModel):
    id: int
    status: AuctionStatus
    starts_at: datetime
    ends_at: datetime
    winner_id: int | None
    current_price: Decimal
    highest_bid_id: int | None
    finalized_at: datetime | None
    is_demo: bool = False

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


class AuctionConversationRead(BaseModel):
    auction_id: int
    auction_title: str
    auction_image_url: str | None = None
    role: Literal["seller", "winner"]
    counterparty: UserSummary
    message_count: int
    last_message: str | None = None
    last_message_at: datetime | None = None
    finalized_at: datetime


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

class AuctionListPage(BaseModel):
    items: list[AuctionListItem]
    total: int
    limit: int
    offset: int


class AuctionReviewPage(BaseModel):
    items: list[AuctionReviewRead]
    total: int
    limit: int
    offset: int
