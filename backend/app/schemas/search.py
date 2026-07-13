"""Saved search API schemas."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class SavedSearchCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    query: str | None = Field(default=None, max_length=180)
    title: str | None = Field(default=None, max_length=180)
    description: str | None = Field(default=None, max_length=180)
    seller: str | None = Field(default=None, max_length=80)
    category: str | None = Field(default=None, max_length=80)
    condition: str | None = Field(default=None, max_length=30)
    status: str | None = Field(default=None, max_length=30)
    min_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    max_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    min_bids: int | None = Field(default=None, ge=0)
    max_bids: int | None = Field(default=None, ge=0)
    buy_now: bool | None = None
    soon_ending: bool = False
    new_only: bool = False

    @field_validator("name", "query", "title", "description", "seller", "category", "condition", "status")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.strip().split())
        return normalized or None

    @model_validator(mode="after")
    def validate_ranges(self) -> "SavedSearchCreate":
        if self.min_price is not None and self.max_price is not None and self.min_price > self.max_price:
            raise ValueError("min_price cannot be greater than max_price")
        if self.min_bids is not None and self.max_bids is not None and self.min_bids > self.max_bids:
            raise ValueError("min_bids cannot be greater than max_bids")
        return self


class SavedSearchRead(SavedSearchCreate):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
