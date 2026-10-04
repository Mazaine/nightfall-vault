from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class VaultAccount(Base):
    __tablename__ = "vault_accounts"
    __table_args__ = (
        CheckConstraint("base_collection_capacity >= 0", name="ck_vault_accounts_collection_capacity"),
        CheckConstraint("trade_capacity >= 0", name="ck_vault_accounts_trade_capacity"),
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    base_collection_capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=500, server_default="500")
    trade_capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=200, server_default="200")
    vault_unlimited: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user = relationship("User")


class VaultFolder(Base):
    __tablename__ = "vault_folders"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_vault_folders_user_name"),
        CheckConstraint("capacity >= 0", name="ck_vault_folders_capacity"),
        CheckConstraint("position >= 0", name="ck_vault_folders_position"),
        Index("ix_vault_folders_user_position", "user_id", "position"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user = relationship("User")
    cards = relationship("VaultCollectionCard", back_populates="folder", cascade="all, delete-orphan")


class VaultCollectionCard(Base):
    __tablename__ = "vault_collection_cards"
    __table_args__ = (
        UniqueConstraint("user_id", "external_card_id", name="uq_vault_collection_cards_user_card"),
        CheckConstraint("quantity BETWEEN 1 AND 3", name="ck_vault_collection_cards_quantity"),
        CheckConstraint("wanted_quantity BETWEEN 0 AND 2", name="ck_vault_collection_cards_wanted_quantity"),
        Index("ix_vault_collection_cards_folder_name", "folder_id", "card_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    folder_id: Mapped[int] = mapped_column(ForeignKey("vault_folders.id", ondelete="RESTRICT"), nullable=False, index=True)
    external_card_id: Mapped[str] = mapped_column(String(120), nullable=False)
    card_name: Mapped[str] = mapped_column(String(180), nullable=False)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    edition: Mapped[str | None] = mapped_column(String(120), nullable=True)
    card_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    subtype: Mapped[str | None] = mapped_column(String(120), nullable=True)
    color: Mapped[str | None] = mapped_column(String(80), nullable=True)
    rarity: Mapped[str | None] = mapped_column(String(80), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    wanted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    wanted_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    folder = relationship("VaultFolder", back_populates="cards")


class VaultTradeCard(Base):
    __tablename__ = "vault_trade_cards"
    __table_args__ = (
        UniqueConstraint("user_id", "external_card_id", name="uq_vault_trade_cards_user_card"),
        CheckConstraint("quantity BETWEEN 1 AND 3", name="ck_vault_trade_cards_quantity"),
        Index("ix_vault_trade_cards_external_name", "external_card_id", "card_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    external_card_id: Mapped[str] = mapped_column(String(120), nullable=False)
    card_name: Mapped[str] = mapped_column(String(180), nullable=False)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    edition: Mapped[str | None] = mapped_column(String(120), nullable=True)
    card_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    subtype: Mapped[str | None] = mapped_column(String(120), nullable=True)
    color: Mapped[str | None] = mapped_column(String(80), nullable=True)
    rarity: Mapped[str | None] = mapped_column(String(80), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user = relationship("User")


class VaultPointTransaction(Base):
    __tablename__ = "vault_point_transactions"
    __table_args__ = (
        UniqueConstraint("user_id", "event_key", name="uq_vault_point_transactions_user_event"),
        CheckConstraint("amount <> 0", name="ck_vault_point_transactions_amount"),
        Index("ix_vault_point_transactions_user_created", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(50), nullable=False)
    reference_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    reference_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    event_key: Mapped[str] = mapped_column(String(180), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class VaultCapacityGrant(Base):
    __tablename__ = "vault_capacity_grants"
    __table_args__ = (
        UniqueConstraint("user_id", "source_type", "reference_id", name="uq_vault_capacity_grants_source"),
        CheckConstraint("slots > 0", name="ck_vault_capacity_grants_slots"),
        Index("ix_vault_capacity_grants_user_created", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    slots: Mapped[int] = mapped_column(Integer, nullable=False)
    source_type: Mapped[str] = mapped_column(String(40), nullable=False)
    reference_id: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class VaultTrade(Base):
    __tablename__ = "vault_trades"
    __table_args__ = (
        UniqueConstraint("requester_id", "offered_card_id", name="uq_vault_trades_requester_offer"),
        CheckConstraint("requester_id <> owner_id", name="ck_vault_trades_distinct_users"),
        CheckConstraint("status IN ('open', 'completed', 'cancelled')", name="ck_vault_trades_status"),
        Index("ix_vault_trades_participants", "requester_id", "owner_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    offered_card_id: Mapped[int] = mapped_column(ForeignKey("vault_trade_cards.id", ondelete="RESTRICT"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open", server_default="open")
    requester_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    owner_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    requester = relationship("User", foreign_keys=[requester_id])
    owner = relationship("User", foreign_keys=[owner_id])
    offered_card = relationship("VaultTradeCard")
    messages = relationship("VaultTradeMessage", back_populates="trade", cascade="all, delete-orphan")
    reviews = relationship("VaultTradeReview", back_populates="trade", cascade="all, delete-orphan")


class VaultTradeMessage(Base):
    __tablename__ = "vault_trade_messages"
    __table_args__ = (
        CheckConstraint("length(trim(message)) > 0", name="ck_vault_trade_messages_not_empty"),
        CheckConstraint("length(message) <= 2000", name="ck_vault_trade_messages_max_length"),
        Index("ix_vault_trade_messages_trade_created", "trade_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    trade_id: Mapped[int] = mapped_column(ForeignKey("vault_trades.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    trade = relationship("VaultTrade", back_populates="messages")
    sender = relationship("User")


class VaultTradeReview(Base):
    __tablename__ = "vault_trade_reviews"
    __table_args__ = (
        UniqueConstraint("trade_id", "reviewer_id", name="uq_vault_trade_reviews_trade_reviewer"),
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_vault_trade_reviews_rating"),
        CheckConstraint("reviewer_id <> reviewed_user_id", name="ck_vault_trade_reviews_distinct_users"),
        CheckConstraint("comment IS NULL OR length(comment) <= 1000", name="ck_vault_trade_reviews_comment_length"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    trade_id: Mapped[int] = mapped_column(ForeignKey("vault_trades.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewed_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    trade = relationship("VaultTrade", back_populates="reviews")
    reviewer = relationship("User", foreign_keys=[reviewer_id])
    reviewed_user = relationship("User", foreign_keys=[reviewed_user_id])
