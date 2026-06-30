from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ShippingUnitType = Literal[
    "SINGLE_CARD",
    "BOOSTER",
    "ALFA",
    "DISPLAY",
    "ZEN_PACK",
    "RARE_SET",
    "COMMON_UNCOMMON_PLAYSET",
    "MYSTERY_PACK",
    "CUSTOM",
]


class ShippingMethodBase(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    code: str = Field(min_length=2, max_length=80)
    description: str | None = None
    price: int = Field(ge=0)
    min_booster_equivalent: float | None = Field(default=None, ge=0)
    max_booster_equivalent: float | None = Field(default=None, ge=0)
    is_active: bool = True
    sort_order: int = 0

    @field_validator("name", "code")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        return " ".join(value.strip().split())

    @field_validator("description")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized_value = value.strip()
        return normalized_value or None


class ShippingMethodCreate(ShippingMethodBase):
    pass


class ShippingMethodUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    code: str | None = Field(default=None, min_length=2, max_length=80)
    description: str | None = None
    price: int | None = Field(default=None, ge=0)
    min_booster_equivalent: float | None = Field(default=None, ge=0)
    max_booster_equivalent: float | None = Field(default=None, ge=0)
    is_active: bool | None = None
    sort_order: int | None = None

    @field_validator("name", "code")
    @classmethod
    def normalize_optional_required_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return " ".join(value.strip().split())

    @field_validator("description")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized_value = value.strip()
        return normalized_value or None


class ShippingMethodRead(ShippingMethodBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ShippingCartItem(BaseModel):
    product_id: int
    quantity: int = Field(ge=1, le=999)


class ShippingAvailableMethodsRequest(BaseModel):
    items: list[ShippingCartItem] = Field(min_length=1)


class ShippingAvailableMethodsResponse(BaseModel):
    total_booster_equivalent: float
    methods: list[ShippingMethodRead]
