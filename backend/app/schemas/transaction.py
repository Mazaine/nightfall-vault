from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


TransactionStatus = Literal["transaction_open", "completed", "reviewed", "archived"]


class TransactionUserRead(BaseModel):
    username: str
    full_name: str

    model_config = ConfigDict(from_attributes=True)


class TransactionAuctionRead(BaseModel):
    id: int
    title: str
    finalized_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class AuctionTransactionRead(BaseModel):
    id: int
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
    auction: TransactionAuctionRead
    partner: TransactionUserRead


class AuctionTransactionPage(BaseModel):
    items: list[AuctionTransactionRead]
    total: int
    limit: int
    offset: int
