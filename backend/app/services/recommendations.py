import re
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.auction import Auction
from app.models.user import User
from app.services.auction_lifecycle import PUBLIC_AUCTION_STATUSES


def public_auction_options():
    return (selectinload(Auction.seller), selectinload(Auction.images), selectinload(Auction.bids))


def _title_words(title: str) -> set[str]:
    return {word for word in re.findall(r"[\w-]+", title.casefold()) if len(word) >= 3}


def related_auctions(db: Session, source: Auction, limit: int = 12) -> list[Auction]:
    statement = (
        select(Auction)
        .options(*public_auction_options())
        .where(
            Auction.id != source.id,
            Auction.deleted_at.is_(None),
            Auction.status.in_(PUBLIC_AUCTION_STATUSES),
        )
        .order_by(Auction.created_at.desc(), Auction.id.desc())
        .limit(200)
    )
    source_words = _title_words(source.title)
    source_price = Decimal(source.current_price)

    def score(item: Auction) -> tuple[float, int]:
        points = 0.0
        if item.category == source.category:
            points += 5
        if item.seller_id == source.seller_id:
            points += 3
        item_words = _title_words(item.title)
        if source_words:
            points += 4 * len(source_words & item_words) / len(source_words)
        high_price = max(source_price, Decimal(item.current_price), Decimal("1"))
        price_distance = abs(source_price - Decimal(item.current_price)) / high_price
        points += max(0.0, 3.0 * (1.0 - float(price_distance)))
        return points, item.id

    candidates = list(db.scalars(statement).all())
    candidates.sort(key=score, reverse=True)
    return candidates[:limit]


def seller_other_auctions(db: Session, source: Auction, limit: int = 6) -> list[Auction]:
    statement = (
        select(Auction)
        .options(*public_auction_options())
        .where(
            Auction.id != source.id,
            Auction.seller_id == source.seller_id,
            Auction.deleted_at.is_(None),
            Auction.status.in_(PUBLIC_AUCTION_STATUSES),
        )
        .order_by(Auction.ends_at.asc(), Auction.created_at.desc())
        .limit(min(limit, 6))
    )
    return list(db.scalars(statement).all())
