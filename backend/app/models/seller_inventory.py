"""Import provenance only: Auction remains the single authoritative stock."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class SellerStockSource(Base):
    __tablename__ = "seller_stock_sources"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_seller_stock_source_name"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    mapping: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SellerStockLink(Base):
    __tablename__ = "seller_stock_links"
    listing_id: Mapped[int] = mapped_column(ForeignKey("auctions.id"), primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("seller_stock_sources.id"), index=True)
    identity: Mapped[str] = mapped_column(String(64), index=True)
    last_row: Mapped[dict] = mapped_column(JSON)


class SellerStockOperation(Base):
    __tablename__ = "seller_stock_operations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    source_id: Mapped[int | None] = mapped_column(ForeignKey("seller_stock_sources.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="preview")
    fingerprint: Mapped[str] = mapped_column(String(64), index=True)
    context: Mapped[dict] = mapped_column(JSON, default=dict)
    rows: Mapped[list] = mapped_column(JSON, default=list)
    changes: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SellerHkkCatalogCard(Base):
    __tablename__ = "seller_hkk_catalog_cards"
    card_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
