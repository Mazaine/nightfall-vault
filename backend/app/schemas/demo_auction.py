from datetime import datetime

from pydantic import BaseModel, Field


class DemoAuctionCounts(BaseModel):
    regular_count: int = Field(default=80, ge=0, le=500)
    featured_count: int = Field(default=20, ge=0, le=500)

    def validate_total(self) -> None:
        if self.regular_count + self.featured_count < 1 or self.regular_count + self.featured_count > 500:
            raise ValueError("Összesen 1 és 500 közötti demóaukció kérhető.")


class DemoAuctionMutation(DemoAuctionCounts):
    confirmation: str = Field(min_length=1, max_length=80)


class DemoAuctionCleanupRequest(BaseModel):
    batch_key: str | None = Field(default=None, max_length=36)
    confirmation: str = Field(min_length=1, max_length=80)


class DemoAuctionCleanupPreviewRequest(BaseModel):
    batch_key: str | None = Field(default=None, max_length=36)


class DemoAuctionPreview(BaseModel):
    regular_count: int
    featured_count: int
    total_auctions: int
    image_count: int
    media_variant_count: int
    expected_bid_count: int
    categories: list[str]
    earliest_end_at: datetime
    latest_end_at: datetime
    buy_now_count: int
    five_minute_rule_count: int
    demo_user_count: int


class DemoAuctionStatus(BaseModel):
    batch_key: str | None = None
    status: str = "none"
    regular_count: int = 0
    featured_count: int = 0
    total_auctions: int = 0
    image_count: int = 0
    media_variant_count: int = 0
    bid_count: int = 0
    demo_user_count: int = 0
    created_at: datetime | None = None
    completed_at: datetime | None = None
    deleted_at: datetime | None = None
    created_by_admin: str | None = None
    error_message: str | None = None


class DemoAuctionCleanupPreview(BaseModel):
    batch_key: str
    auctions: int
    images: int
    media_files: int
    bids: int
    watchlist_items: int
    notifications: int
    transactions: int
    messages: int
    reviews: int
    bid_exclusions: int
    reports: int
    demo_users: int


class DemoAuctionOperationResult(BaseModel):
    action: str
    batch_key: str | None = None
    status: str
    regular_count: int = 0
    featured_count: int = 0
    total_auctions: int = 0
    image_count: int = 0
    bid_count: int = 0
    deleted_records: int = 0
