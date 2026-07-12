from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.auction import Auction, WatchlistItem
from app.models.user import User
from app.services.auction_lifecycle import get_auction_statement, require_can_view_auction


def list_watchlist(db: Session, user: User) -> list[WatchlistItem]:
    statement = (
        select(WatchlistItem)
        .where(WatchlistItem.user_id == user.id)
        .join(WatchlistItem.auction)
        .where(Auction.deleted_at.is_(None))
        .order_by(WatchlistItem.created_at.desc(), WatchlistItem.id.desc())
    )
    return list(db.scalars(statement).all())


def add_to_watchlist(db: Session, auction_id: int, user: User) -> WatchlistItem:
    auction = db.scalar(get_auction_statement().where(Auction.id == auction_id, Auction.deleted_at.is_(None)))
    if auction is None:
        raise HTTPException(status_code=404, detail="Auction not found")
    require_can_view_auction(auction, user)
    existing = db.scalar(select(WatchlistItem).where(WatchlistItem.user_id == user.id, WatchlistItem.auction_id == auction.id))
    if existing is not None:
        return existing
    item = WatchlistItem(user_id=user.id, auction_id=auction.id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def remove_from_watchlist(db: Session, auction_id: int, user: User) -> None:
    item = db.scalar(select(WatchlistItem).where(WatchlistItem.user_id == user.id, WatchlistItem.auction_id == auction_id))
    if item is None:
        raise HTTPException(status_code=404, detail="Watchlist item not found")
    db.delete(item)
    db.commit()
