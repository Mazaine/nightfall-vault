from datetime import datetime

from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


TRANSACTION_STATUSES = ("transaction_open", "completed", "reviewed", "archived", "cancelled")


class AuctionTransaction(Base):
    __tablename__ = "auction_transactions"
    __table_args__ = (
        UniqueConstraint("auction_id", name="uq_auction_transactions_auction"),
        CheckConstraint(f"status IN {TRANSACTION_STATUSES}", name="ck_auction_transactions_status"),
        CheckConstraint("seller_id <> buyer_id", name="ck_auction_transactions_distinct_participants"),
        Index("ix_auction_transactions_participants", "seller_id", "buyer_id"),
        Index("ix_auction_transactions_status_updated", "status", "updated_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    auction_id: Mapped[int] = mapped_column(ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    checkout_batch_id: Mapped[int | None] = mapped_column(ForeignKey("checkout_batches.id", ondelete="SET NULL"), nullable=True, index=True)
    seller_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="transaction_open", index=True)
    seller_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    buyer_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    seller_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    buyer_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    seller_hidden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    buyer_hidden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    auction = relationship("Auction")
    seller = relationship("User", foreign_keys=[seller_id])
    buyer = relationship("User", foreign_keys=[buyer_id])
    checkout_batch = relationship("CheckoutBatch", back_populates="transactions")
    items = relationship("AuctionTransactionItem", back_populates="transaction", cascade="all, delete-orphan", order_by="AuctionTransactionItem.id")


class AuctionTransactionItem(Base):
    __tablename__ = "auction_transaction_items"
    __table_args__ = (
        CheckConstraint("quantity BETWEEN 1 AND 9", name="ck_auction_transaction_items_quantity"),
        CheckConstraint("unit_price > 0", name="ck_auction_transaction_items_unit_price"),
        UniqueConstraint("transaction_id", "auction_id", name="uq_auction_transaction_items_transaction_auction"),
        Index("ix_auction_transaction_items_auction", "auction_id"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("auction_transactions.id", ondelete="CASCADE"), nullable=False, index=True)
    auction_id: Mapped[int] = mapped_column(ForeignKey("auctions.id", ondelete="RESTRICT"), nullable=False)
    source_auction_id: Mapped[int] = mapped_column(ForeignKey("auctions.id", ondelete="RESTRICT"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    title_snapshot: Mapped[str] = mapped_column(String(180), nullable=False)
    inventory_deducted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    transaction = relationship("AuctionTransaction", back_populates="items")
    auction = relationship("Auction", foreign_keys=[auction_id])
    source_auction = relationship("Auction", foreign_keys=[source_auction_id])
