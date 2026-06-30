from pydantic import BaseModel, ConfigDict, Field, field_validator

ALLOWED_SHIPPING_UNIT_TYPES = {"SINGLE_ITEM", "SMALL", "MEDIUM", "LARGE", "CUSTOM"}
ALLOWED_STOCK_STATUSES = {"in_stock", "out_of_stock"}


def normalize_shipping_unit_type(value: str | None) -> str | None:
    if value is None:
        return None
    normalized_value = value.strip().upper()
    if normalized_value not in ALLOWED_SHIPPING_UNIT_TYPES:
        raise ValueError("Invalid shipping unit type.")
    return normalized_value


def normalize_stock_status(value: str | None) -> str | None:
    if value is None:
        return None
    normalized_value = value.strip().lower()
    if normalized_value not in ALLOWED_STOCK_STATUSES:
        raise ValueError("Invalid stock status.")
    return normalized_value


class ProductVariantRead(BaseModel):
    id: int
    product_id: int
    name: str
    slug: str
    stock_quantity: int
    normal_price_huf: int | None
    image_url: str | None
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class ProductRead(BaseModel):
    id: int
    category_id: int
    name: str
    slug: str
    subcategory_name: str | None
    subcategory_slug: str | None
    short_description: str | None
    image_url: str | None
    normal_price_huf: int
    shipping_unit_type: str
    shipping_unit_value: int | None
    shipping_class: str | None
    manage_stock: bool
    stock_quantity: int
    stock_status: str
    is_featured: bool
    badge_label: str | None
    variants: list[ProductVariantRead] = []

    model_config = ConfigDict(from_attributes=True)


class ProductAdminRead(ProductRead):
    is_active: bool


class ProductCreate(BaseModel):
    category_id: int
    name: str = Field(min_length=2, max_length=180)
    slug: str = Field(min_length=2, max_length=200)
    subcategory_name: str | None = Field(default=None, max_length=120)
    subcategory_slug: str | None = Field(default=None, max_length=140)
    short_description: str | None = None
    image_url: str | None = Field(default=None, max_length=500)
    normal_price_huf: int = Field(ge=0)
    shipping_unit_type: str = Field(default="CUSTOM", max_length=40)
    shipping_unit_value: int | None = Field(default=None, ge=0)
    shipping_class: str | None = Field(default=None, max_length=80)
    manage_stock: bool = True
    stock_quantity: int = Field(default=0, ge=0)
    stock_status: str = Field(default="in_stock", max_length=30)
    is_active: bool = True
    is_featured: bool = False
    badge_label: str | None = Field(default=None, max_length=40)

    @field_validator("name", "slug")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("subcategory_name", "subcategory_slug", "short_description", "image_url", "badge_label", "shipping_class")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized_value = value.strip()
        return normalized_value or None

    @field_validator("shipping_unit_type")
    @classmethod
    def validate_shipping_unit_type(cls, value: str) -> str:
        normalized_value = normalize_shipping_unit_type(value)
        return normalized_value or "CUSTOM"

    @field_validator("stock_status")
    @classmethod
    def validate_stock_status(cls, value: str) -> str:
        normalized_value = normalize_stock_status(value)
        return normalized_value or "in_stock"


class ProductUpdate(BaseModel):
    category_id: int | None = None
    name: str | None = Field(default=None, min_length=2, max_length=180)
    slug: str | None = Field(default=None, min_length=2, max_length=200)
    subcategory_name: str | None = Field(default=None, max_length=120)
    subcategory_slug: str | None = Field(default=None, max_length=140)
    short_description: str | None = None
    image_url: str | None = Field(default=None, max_length=500)
    normal_price_huf: int | None = Field(default=None, ge=0)
    shipping_unit_type: str | None = Field(default=None, max_length=40)
    shipping_unit_value: int | None = Field(default=None, ge=0)
    shipping_class: str | None = Field(default=None, max_length=80)
    manage_stock: bool | None = None
    stock_quantity: int | None = Field(default=None, ge=0)
    stock_status: str | None = Field(default=None, max_length=30)
    is_active: bool | None = None
    is_featured: bool | None = None
    badge_label: str | None = Field(default=None, max_length=40)

    @field_validator("name", "slug")
    @classmethod
    def normalize_optional_required_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip()

    @field_validator("subcategory_name", "subcategory_slug", "short_description", "image_url", "badge_label", "shipping_class")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized_value = value.strip()
        return normalized_value or None

    @field_validator("shipping_unit_type")
    @classmethod
    def validate_shipping_unit_type(cls, value: str | None) -> str | None:
        return normalize_shipping_unit_type(value)

    @field_validator("stock_status")
    @classmethod
    def validate_stock_status(cls, value: str | None) -> str | None:
        return normalize_stock_status(value)
