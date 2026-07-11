from datetime import timedelta
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.auction import Auction, Bid
from app.models.user import User
from app.services.auction_lifecycle import can_view_auction, normalize_money, now_utc, sync_auction_status


FIVE_MINUTE_EXTENSION_WINDOW = timedelta(minutes=5)


def bidder_label(bid: Bid) -> str:
    return f"Licitáló #{bid.bidder_id}"


def reaches_buy_now(auction: Auction, amount: Decimal) -> bool:
    return bool(auction.buy_now_enabled and auction.buy_now_price is not None and amount >= auction.buy_now_price)


def bid_to_read(bid: Bid, auction: Auction) -> dict:
    return {
        "id": bid.id,
        "auction_id": bid.auction_id,
        "amount": bid.amount,
        "created_at": bid.created_at,
        "bidder_label": bidder_label(bid),
        "is_highest": auction.highest_bid_id == bid.id,
        "reaches_buy_now": reaches_buy_now(auction, bid.amount),
    }


def bid_to_history_item(bid: Bid, auction: Auction) -> dict:
    return {
        "id": bid.id,
        "amount": bid.amount,
        "created_at": bid.created_at,
        "bidder_label": bidder_label(bid),
        "is_highest": auction.highest_bid_id == bid.id,
    }


def list_bid_history(db: Session, auction: Auction, user: User | None) -> list[Bid]:
    sync_auction_status(db, auction)
    if not can_view_auction(auction, user):
        raise HTTPException(status_code=404, detail="Auction not found")
    statement = select(Bid).where(Bid.auction_id == auction.id).order_by(Bid.amount.desc(), Bid.created_at.asc(), Bid.id.asc())
    return list(db.scalars(statement).all())


def _sync_locked_auction_for_bidding(db: Session, auction: Auction) -> Auction:
    current_time = now_utc()
    if auction.status == "scheduled" and auction.starts_at <= current_time:
        auction.status = "active"
    if auction.status == "active" and auction.ends_at <= current_time:
        highest_bid = db.get(Bid, auction.highest_bid_id) if auction.highest_bid_id is not None else None
        if highest_bid is not None:
            auction.winner_id = highest_bid.bidder_id
            auction.status = "sold"
        else:
            auction.winner_id = None
            auction.status = "unsold"
        auction.finalized_at = current_time
    return auction


def place_bid(db: Session, auction_id: int, bidder: User, amount: Decimal) -> tuple[Bid, Auction]:
    normalized_amount = normalize_money(amount)
    locked_statement = (
        select(Auction)
        .where(Auction.id == auction_id)
        .options(selectinload(Auction.highest_bid))
        .with_for_update()
    )
    auction = db.scalar(locked_statement)
    if auction is None:
        raise HTTPException(status_code=404, detail="Auction not found")

    auction = _sync_locked_auction_for_bidding(db, auction)
    if auction.status != "active":
        db.add(auction)
        db.commit()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bids can only be placed on active auctions.")
    if auction.seller_id == bidder.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Seller cannot bid on own auction.")
    if normalized_amount <= 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Bid amount must be positive.")

    current_price = normalize_money(auction.current_price)
    minimum_bid = normalize_money(current_price + auction.bid_increment)
    if normalized_amount < minimum_bid:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Bid must be at least {minimum_bid}.")

    bid = Bid(auction_id=auction.id, bidder_id=bidder.id, amount=normalized_amount)
    db.add(bid)
    db.flush()

    auction.current_price = normalized_amount
    auction.highest_bid_id = bid.id
    if auction.five_minute_rule_enabled and auction.ends_at - now_utc() <= FIVE_MINUTE_EXTENSION_WINDOW:
        auction.ends_at = now_utc() + FIVE_MINUTE_EXTENSION_WINDOW
    db.add(auction)
    db.commit()
    db.refresh(bid)
    db.refresh(auction)
    return bid, auction
