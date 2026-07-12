from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


AUCTION_STATUSES = ("draft", "scheduled", "active", "ended", "sold", "unsold", "cancelled", "suspended")
AUCTION_CONDITIONS = ("fresh", "like_new", "played", "damaged", "worn", "misprint")
ALLOWED_AUCTION_IMAGE_TYPES = ("image/jpeg", "image/png", "image/webp", "image/gif")


class Auction(Base):
    __tablename__ = "auctions"
    __table_args__ = (
        CheckConstraint(f"status IN {AUCTION_STATUSES}", name="ck_auctions_status"),
        CheckConstraint(f"condition IN {AUCTION_CONDITIONS}", name="ck_auctions_condition"),
        CheckConstraint("starting_price > 0", name="ck_auctions_starting_price_positive"),
        CheckConstraint("bid_increment > 0", name="ck_auctions_bid_increment_positive"),
        CheckConstraint("(buy_now_enabled = false AND buy_now_price IS NULL) OR (buy_now_enabled = true AND buy_now_price > starting_price)", name="ck_auctions_buy_now_price"),
        CheckConstraint("ends_at > starts_at", name="ck_auctions_time_window"),
        CheckConstraint("winner_id IS NULL OR winner_id <> seller_id", name="ck_auctions_winner_not_seller"),
        CheckConstraint("(status = 'sold' AND winner_id IS NOT NULL) OR status <> 'sold'", name="ck_auctions_sold_has_winner"),
        CheckConstraint("(status = 'unsold' AND winner_id IS NULL) OR status <> 'unsold'", name="ck_auctions_unsold_has_no_winner"),
        Index("ix_auctions_status_ends_at", "status", "ends_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    seller_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    condition: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft", index=True)
    starting_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    bid_increment: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    current_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    buy_now_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    buy_now_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    five_minute_rule_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    winner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    highest_bid_id: Mapped[int | None] = mapped_column(ForeignKey("bids.id", ondelete="SET NULL"), nullable=True, index=True)
    seller_declaration_accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    seller_declaration_version: Mapped[str] = mapped_column(String(20), nullable=False, default="2026-07-11")
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    moderated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    moderated_by_admin_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    moderation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    moderation_previous_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    seller = relationship("User", foreign_keys=[seller_id])
    winner = relationship("User", foreign_keys=[winner_id])
    moderated_by_admin = relationship("User", foreign_keys=[moderated_by_admin_id])
    highest_bid = relationship("Bid", foreign_keys=[highest_bid_id], post_update=True)
    bids = relationship("Bid", back_populates="auction", cascade="all, delete-orphan", foreign_keys="Bid.auction_id", order_by="Bid.created_at")
    images = relationship("AuctionImage", back_populates="auction", cascade="all, delete-orphan", order_by="AuctionImage.position")
    messages = relationship("AuctionMessage", back_populates="auction", cascade="all, delete-orphan", order_by="AuctionMessage.created_at")
    reviews = relationship("AuctionReview", back_populates="auction", cascade="all, delete-orphan")
    watchlist_entries = relationship("WatchlistItem", back_populates="auction", cascade="all, delete-orphan")


class AuctionImage(Base):
    __tablename__ = "auction_images"
    __table_args__ = (
        CheckConstraint("file_size > 0", name="ck_auction_images_file_size_positive"),
        CheckConstraint(f"content_type IN {ALLOWED_AUCTION_IMAGE_TYPES}", name="ck_auction_images_content_type"),
        CheckConstraint("position >= 0", name="ck_auction_images_position"),
        UniqueConstraint("auction_id", "position", name="uq_auction_images_position"),
        Index("uq_auction_images_one_cover", "auction_id", unique=True, postgresql_where=text("is_cover")),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    auction_id: Mapped[int] = mapped_column(ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False, index=True)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(80), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    thumbnail_storage_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    list_storage_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    detail_storage_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_cover: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    auction = relationship("Auction", back_populates="images")


class Bid(Base):
    __tablename__ = "bids"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_bids_amount_positive"),
        Index("ix_bids_auction_amount", "auction_id", "amount"),
        Index("ix_bids_auction_created", "auction_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    auction_id: Mapped[int] = mapped_column(ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False, index=True)
    bidder_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    auction = relationship("Auction", back_populates="bids", foreign_keys=[auction_id])
    bidder = relationship("User")


class AuctionMessage(Base):
    __tablename__ = "auction_messages"
    __table_args__ = (
        CheckConstraint("length(trim(message)) > 0", name="ck_auction_messages_not_empty"),
        CheckConstraint("length(message) <= 2000", name="ck_auction_messages_max_length"),
        Index("ix_auction_messages_auction_created", "auction_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    auction_id: Mapped[int] = mapped_column(ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    auction = relationship("Auction", back_populates="messages")
    sender = relationship("User")


class AuctionReview(Base):
    __tablename__ = "auction_reviews"
    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_auction_reviews_rating"),
        CheckConstraint("reviewer_id <> reviewed_user_id", name="ck_auction_reviews_no_self_review"),
        CheckConstraint("comment IS NULL OR length(comment) <= 1000", name="ck_auction_reviews_comment_length"),
        UniqueConstraint("auction_id", "reviewer_id", "reviewed_user_id", name="uq_auction_reviews_once_per_pair"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    auction_id: Mapped[int] = mapped_column(ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    reviewed_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    auction = relationship("Auction", back_populates="reviews")
    reviewer = relationship("User", foreign_keys=[reviewer_id])
    reviewed_user = relationship("User", foreign_keys=[reviewed_user_id])


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"
    __table_args__ = (
        UniqueConstraint("user_id", "auction_id", name="uq_watchlist_user_auction"),
        Index("ix_watchlist_user_created", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    auction_id: Mapped[int] = mapped_column(ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user = relationship("User")
    auction = relationship("Auction", back_populates="watchlist_entries")
