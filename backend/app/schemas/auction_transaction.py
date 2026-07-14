from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator


TransactionStatus = Literal["awaiting_arrangement", "in_progress", "completed", "disputed", "cancelled"]
ParticipantRole = Literal["seller", "buyer"]


class TransactionParticipantRead(BaseModel):
    username: str
    full_name: str


class AuctionTransactionRead(BaseModel):
    id: int
    auction_id: int
    auction_title: str
    auction_image_key: str | None
    amount: Decimal
    status: TransactionStatus
    role: ParticipantRole
    counterparty: TransactionParticipantRead
    seller_confirmed: bool
    buyer_confirmed: bool
    can_confirm: bool
    can_dispute: bool
    dispute_reason: str | None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None


class TransactionDisputeCreate(BaseModel):
    reason: str = Field(min_length=10, max_length=1000)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        normalized = " ".join(value.strip().split())
        if len(normalized) < 10:
            raise ValueError("A vita indoklása legalább 10 karakter legyen.")
        return normalized
