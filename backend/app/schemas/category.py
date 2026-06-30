from pydantic import BaseModel, ConfigDict


class CategoryRead(BaseModel):
    id: int
    name: str
    slug: str
    description: str | None
    sort_order: int

    model_config = ConfigDict(from_attributes=True)
