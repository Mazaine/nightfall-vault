from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (CheckConstraint("status IN ('pending_payment', 'processing', 'completed', 'cancelled')", name="ck_orders_status"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_number: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    customer_name: Mapped[str] = mapped_column(String(160), nullable=False)
    customer_email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    customer_phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending_payment", index=True)
    total_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    shipping_method: Mapped[str] = mapped_column(String(120), nullable=False)
    shipping_price: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pickup_point_snapshot: Mapped[Any | None] = mapped_column(JSONB, nullable=True)
    shipping_address_snapshot: Mapped[Any | None] = mapped_column(JSONB, nullable=True)
    payment_method: Mapped[str] = mapped_column(String(120), nullable=False)
    payment_status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    source: Mapped[str] = mapped_column(String(80), nullable=False, default="webshop")
    stock_released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan", order_by="OrderItem.id")


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False, index=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True, index=True)
    product_name: Mapped[str] = mapped_column(String(180), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False)
    total_price: Mapped[int] = mapped_column(Integer, nullable=False)

    order = relationship("Order", back_populates="items")
