from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class VipCodeGenerateRequest(BaseModel):
    quantity: Literal[10, 50, 100, 150, 200, 500]
    duration_months: Literal[1, 3]


class VipGeneratedCode(BaseModel):
    code: str
    duration_months: int


class VipCodeBatchRead(BaseModel):
    batch_id: str
    duration_months: int
    quantity: int
    created_at: datetime
    codes: list[VipGeneratedCode]


class VipCodeAdminRead(BaseModel):
    id: int
    code: str | None
    masked_code: str
    duration_months: int
    batch_id: str
    created_at: datetime
    redeemed_at: datetime | None
    redeemed_by_username: str | None


class VipActivateRequest(BaseModel):
    code: str = Field(min_length=12, max_length=14)

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        normalized = "".join(character for character in value.upper() if character.isalnum())
        allowed = set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        is_legacy_numeric = len(normalized) == 12 and normalized.isdigit()
        is_current = len(normalized) == 12 and all(character in allowed for character in normalized)
        if not is_legacy_numeric and not is_current:
            raise ValueError("A VIP-kód pontosan 12 betűből vagy számból áll.")
        return normalized


class VipStatusRead(BaseModel):
    is_vip: bool
    vip_expires_at: datetime | None
    active_auction_limit: int | None
    active_auction_count: int
    featured_auctions: bool


class VipActivationRead(VipStatusRead):
    message: str
