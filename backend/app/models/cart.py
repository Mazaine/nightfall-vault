from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Cart(Base):
    __tablename__ = "carts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    user = relationship("User")
    items = relationship("CartItem", back_populates="cart", cascade="all, delete-orphan")


class CartItem(Base):
    __tablename__ = "cart_items"
    __table_args__ = (
        CheckConstraint("quantity BETWEEN 1 AND 9", name="ck_cart_items_quantity"),
        CheckConstraint("status IN ('active', 'removed', 'checked_out')", name="ck_cart_items_status"),
        CheckConstraint("price_snapshot > 0", name="ck_cart_items_price_snapshot"),
        UniqueConstraint("cart_id", "auction_id", name="uq_cart_items_cart_auction"),
        Index("ix_cart_items_cart_status", "cart_id", "status"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cart_id: Mapped[int] = mapped_column(ForeignKey("carts.id", ondelete="CASCADE"), nullable=False, index=True)
    auction_id: Mapped[int] = mapped_column(ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active")
    price_snapshot: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    reservation_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    cart = relationship("Cart", back_populates="items")
    auction = relationship("Auction")
    reservation = relationship("InventoryReservation", back_populates="cart_item", uselist=False, cascade="all, delete-orphan")


class InventoryReservation(Base):
    __tablename__ = "inventory_reservations"
    __table_args__ = (
        CheckConstraint("quantity BETWEEN 1 AND 9", name="ck_inventory_reservations_quantity"),
        CheckConstraint("status IN ('active', 'expired', 'released', 'consumed')", name="ck_inventory_reservations_status"),
        CheckConstraint("expires_at > starts_at", name="ck_inventory_reservations_window"),
        UniqueConstraint("cart_item_id", name="uq_inventory_reservations_cart_item"),
        Index("ix_inventory_reservations_auction_active", "auction_id", "status", "expires_at"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cart_item_id: Mapped[int] = mapped_column(ForeignKey("cart_items.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    auction_id: Mapped[int] = mapped_column(ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    cart_item = relationship("CartItem", back_populates="reservation")
    auction = relationship("Auction")
    user = relationship("User")


class CheckoutBatch(Base):
    __tablename__ = "checkout_batches"
    __table_args__ = (
        UniqueConstraint("buyer_id", "idempotency_key", name="uq_checkout_batches_buyer_key"),
        CheckConstraint("total_amount >= 0", name="ck_checkout_batches_total_amount"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(80), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    seller_count: Mapped[int] = mapped_column(Integer, nullable=False)
    item_count: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    buyer = relationship("User")
    transactions = relationship("AuctionTransaction", back_populates="checkout_batch")
