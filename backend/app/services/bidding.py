import logging
from datetime import timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.models.auction import Auction, AuctionBidExclusion, Bid
from app.models.transaction import AuctionTransaction
from app.models.user import User
from app.services.auction_lifecycle import FIVE_MINUTE_EXTENSION, can_view_auction, effective_auction_end, normalize_money, now_utc, sync_auction_status
from app.services.notifications import notify_auction_closed
from app.services.notification_dispatcher import dispatch_notification
from app.services.realtime import publish_auction_event
from app.services.security_audit import create_domain_audit_log
from app.services.demo_visibility import require_demo_auction_access

logger = logging.getLogger(__name__)
ACTIVE_BID_STATUS = "active"
WITHDRAWN_BID_STATUS = "withdrawn"


def format_bid_amount(amount: Decimal) -> str:
    return f"{amount:,.0f}".replace(",", " ") + " Ft"


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
        "status": bid.status,
    }


def auction_realtime_snapshot(db: Session, auction: Auction) -> dict:
    history = list(db.scalars(select(Bid).where(Bid.auction_id == auction.id).order_by(Bid.amount.desc(), Bid.created_at.asc(), Bid.id.asc())).all())
    active_count = sum(1 for bid in history if bid.status == ACTIVE_BID_STATUS)
    transaction_status = db.scalar(select(AuctionTransaction.status).where(AuctionTransaction.auction_id == auction.id))
    is_listed = auction.status in {"scheduled", "active", "ended"} or (auction.status == "sold" and transaction_status == "transaction_open")
    return {
        "auction_id": auction.id,
        "is_demo": auction.is_demo,
        "status": auction.status,
        "current_price": str(auction.current_price),
        "highest_bid_id": auction.highest_bid_id,
        "bid_count": active_count,
        "winner_id": auction.winner_id,
        "ends_at": auction.ends_at.isoformat(),
        "is_listed": is_listed,
        "bids": [bid_to_history_item(bid, auction) for bid in history],
    }


def bid_to_history_item(bid: Bid, auction: Auction) -> dict:
    return {
        "id": bid.id,
        "amount": bid.amount,
        "created_at": bid.created_at,
        "bidder_label": bidder_label(bid),
        "is_highest": auction.highest_bid_id == bid.id,
        "status": bid.status,
        "withdrawn_at": bid.withdrawn_at,
        "can_withdraw": False,
        "withdrawable_until": None,
        "withdrawal_block_reason": None,
        "is_top_active_bid": auction.highest_bid_id == bid.id and bid.status == ACTIVE_BID_STATUS,
    }


def _aware(value):
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=timezone.utc)


def bid_withdrawal_state(bid: Bid, auction: Auction, user: User | None, *, current_time=None) -> dict:
    current_time = current_time or now_utc()
    withdrawable_until = _aware(bid.created_at) + timedelta(seconds=settings.bid_withdrawal_window_seconds)
    is_top = bid.status == ACTIVE_BID_STATUS and auction.highest_bid_id == bid.id
    reason = None
    if user is None or bid.bidder_id != user.id:
        reason = "Csak a saját licited vonható vissza."
    elif bid.status != ACTIVE_BID_STATUS:
        reason = "Ez a licit már visszavonásra került."
    elif not is_top:
        reason = "Csak az aukció legutolsó aktív licitje vonható vissza."
    elif auction.status != "active":
        reason = "Az aukció állapota már nem teszi lehetővé a licit visszavonását."
    elif current_time > withdrawable_until:
        reason = "A licit visszavonására rendelkezésre álló 1 perc lejárt."
    elif _aware(auction.ends_at) - current_time < timedelta(seconds=settings.bid_withdrawal_min_remaining_seconds):
        reason = "Az aukció utolsó 5 percében a licit már nem vonható vissza."
    elif user.bid_withdrawal_permanently_disabled or (
        user.bid_withdrawal_disabled_until is not None and _aware(user.bid_withdrawal_disabled_until) > current_time
    ):
        reason = "A licit-visszavonási lehetőséged jelenleg korlátozva van."
    return {
        "can_withdraw": reason is None,
        "withdrawable_until": withdrawable_until,
        "withdrawal_block_reason": reason,
        "is_top_active_bid": is_top,
    }


def bid_history_item_for_user(bid: Bid, auction: Auction, user: User | None) -> dict:
    item = bid_to_history_item(bid, auction)
    item.update(bid_withdrawal_state(bid, auction, user))
    return item


def list_bid_history(db: Session, auction: Auction, user: User | None) -> list[Bid]:
    sync_auction_status(db, auction)
    if not can_view_auction(auction, user):
        raise HTTPException(status_code=404, detail="Az aukció nem található.")
    statement = select(Bid).where(Bid.auction_id == auction.id).order_by(Bid.amount.desc(), Bid.created_at.asc(), Bid.id.asc())
    return list(db.scalars(statement).all())


def _top_active_bid_statement(auction_id: int):
    return (
        select(Bid)
        .where(Bid.auction_id == auction_id, Bid.status == ACTIVE_BID_STATUS)
        .order_by(Bid.amount.desc(), Bid.created_at.asc(), Bid.id.asc())
    )


def withdraw_bid(
    db: Session,
    *,
    bid_id: int,
    bidder: User,
    reason_code: str,
    reason_text: str | None,
    audit_context: dict | None = None,
) -> dict:
    auction_id = db.scalar(select(Bid.auction_id).where(Bid.id == bid_id))
    if auction_id is None:
        raise HTTPException(status_code=404, detail="A licit nem található.")
    auction = db.scalar(
        select(Auction).where(Auction.id == auction_id, Auction.deleted_at.is_(None)).with_for_update()
    )
    if auction is None:
        raise HTTPException(status_code=404, detail="Az aukció nem található.")
    target = db.scalar(
        select(Bid)
        .where(Bid.id == bid_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if target is None:
        raise HTTPException(status_code=404, detail="A licit nem található.")

    current_time = now_utc()
    if target.bidder_id != bidder.id:
        raise HTTPException(status_code=403, detail="Csak a saját licited vonható vissza.")
    if target.status != ACTIVE_BID_STATUS:
        raise HTTPException(status_code=409, detail="Ez a licit már visszavonásra került.")
    if auction.status != "active":
        raise HTTPException(status_code=409, detail="Az aukció állapota már nem teszi lehetővé a licit visszavonását.")
    if db.scalar(select(AuctionTransaction.id).where(AuctionTransaction.auction_id == auction.id).limit(1)) is not None:
        raise HTTPException(status_code=409, detail="A létrejött tranzakció miatt a licit már nem vonható vissza.")
    if bidder.bid_withdrawal_permanently_disabled or (
        bidder.bid_withdrawal_disabled_until is not None and _aware(bidder.bid_withdrawal_disabled_until) > current_time
    ):
        raise HTTPException(status_code=403, detail="A licit-visszavonási lehetőséged jelenleg korlátozva van.")

    active_bids = list(db.scalars(_top_active_bid_statement(auction.id).with_for_update()).all())
    top_bid = active_bids[0] if active_bids else None
    if top_bid is None or top_bid.id != target.id:
        raise HTTPException(status_code=409, detail="Csak az aukció legutolsó aktív licitje vonható vissza.")
    if current_time > _aware(target.created_at) + timedelta(seconds=settings.bid_withdrawal_window_seconds):
        raise HTTPException(status_code=422, detail="A licit visszavonására rendelkezésre álló 1 perc lejárt.")
    if _aware(auction.ends_at) - current_time < timedelta(seconds=settings.bid_withdrawal_min_remaining_seconds):
        raise HTTPException(status_code=422, detail="Az aukció utolsó 5 percében a licit már nem vonható vissza.")

    old_state = {"current_price": str(auction.current_price), "highest_bid_id": auction.highest_bid_id}
    target.status = WITHDRAWN_BID_STATUS
    target.withdrawn_at = current_time
    target.withdrawal_reason_code = reason_code
    target.withdrawal_reason_text = reason_text
    target.withdrawn_by_user_id = bidder.id
    exclusion = db.scalar(select(AuctionBidExclusion).where(
        AuctionBidExclusion.auction_id == auction.id,
        AuctionBidExclusion.user_id == bidder.id,
    ))
    if exclusion is None:
        db.add(AuctionBidExclusion(
            auction_id=auction.id,
            user_id=bidder.id,
            source_bid_id=target.id,
            reason="user_exit",
        ))

    remaining = active_bids[1:]
    next_top = remaining[0] if remaining else None
    auction.highest_bid_id = next_top.id if next_top else None
    auction.current_price = normalize_money(next_top.amount if next_top else auction.starting_price)
    auction.winner_id = None
    bidder.bid_withdrawal_count += 1
    bidder.last_bid_withdrawal_at = current_time
    warning_due = (
        bidder.bid_withdrawal_count >= settings.bid_withdrawal_warning_threshold
        and bidder.bid_withdrawal_first_warning_sent_at is None
    )
    create_domain_audit_log(
        db, action="auction_bidder_excluded_after_exit", user_id=bidder.id, auction_id=auction.id,
        metadata={"bid_id": target.id, "reason": "user_exit"},
    )
    if warning_due:
        bidder.bid_withdrawal_warning_level = settings.bid_withdrawal_warning_threshold
        bidder.bid_withdrawal_first_warning_sent_at = current_time

    create_domain_audit_log(
        db, action="auction_bid_withdrawn", user_id=bidder.id, auction_id=auction.id,
        metadata={
            "bid_id": target.id, "amount": str(target.amount), "reason_code": reason_code,
            "reason_text": reason_text, "old_state": old_state,
            "new_state": {"current_price": str(auction.current_price), "highest_bid_id": auction.highest_bid_id},
            **(audit_context or {}),
        },
    )
    if warning_due:
        create_domain_audit_log(
            db, action="bid_withdrawal_warning_threshold_reached", user_id=bidder.id,
            metadata={"withdrawal_count": bidder.bid_withdrawal_count, "threshold": settings.bid_withdrawal_warning_threshold},
        )
    db.add_all([target, auction, bidder])
    db.commit()
    db.refresh(target)
    db.refresh(auction)
    db.refresh(bidder)

    try:
        dispatch_notification(
            db, user_id=bidder.id, auction_id=auction.id, notification_type="bid_withdrawn_bidder",
            title="Licit visszavonva", message=f"A(z) {format_bid_amount(target.amount)} összegű licitedet visszavontuk.",
            event_key=f"bid-withdrawn:bidder:{target.id}",
        )
        if auction.seller_id != bidder.id:
            dispatch_notification(
                db, user_id=auction.seller_id, auction_id=auction.id, notification_type="bid_withdrawn_seller",
                title="Licit visszavonva", message=f"Egy licit visszavonásra került ennél az aukciónál: {auction.title}",
                event_key=f"bid-withdrawn:seller:{target.id}",
            )
        if next_top is not None and next_top.bidder_id != bidder.id:
            dispatch_notification(
                db, user_id=next_top.bidder_id, auction_id=auction.id, notification_type="bid_leader_changed_after_withdrawal",
                title="Ismét te vezetsz", message=f"Egy licit visszavonása után ismét te vezetsz: {auction.title}",
                event_key=f"bid-withdrawn:leader:{target.id}:{next_top.bidder_id}",
            )
        if warning_due:
            dispatch_notification(
                db, user_id=bidder.id, notification_type="bid_withdrawal_warning",
                title="Figyelmeztetés a licit-visszavonásokról",
                message="A licit visszavonása kivételes lehetőség. A rendszer már több visszavonást rögzített a fiókodnál. A visszaélésszerű használat moderációs következménnyel járhat.",
                event_key=f"bid-withdrawal-warning:{bidder.id}:{settings.bid_withdrawal_warning_threshold}",
            )
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Bid withdrawal notification delivery failed: bid_id=%s", target.id)

    snapshot = auction_realtime_snapshot(db, auction)
    publish_auction_event(auction.id, "auction_update", snapshot)
    next_item = bid_history_item_for_user(next_top, auction, bidder) if next_top is not None and next_top.bidder_id == bidder.id else None
    return {
        "bid_id": target.id,
        "status": target.status,
        "auction_id": auction.id,
        "auction_status": auction.status,
        "highest_bid_id": auction.highest_bid_id,
        "current_price": auction.current_price,
        "next_minimum_bid": normalize_money(auction.current_price + auction.bid_increment),
        "leading_bidder_label": bidder_label(next_top) if next_top else None,
        "next_withdrawable_bid": next_item,
    }


def _sync_locked_auction_for_bidding(db: Session, auction: Auction) -> Auction:
    current_time = now_utc()
    original_status = auction.status
    if auction.status == "scheduled" and auction.starts_at <= current_time:
        auction.status = "active"
    if auction.status == "active" and effective_auction_end(auction) <= current_time:
        highest_bid = db.scalar(_top_active_bid_statement(auction.id).limit(1))
        if highest_bid is not None:
            auction.winner_id = highest_bid.bidder_id
            auction.status = "sold"
        else:
            auction.winner_id = None
            auction.status = "unsold"
        auction.finalized_at = current_time
    if auction.status != original_status and auction.status in {"sold", "unsold"}:
        notify_auction_closed(db, auction)
        create_domain_audit_log(db, action="auction_status_changed", auction_id=auction.id, metadata={"from": original_status, "to": auction.status, "source": "bid_sync"})
    return auction


def place_bid(db: Session, auction_id: int, bidder: User, amount: Decimal) -> tuple[Bid, Auction]:
    from app.services.moderation_actions import require_no_restriction

    require_no_restriction(db, bidder.id, "bidding_ban")
    normalized_amount = normalize_money(amount)
    locked_statement = (
        select(Auction)
        .where(Auction.id == auction_id, Auction.deleted_at.is_(None))
        .options(selectinload(Auction.highest_bid))
        .with_for_update()
    )
    auction = db.scalar(locked_statement)
    if auction is None:
        raise HTTPException(status_code=404, detail="Az aukció nem található.")

    require_demo_auction_access(auction, bidder)
    auction = _sync_locked_auction_for_bidding(db, auction)
    if auction.status != "active":
        db.add(auction)
        db.commit()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Licit csak aktív aukcióra adható le.")
    if auction.seller_id == bidder.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="A saját aukciódra nem licitálhatsz.")
    if db.scalar(select(AuctionBidExclusion.id).where(
        AuctionBidExclusion.auction_id == auction.id,
        AuctionBidExclusion.user_id == bidder.id,
    )) is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Kiszálltál ebből az aukcióból, ezért itt többé nem licitálhatsz.")
    if normalized_amount <= 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A licit összegének pozitívnak kell lennie.")

    previous_highest_bid_id = auction.highest_bid_id
    previous_highest_bidder_id = auction.highest_bid.bidder_id if auction.highest_bid is not None else None
    if previous_highest_bidder_id is None and previous_highest_bid_id is not None:
        previous_highest = db.get(Bid, previous_highest_bid_id)
        previous_highest_bidder_id = previous_highest.bidder_id if previous_highest is not None else None
    if previous_highest_bidder_id == bidder.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Már te vezeted ezt az aukciót. Újabb licitet csak akkor adhatsz, ha egy másik felhasználó túllicitált.",
        )

    current_price = normalize_money(auction.current_price)
    minimum_bid = normalize_money(current_price + auction.bid_increment)
    if normalized_amount < minimum_bid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"A licit összege legalább {format_bid_amount(minimum_bid)} legyen.",
        )
    buy_now_price = normalize_money(auction.buy_now_price) if auction.buy_now_enabled and auction.buy_now_price is not None else None
    if buy_now_price is not None and normalized_amount > buy_now_price:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Villámáras vásárlásnál pontosan {format_bid_amount(buy_now_price)} összeget adj meg.",
        )
    if normalized_amount != buy_now_price and (normalized_amount - minimum_bid) % auction.bid_increment != 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"A licit {format_bid_amount(minimum_bid)} összegtől {format_bid_amount(auction.bid_increment)} licitlépcsőkkel emelhető.",
        )

    bid_time = now_utc()
    bid = Bid(auction_id=auction.id, bidder_id=bidder.id, amount=normalized_amount)
    db.add(bid)
    db.flush()

    auction.current_price = normalized_amount
    auction.highest_bid_id = bid.id
    extended_until = None
    if (
        auction.five_minute_rule_enabled
        and auction.ends_at > bid_time
        and auction.ends_at <= bid_time + FIVE_MINUTE_EXTENSION
        and not reaches_buy_now(auction, normalized_amount)
    ):
        auction.ends_at = bid_time + FIVE_MINUTE_EXTENSION
        extended_until = auction.ends_at.isoformat()
    if reaches_buy_now(auction, normalized_amount):
        auction.status = "sold"
        auction.winner_id = bidder.id
        auction.finalized_at = now_utc()
        notify_auction_closed(db, auction)
        create_domain_audit_log(db, action="auction_buy_now", user_id=bidder.id, auction_id=auction.id, metadata={"amount": str(normalized_amount)})
    if previous_highest_bidder_id is not None and previous_highest_bidder_id != bidder.id:
        dispatch_notification(
            db,
            user_id=previous_highest_bidder_id,
            auction_id=auction.id,
            notification_type="outbid",
            title="Túllicitáltak",
            message=f"Valaki magasabb licitet tett erre az aukcióra: {auction.title}",
            event_key=f"outbid:{auction.id}:{bid.id}:{previous_highest_bidder_id}",
        )
    create_domain_audit_log(db, action="auction_bid", user_id=bidder.id, auction_id=auction.id, metadata={"amount": str(normalized_amount), "extended_until": extended_until})
    db.add(auction)
    db.commit()
    db.refresh(bid)
    db.refresh(auction)
    publish_auction_event(auction.id, "auction_update", auction_realtime_snapshot(db, auction))
    return bid, auction
