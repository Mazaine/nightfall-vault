from typing import Any

from pydantic import BaseModel, ConfigDict


class PickupPointRead(BaseModel):
    id: int
    carrier: str
    external_id: str
    name: str
    zip: str | None
    city: str | None
    address: str | None
    latitude: float | None
    longitude: float | None
    opening_hours: Any | None
    comment: str | None

    model_config = ConfigDict(from_attributes=True)
