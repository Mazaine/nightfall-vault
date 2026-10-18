from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class CartItemCreate(BaseModel):
    auction_id: int = Field(gt=0)
    quantity: int = Field(default=1, ge=1, le=9)


class CartItemUpdate(BaseModel):
    quantity: int = Field(ge=1, le=9)
    accept_price: bool = False


class CartBundleItemRead(BaseModel):
    card_name: str
    quantity: int
    external_card_id: str
    image_url: str | None = None


class CartItemRead(BaseModel):
    id: int
    auction_id: int
    title: str
    seller_id: int
    seller_name: str
    listing_format: Literal["single", "bundle"]
    variant: str | None
    quantity: int
    max_quantity: int
    unit_price: Decimal
    current_price: Decimal
    subtotal: Decimal
    price_changed: bool
    state: Literal["reserved", "expired", "unavailable"]
    reservation_expires_at: datetime | None
    image_url: str | None
    external_card_id: str | None
    bundle_items: list[CartBundleItemRead]


class CartRead(BaseModel):
    items: list[CartItemRead]
    item_count: int
    total: Decimal
    server_time: datetime


class CheckoutCreate(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=80)
    item_ids: list[int] | None = None


class CheckoutTransactionRead(BaseModel):
    id: int
    seller_id: int
    auction_id: int
    item_count: int


class CheckoutResult(BaseModel):
    checkout_batch_id: int
    transaction_count: int
    seller_count: int
    item_count: int
    total: Decimal
    transactions: list[CheckoutTransactionRead]
