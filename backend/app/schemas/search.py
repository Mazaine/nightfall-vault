"""Saved search API schemas."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class SavedSearchCreate(BaseModel):
    name: str = Field(min_length=2, max_length=24)
    query: str | None = Field(default=None, max_length=180)
    title: str | None = Field(default=None, max_length=180)
    description: str | None = Field(default=None, max_length=180)
    seller: str | None = Field(default=None, max_length=80)
    category: str | None = Field(default=None, max_length=80)
    hatalom_era: str | None = Field(default=None, max_length=20, pattern=r"^(retro|ujkor|uj_nemzedek)$")
    condition: str | None = Field(default=None, max_length=30)
    status: str | None = Field(default=None, max_length=30)
    listing_type: str | None = Field(default=None, pattern=r"^(auction|fixed)$")
    listing_format: str | None = Field(default=None, pattern=r"^(single|bundle)$")
    variant: str | None = Field(default=None, pattern=r"^(normal|foil|fa|gfa)$")
    min_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    max_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    min_bids: int | None = Field(default=None, ge=0)
    max_bids: int | None = Field(default=None, ge=0)
    buy_now: bool | None = None
    soon_ending: bool = False
    new_only: bool = False

    @field_validator("name", "query", "title", "description", "seller", "category", "hatalom_era", "condition", "status", "listing_type", "listing_format", "variant")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.strip().split())
        return normalized or None

    @model_validator(mode="after")
    def validate_ranges(self) -> "SavedSearchCreate":
        if self.min_price is not None and self.max_price is not None and self.min_price > self.max_price:
            raise ValueError("A legkisebb ár nem lehet nagyobb a legnagyobb árnál.")
        if self.min_bids is not None and self.max_bids is not None and self.min_bids > self.max_bids:
            raise ValueError("A legkisebb licitszám nem lehet nagyobb a legnagyobb licitszámnál.")
        if self.listing_type == "fixed" and any((
            self.min_bids is not None,
            self.max_bids is not None,
            self.buy_now is not None,
            self.soon_ending,
            self.new_only,
        )):
            raise ValueError("Fix áras mentett kereséshez nem adható meg aukciós szűrő.")
        if self.listing_type == "auction" and self.variant is not None:
            raise ValueError("A lapváltozat csak fix áras lapkeresésnél használható.")
        return self


class SavedSearchRead(SavedSearchCreate):
    name: str = Field(max_length=120)
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
