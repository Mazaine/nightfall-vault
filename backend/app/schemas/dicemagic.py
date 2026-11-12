from typing import Literal
from pydantic import BaseModel, EmailStr, Field, model_validator


class Address(BaseModel):
    postal_code: str = Field(pattern=r"^\d{4}$")
    city: str = Field(min_length=1, max_length=100)
    street_address: str = Field(min_length=1, max_length=200)
    country: Literal["HU"] = "HU"


class Buyer(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=40)


class Delivery(BaseModel):
    method: Literal["pickup", "shipping"]
    recipient_name: str = Field(min_length=2, max_length=160)
    address: Address | None = None


class Billing(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    address: Address
    company: str | None = Field(default=None, max_length=160)
    tax_number: str | None = Field(default=None, max_length=40)


class ShopCheckout(BaseModel):
    buyer: Buyer
    delivery: Delivery
    billing: Billing | None = None
    note: str = Field(default="", max_length=900)
    test_order: bool = False
    confirm_real_order: bool = False
    consent_data_transfer: bool = False

    @model_validator(mode="after")
    def validate_checkout(self):
        if self.delivery.method == "shipping" and self.delivery.address is None:
            raise ValueError("Szállításhoz cím szükséges.")
        if self.delivery.address is None and self.billing is None:
            raise ValueError("Személyes átvételnél számlázási cím szükséges.")
        if not self.confirm_real_order or not self.consent_data_transfer:
            raise ValueError("A valódi rendelést és az adattovábbítást jóvá kell hagyni.")
        return self
