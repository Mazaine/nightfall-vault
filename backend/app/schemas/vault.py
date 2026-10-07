from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


PrintVariant = Literal["normal", "foil", "fa", "gfa"]


class CardSnapshot(BaseModel):
    source_token: str = Field(min_length=32, max_length=64)
    external_card_id: str = Field(min_length=1, max_length=120)
    card_name: str = Field(min_length=1, max_length=180)
    image_url: str | None = Field(default=None, max_length=2000)
    edition: str | None = Field(default=None, max_length=120)
    card_type: str | None = Field(default=None, max_length=80)
    subtype: str | None = Field(default=None, max_length=120)
    color: str | None = Field(default=None, max_length=80)
    rarity: str | None = Field(default=None, max_length=80)

    @field_validator("external_card_id", "card_name")
    @classmethod
    def strip_required(cls, value: str) -> str:
        return value.strip()


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    capacity: int = Field(ge=0)
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")


class FolderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    capacity: int | None = Field(default=None, ge=0)
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")


class FolderReorder(BaseModel):
    folder_ids: list[int] = Field(min_length=1)


class CollectionCardCreate(CardSnapshot):
    folder_id: int
    quantity: int = Field(ge=1, le=3)
    print_variant: PrintVariant | None = None


class WantedCardCreate(CardSnapshot):
    folder_id: int
    print_variant: PrintVariant = "normal"


class CollectionCardUpdate(BaseModel):
    quantity: int | None = Field(default=None, ge=0, le=3)
    folder_id: int | None = None
    print_variant: PrintVariant | None = None


class WantedUpdate(BaseModel):
    wanted: bool
    quantity: int | None = Field(default=None, ge=1, le=3)


class TradeCardCreate(CardSnapshot):
    quantity: int = Field(ge=1, le=3)
    print_variant: PrintVariant | None = None


class QuantityUpdate(BaseModel):
    quantity: int = Field(ge=1, le=3)
    print_variant: PrintVariant | None = None


class FolderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    capacity: int
    position: int
    color: str | None
    used_slots: int = 0


class CardRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    external_card_id: str
    card_name: str
    image_url: str | None
    edition: str | None
    card_type: str | None
    subtype: str | None
    color: str | None
    rarity: str | None
    quantity: int
    print_variant: PrintVariant = "normal"
    folder_id: int | None = None
    wanted: bool = False
    wanted_quantity: int = 0
    offer_count: int = 0


class PublicTradeCardRead(CardRead):
    owner_id: int
    owner_username: str


class VaultSummary(BaseModel):
    total_collection_capacity: int
    assigned_collection_capacity: int
    free_collection_capacity: int
    used_collection_slots: int
    trade_capacity: int
    used_trade_slots: int
    vp_balance: int
    vault_unlimited: bool = False
    folders: list[FolderRead]


class PointTransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    amount: int
    reason: str
    reference_type: str | None
    reference_id: str | None
    created_at: datetime


class PointHistory(BaseModel):
    balance: int
    items: list[PointTransactionRead]


class HkkSearchResult(CardSnapshot):
    pass


class HkkEditionRead(BaseModel):
    id: str
    name: str


class HkkEditionCards(BaseModel):
    edition: HkkEditionRead
    count: int
    cards: list[HkkSearchResult]


class HkkEditionImport(BaseModel):
    edition_id: str = Field(min_length=1, max_length=20, pattern=r"^[1-9][0-9]*$")
    folder_id: int
    quantity: int = Field(ge=1, le=3)
    missing_only: bool = False
    rarities: list[Literal["common", "uncommun", "rare", "ultrarare"]] | None = Field(default=None, min_length=1, max_length=4)


class HkkEditionImportResult(BaseModel):
    edition: HkkEditionRead
    total_cards: int
    added_cards: int
    updated_cards: int
    skipped_cards: int


class TradeMessageCreate(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class TradeReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=1000)


class TradeReviewRead(BaseModel):
    id: int
    trade_id: int
    reviewer_id: int
    reviewed_user_id: int
    rating: int
    comment: str | None
    created_at: datetime


class CardLoanCreate(BaseModel):
    quantity: int = Field(ge=1, le=3)
    borrower_name: str = Field(min_length=1, max_length=180)
    lent_at: date
    due_at: date | None = None
    note: str | None = Field(default=None, max_length=1000)

    @field_validator("borrower_name")
    @classmethod
    def strip_borrower_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("A kölcsönvevő neve kötelező.")
        return value


class CardLoanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    collection_card_id: int | None
    external_card_id: str
    card_name: str
    print_variant: PrintVariant
    quantity: int
    borrower_name: str
    borrower_user_id: int | None
    lent_at: date
    due_at: date | None
    note: str | None
    status: Literal["active", "returned", "cancelled"]
    returned_at: datetime | None
    created_at: datetime


class TradeMessageRead(BaseModel):
    id: int
    sender_id: int
    sender_username: str
    sender_display_name: str
    message: str
    created_at: datetime


class TradeRead(BaseModel):
    id: int
    requester_id: int
    requester_username: str
    requester_display_name: str
    owner_id: int
    owner_username: str
    owner_display_name: str
    status: str
    reviewed_by_current_user: bool = False
    requester_confirmed_at: datetime | None
    owner_confirmed_at: datetime | None
    completed_at: datetime | None
    card: CardRead
    messages: list[TradeMessageRead] = Field(default_factory=list)
