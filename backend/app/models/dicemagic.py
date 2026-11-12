"""Partner snapshots and durable order outbox. No credentials are stored here."""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class DiceMagicState(Base):
    __tablename__ = "dicemagic_state"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sync_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    orders_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(String(200))
    summary: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)


class DiceMagicProduct(Base):
    __tablename__ = "dicemagic_products"
    __table_args__ = (UniqueConstraint("shop_id", "outer_id", name="uq_dicemagic_shop_outer"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    shop_id: Mapped[str] = mapped_column(String(30), default="dicemagic", nullable=False)
    outer_id: Mapped[str] = mapped_column(String(255), nullable=False)
    auction_id: Mapped[int] = mapped_column(ForeignKey("auctions.id"), unique=True, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    stock: Mapped[int | None] = mapped_column(Integer)
    stock_blocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    stock_ceiling: Mapped[int | None] = mapped_column(Integer)
    snapshot_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class DiceMagicOrder(Base):
    __tablename__ = "dicemagic_orders"
    __table_args__ = (UniqueConstraint("buyer_id", "idempotency_key", name="uq_dicemagic_buyer_key"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(80), nullable=False)
    external_order_id: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="prepared")
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    cart_item_ids: Mapped[list] = mapped_column(JSON, nullable=False)
    response: Mapped[dict | None] = mapped_column(JSON)
    error: Mapped[str | None] = mapped_column(String(100))
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    transaction_id: Mapped[int | None] = mapped_column(ForeignKey("auction_transactions.id"), unique=True)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class DiceMagicSyncLog(Base):
    __tablename__ = "dicemagic_sync_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    summary: Mapped[dict] = mapped_column(JSON, nullable=False)


class DiceMagicOrderHold(Base):
    __tablename__ = "dicemagic_order_holds"
    __table_args__ = (UniqueConstraint("order_id", "product_id", name="uq_dicemagic_order_product_hold"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("dicemagic_orders.id"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("dicemagic_products.id"), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    baseline_stock: Mapped[int | None] = mapped_column(Integer)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    evidence: Mapped[dict | None] = mapped_column(JSON)


class DiceMagicCheckoutAttempt(Base):
    """Durable orchestration only; purchases remain AuctionTransactions."""
    __tablename__ = "dicemagic_checkout_attempts"
    __table_args__ = (UniqueConstraint("buyer_id", "idempotency_key", name="uq_dicemagic_checkout_attempt"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(80), nullable=False)
    private_item_ids: Mapped[list] = mapped_column(JSON, nullable=False)
    private_result: Mapped[dict | None] = mapped_column(JSON)
    private_error: Mapped[str | None] = mapped_column(String(300))
    shop_order_id: Mapped[int | None] = mapped_column(ForeignKey("dicemagic_orders.id"))
    shop_item_ids: Mapped[list] = mapped_column(JSON, nullable=False)
    shop_snapshots: Mapped[list] = mapped_column(JSON, nullable=False)
    private_snapshots: Mapped[list] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
