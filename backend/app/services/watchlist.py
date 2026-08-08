from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.auction import Auction, WatchlistItem
from app.models.notification import WatchlistReminder
from app.models.user import User
from app.services.auction_lifecycle import get_auction_statement, require_can_view_auction
from app.services.membership import featured_auction_order, is_vip
from app.services.demo_visibility import auction_visibility_clause


def list_watchlist(db: Session, user: User) -> list[WatchlistItem]:
    statement = (
        select(WatchlistItem)
        .where(WatchlistItem.user_id == user.id)
        .join(WatchlistItem.auction)
        .where(Auction.deleted_at.is_(None))
        .where(auction_visibility_clause(user))
        .order_by(featured_auction_order(), WatchlistItem.created_at.desc(), WatchlistItem.id.desc())
    )
    return list(db.scalars(statement).all())


def add_to_watchlist(db: Session, auction_id: int, user: User) -> WatchlistItem:
    auction = db.scalar(get_auction_statement().where(Auction.id == auction_id, Auction.deleted_at.is_(None)))
    if auction is None:
        raise HTTPException(status_code=404, detail="Az aukció nem található.")
    require_can_view_auction(auction, user)
    existing = db.scalar(select(WatchlistItem).where(WatchlistItem.user_id == user.id, WatchlistItem.auction_id == auction.id))
    if existing is not None:
        return existing
    item = WatchlistItem(user_id=user.id, auction_id=auction.id)
    db.add(item)
    db.flush()
    if is_vip(user):
        for minutes_before, enabled in (
            (1440, user.vip_reminder_one_day),
            (60, user.vip_reminder_one_hour),
            (5, user.vip_reminder_five_minutes),
        ):
            if enabled:
                db.add(WatchlistReminder(user_id=user.id, auction_id=auction.id, minutes_before=minutes_before))
    db.commit()
    db.refresh(item)
    return item


def remove_from_watchlist(db: Session, auction_id: int, user: User) -> None:
    auction = db.get(Auction, auction_id)
    if auction is None:
        raise HTTPException(status_code=404, detail="Az aukció nem található.")
    require_can_view_auction(auction, user)
    item = db.scalar(select(WatchlistItem).where(WatchlistItem.user_id == user.id, WatchlistItem.auction_id == auction_id))
    if item is None:
        raise HTTPException(status_code=404, detail="A figyelőlista-elem nem található.")
    db.execute(delete(WatchlistReminder).where(WatchlistReminder.user_id == user.id, WatchlistReminder.auction_id == auction_id))
    db.delete(item)
    db.commit()
