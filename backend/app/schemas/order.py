from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

OrderStatus = Literal["pending_payment", "processing", "completed", "cancelled"]
PaymentStatus = Literal["pending", "paid", "failed", "refunded"]


class OrderItemRead(BaseModel):
    id: int
    order_id: int
    product_id: int | None
    product_name: str
    quantity: int
    unit_price: int
    total_price: int

    model_config = ConfigDict(from_attributes=True)


class OrderRead(BaseModel):
    id: int
    order_number: str
    user_id: int | None
    customer_name: str
    customer_email: str
    customer_phone: str | None
    status: OrderStatus
    total_amount: int
    shipping_method: str
    shipping_price: int
    pickup_point_snapshot: Any | None
    shipping_address_snapshot: Any | None
    payment_method: str
    payment_status: PaymentStatus
    source: str
    stock_released_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OrderDetailRead(OrderRead):
    items: list[OrderItemRead] = []


class OrderPublicRead(BaseModel):
    id: int
    order_number: str
    customer_name: str
    customer_email: str
    customer_phone: str | None
    status: OrderStatus
    total_amount: int
    shipping_method: str
    shipping_price: int
    pickup_point_snapshot: Any | None
    shipping_address_snapshot: Any | None
    payment_method: str
    payment_status: PaymentStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OrderPublicDetailRead(OrderPublicRead):
    items: list[OrderItemRead] = []


MyOrderRead = OrderPublicRead
MyOrderDetailRead = OrderPublicDetailRead


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class OrderCreateItem(BaseModel):
    product_id: int
    variant_id: int | None = None
    quantity: int = Field(ge=1, le=99)


class OrderCreate(BaseModel):
    customer_name: str = Field(min_length=2, max_length=160)
    customer_email: EmailStr
    customer_phone: str | None = Field(default=None, max_length=40)
    shipping_method: str | None = Field(default=None, max_length=120)
    pickup_point_id: int | None = None
    shipping_zip: str | None = Field(default=None, max_length=20)
    shipping_city: str | None = Field(default=None, max_length=120)
    shipping_address: str | None = Field(default=None, max_length=255)
    payment_method: str = Field(default="bank_transfer", min_length=2, max_length=120)
    captcha_token: str | None = None
    turnstile_token: str | None = None
    items: list[OrderCreateItem] = Field(min_length=1)

    @field_validator("customer_name", "payment_method")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        normalized_value = " ".join(value.strip().split())
        if not normalized_value:
            raise ValueError("This field is required.")
        return normalized_value

    @field_validator("shipping_method", "customer_phone", "shipping_zip", "shipping_city", "shipping_address")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized_value = " ".join(value.strip().split())
        return normalized_value or None

    @field_validator("customer_email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()
