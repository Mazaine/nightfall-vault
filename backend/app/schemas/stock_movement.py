from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

StockMovementType = Literal["order_created", "order_cancelled", "admin_adjustment", "import", "correction"]


class StockMovementRead(BaseModel):
    id: int
    product_id: int
    order_id: int | None
    quantity_change: int
    movement_type: StockMovementType
    note: str | None
    created_by_admin_id: int | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StockAdjustmentCreate(BaseModel):
    quantity_change: int
    note: str | None = Field(default=None, max_length=500)

    @field_validator("quantity_change")
    @classmethod
    def validate_quantity_change(cls, value: int) -> int:
        if value == 0:
            raise ValueError("quantity_change must not be zero")
        return value

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized_value = value.strip()
        return normalized_value or None
