from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


TransactionStatus = Literal["transaction_open", "completed", "reviewed", "archived", "cancelled"]


class TransactionUserRead(BaseModel):
    username: str
    full_name: str

    model_config = ConfigDict(from_attributes=True)


class TransactionAuctionRead(BaseModel):
    id: int
    title: str
    finalized_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class TransactionItemRead(BaseModel):
    id: int
    auction_id: int
    title: str
    quantity: int
    unit_price: float
    subtotal: float


class AuctionTransactionRead(BaseModel):
    id: int
    conversation_id: int | None = None
    auction_id: int
    status: TransactionStatus
    seller_completed_at: datetime | None
    buyer_completed_at: datetime | None
    completed_at: datetime | None
    review_deadline: datetime | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
    role: Literal["seller", "buyer"]
    own_completed_at: datetime | None
    partner_completed_at: datetime | None
    can_confirm: bool
    can_review: bool
    own_note: str | None
    can_delete: bool
    auction: TransactionAuctionRead
    partner: TransactionUserRead
    items: list[TransactionItemRead] = []
    total: float = 0


class AuctionTransactionPage(BaseModel):
    items: list[AuctionTransactionRead]
    total: int
    limit: int
    offset: int


class TransactionNoteUpdate(BaseModel):
    note: str | None = Field(default=None, max_length=2000)

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        normalized = value.strip() if value else ""
        return normalized or None


class TransactionConversationMessageCreate(BaseModel):
    message: str = Field(min_length=1, max_length=2000)

    @field_validator("message")
    @classmethod
    def normalize_message(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Az üzenet nem lehet üres.")
        return normalized


class TransactionConversationMessageRead(BaseModel):
    id: int
    source: Literal["common", "legacy"]
    conversation_id: int
    auction_id: int | None = None
    auction_title: str | None = None
    sender_id: int
    sender: TransactionUserRead
    message: str
    created_at: datetime
    read_at: datetime | None = None


class TransactionConversationRead(BaseModel):
    id: int
    role: Literal["seller", "buyer"]
    partner: TransactionUserRead
    transactions: list[AuctionTransactionRead]
    messages: list[TransactionConversationMessageRead]
    item_count: int
    total: float
    created_at: datetime
    updated_at: datetime
