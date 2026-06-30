from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False, unique=True, index=True)
    subcategory_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    subcategory_slug: Mapped[str | None] = mapped_column(String(140), nullable=True, index=True)
    short_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    normal_price_huf: Mapped[int] = mapped_column(Integer, nullable=False)
    shipping_unit_type: Mapped[str] = mapped_column(String(40), nullable=False, default="CUSTOM")
    shipping_unit_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    shipping_class: Mapped[str | None] = mapped_column(String(80), nullable=True)
    manage_stock: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    stock_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stock_status: Mapped[str] = mapped_column(String(30), nullable=False, default="in_stock")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    badge_label: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    category = relationship("Category")
    variants = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan", order_by="ProductVariant.name")
