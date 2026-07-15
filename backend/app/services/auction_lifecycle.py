from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.auction import Auction, AuctionImage, AuctionMessage, AuctionReview, Bid
from app.models.user import User
from app.schemas.auction import AuctionCreate, AuctionUpdate
from app.services.notifications import create_notification, notify_auction_closed
from app.services.security_audit import create_domain_audit_log
from app.services.user_blocks import ensure_not_blocked

SELLER_DECLARATION_VERSION = "2026-07-11"
PUBLIC_AUCTION_STATUSES = {"scheduled", "active", "ended", "sold", "unsold"}
EDITABLE_OWNER_STATUSES = {"draft", "scheduled", "active"}
CRITICAL_AUCTION_FIELDS = {"starting_price", "bid_increment", "buy_now_price", "starts_at"}

ALLOWED_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"scheduled", "active", "cancelled"},
    "scheduled": {"active", "cancelled", "suspended"},
    "active": {"ended", "cancelled", "suspended"},
    "ended": {"sold", "unsold", "suspended"},
    "sold": set(),
    "unsold": set(),
    "cancelled": set(),
    "suspended": {"draft", "scheduled", "active"},
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Datetime must include timezone information.")
    return value.astimezone(timezone.utc)


def normalize_money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


def ensure_transition_allowed(current_status: str, next_status: str) -> None:
    if next_status not in ALLOWED_STATUS_TRANSITIONS.get(current_status, set()):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Invalid auction status transition: {current_status} -> {next_status}")


def sync_auction_status(db: Session, auction: Auction) -> Auction:
    current_time = now_utc()
    original_status = auction.status
    if auction.status == "scheduled" and auction.starts_at <= current_time:
        auction.status = "active"
    if auction.status == "active" and auction.ends_at <= current_time:
        highest_bid = auction.highest_bid
        if highest_bid is None and auction.highest_bid_id is not None:
            highest_bid = db.get(Bid, auction.highest_bid_id)
        if highest_bid is not None:
            auction.winner_id = highest_bid.bidder_id
            auction.status = "sold"
        else:
            auction.winner_id = None
            auction.status = "unsold"
        auction.finalized_at = current_time
    if auction.status != original_status:
        db.add(auction)
        create_domain_audit_log(db, action="auction_status_changed", auction_id=auction.id, metadata={"from": original_status, "to": auction.status})
        if auction.status in {"sold", "unsold"}:
            notify_auction_closed(db, auction)
        db.commit()
        db.refresh(auction)
    return auction


def close_ended_active_auction(db: Session, auction: Auction) -> Auction:
    if auction.status != "active" or auction.ends_at > now_utc():
        return auction
    highest_bid = auction.highest_bid
    if highest_bid is None and auction.highest_bid_id is not None:
        highest_bid = db.get(Bid, auction.highest_bid_id)
    if highest_bid is not None:
        auction.winner_id = highest_bid.bidder_id
        auction.status = "sold"
    else:
        auction.winner_id = None
        auction.status = "unsold"
    auction.finalized_at = now_utc()
    db.add(auction)
    create_domain_audit_log(db, action="auction_status_changed", auction_id=auction.id, metadata={"from": "active", "to": auction.status, "source": "scheduler"})
    notify_auction_closed(db, auction)
    return auction


def get_auction_statement():
    return select(Auction).options(
        selectinload(Auction.seller),
        selectinload(Auction.winner),
        selectinload(Auction.highest_bid),
        selectinload(Auction.bids),
        selectinload(Auction.images),
        selectinload(Auction.messages).selectinload(AuctionMessage.sender),
        selectinload(Auction.reviews).selectinload(AuctionReview.reviewer),
        selectinload(Auction.reviews).selectinload(AuctionReview.reviewed_user),
    )


def get_auction_or_404(db: Session, auction_id: int) -> Auction:
    auction = db.scalar(get_auction_statement().where(Auction.id == auction_id, Auction.deleted_at.is_(None)))
    if auction is None:
        raise HTTPException(status_code=404, detail="Auction not found")
    return sync_auction_status(db, auction)


def can_view_auction(auction: Auction, user: User | None) -> bool:
    if auction.status in PUBLIC_AUCTION_STATUSES:
        return True
    if user is None:
        return False
    return auction.seller_id == user.id or user.role == "admin"


def require_can_view_auction(auction: Auction, user: User | None) -> None:
    if not can_view_auction(auction, user):
        raise HTTPException(status_code=404, detail="Auction not found")


def require_owner_or_admin(auction: Auction, user: User) -> None:
    if auction.seller_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Auction ownership required")


def create_auction(db: Session, auction_create: AuctionCreate, seller: User) -> Auction:
    from app.services.moderation_actions import require_no_restriction

    require_no_restriction(db, seller.id, "auction_creation_ban")
    if seller.deleted_at is not None or not seller.is_active:
        raise HTTPException(status_code=403, detail="Ez a felhasználói fiók inaktív.")
    auction = Auction(
        seller_id=seller.id,
        title=auction_create.title,
        description=auction_create.description,
        category=auction_create.category,
        condition=auction_create.condition,
        status="draft",
        starting_price=normalize_money(auction_create.starting_price),
        bid_increment=normalize_money(auction_create.bid_increment),
        current_price=normalize_money(auction_create.starting_price),
        buy_now_enabled=auction_create.buy_now_enabled,
        buy_now_price=normalize_money(auction_create.buy_now_price) if auction_create.buy_now_price is not None else None,
        starts_at=normalize_datetime(auction_create.starts_at),
        ends_at=normalize_datetime(auction_create.ends_at),
        five_minute_rule_enabled=auction_create.five_minute_rule_enabled,
        seller_declaration_accepted_at=now_utc(),
        seller_declaration_version=auction_create.seller_declaration_version or SELLER_DECLARATION_VERSION,
    )
    db.add(auction)
    db.commit()
    db.refresh(auction)
    create_domain_audit_log(db, action="auction_created", user_id=seller.id, auction_id=auction.id, metadata={"title": auction.title})
    db.commit()
    return auction


def _validate_update_time_window(auction: Auction, update: AuctionUpdate) -> None:
    starts_at = normalize_datetime(update.starts_at) if update.starts_at is not None else auction.starts_at
    ends_at = normalize_datetime(update.ends_at) if update.ends_at is not None else auction.ends_at
    if ends_at <= starts_at:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A lejárati időnek későbbinek kell lennie a kezdési időnél.")


def _validate_update_buy_now(auction: Auction, update: AuctionUpdate) -> None:
    buy_now_enabled = auction.buy_now_enabled if update.buy_now_enabled is None else update.buy_now_enabled
    starting_price = auction.starting_price if update.starting_price is None else normalize_money(update.starting_price)
    buy_now_price = auction.buy_now_price if update.buy_now_price is None else normalize_money(update.buy_now_price)
    if not buy_now_enabled and update.buy_now_price is not None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Kikapcsolt villámárnál nem adható meg villámárösszeg.")
    if buy_now_enabled:
        if buy_now_price is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Bekapcsolt villámárnál kötelező megadni a villámár összegét.")
        if buy_now_price <= starting_price:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A villámárnak magasabbnak kell lennie a kezdőárnál.")


def update_auction(db: Session, auction: Auction, auction_update: AuctionUpdate, user: User) -> Auction:
    sync_auction_status(db, auction)
    require_owner_or_admin(auction, user)
    if auction.status not in EDITABLE_OWNER_STATUSES and user.role != "admin":
        raise HTTPException(status_code=409, detail="Ebben az aukcióállapotban az aukció nem módosítható.")
    update_data = auction_update.model_dump(exclude_unset=True)
    if user.role != "admin" and auction.status != "draft" and any(field in update_data for field in CRITICAL_AUCTION_FIELDS):
        raise HTTPException(status_code=409, detail="A kezdőár, a licitlépcső, a villámár és a kezdési idő piszkozat után nem módosítható.")
    _validate_update_time_window(auction, auction_update)
    _validate_update_buy_now(auction, auction_update)
    for field_name, value in update_data.items():
        if field_name in {"starts_at", "ends_at"} and value is not None:
            value = normalize_datetime(value)
        if field_name in {"starting_price", "bid_increment", "buy_now_price"} and value is not None:
            value = normalize_money(value)
        setattr(auction, field_name, value)
    if auction.buy_now_enabled is False:
        auction.buy_now_price = None
    db.add(auction)
    db.commit()
    db.refresh(auction)
    return auction


def validate_activation_requirements(auction: Auction) -> None:
    if auction.status != "draft":
        raise HTTPException(status_code=409, detail="Only draft auctions can be activated.")
    if not auction.title.strip() or not auction.description.strip() or not auction.category.strip():
        raise HTTPException(status_code=422, detail="Auction content is incomplete.")
    if auction.ends_at <= auction.starts_at:
        raise HTTPException(status_code=422, detail="Auction time window is invalid.")
    if auction.starting_price <= 0 or auction.bid_increment <= 0:
        raise HTTPException(status_code=422, detail="Auction prices are invalid.")
    if auction.buy_now_enabled and (auction.buy_now_price is None or auction.buy_now_price <= auction.starting_price):
        raise HTTPException(status_code=422, detail="Buy now price is invalid.")
    if not auction.buy_now_enabled and auction.buy_now_price is not None:
        raise HTTPException(status_code=422, detail="Buy now price must be empty when buy now is disabled.")
    if auction.seller_declaration_accepted_at is None:
        raise HTTPException(status_code=422, detail="Seller declaration is required.")
    if not 1 <= len(auction.images) <= 5:
        raise HTTPException(status_code=422, detail="Auction activation requires 1 to 5 images.")
    cover_count = sum(1 for image in auction.images if image.is_cover)
    if cover_count != 1:
        raise HTTPException(status_code=422, detail="Auction activation requires exactly one cover image.")


def activate_auction(db: Session, auction: Auction, user: User) -> Auction:
    require_owner_or_admin(auction, user)
    validate_activation_requirements(auction)
    next_status = "scheduled" if auction.starts_at > now_utc() else "active"
    ensure_transition_allowed(auction.status, next_status)
    auction.status = next_status
    db.add(auction)
    create_domain_audit_log(db, action="auction_activated", user_id=user.id, auction_id=auction.id, metadata={"status": next_status})
    db.commit()
    db.refresh(auction)
    return auction


def cancel_auction(db: Session, auction: Auction, user: User) -> Auction:
    require_owner_or_admin(auction, user)
    ensure_transition_allowed(auction.status, "cancelled")
    auction.status = "cancelled"
    db.add(auction)
    create_domain_audit_log(db, action="auction_status_changed", user_id=user.id, auction_id=auction.id, metadata={"to": "cancelled"})
    db.commit()
    db.refresh(auction)
    return auction


def finalize_auction(db: Session, auction: Auction, final_status: str, winner: User | None, admin_user: User) -> Auction:
    if admin_user.role != "admin":
        raise HTTPException(status_code=403, detail="Ehhez a művelethez admin jogosultság szükséges.")
    sync_auction_status(db, auction)
    if auction.status == "active":
        ensure_transition_allowed("active", "ended")
        auction.status = "ended"
    if auction.status != "ended":
        raise HTTPException(status_code=409, detail="Only ended auctions can be finalized.")
    ensure_transition_allowed("ended", final_status)
    if final_status == "sold":
        if winner is None:
            raise HTTPException(status_code=422, detail="Sold auction requires a winner.")
        if winner.id == auction.seller_id:
            raise HTTPException(status_code=422, detail="Seller cannot be the winner.")
        auction.winner_id = winner.id
    else:
        if winner is not None:
            raise HTTPException(status_code=422, detail="Unsold auction cannot have a winner.")
        auction.winner_id = None
    auction.status = final_status
    auction.finalized_at = now_utc()
    db.add(auction)
    create_domain_audit_log(db, action="auction_status_changed", user_id=admin_user.id, auction_id=auction.id, metadata={"to": final_status, "source": "admin_finalize"})
    notify_auction_closed(db, auction)
    db.commit()
    db.refresh(auction)
    return auction


def is_successfully_closed(auction: Auction) -> bool:
    return auction.status == "sold" and auction.seller_id is not None and auction.winner_id is not None and auction.seller_id != auction.winner_id and auction.finalized_at is not None


def is_auction_participant(auction: Auction, user_id: int) -> bool:
    return user_id in {auction.seller_id, auction.winner_id}


def get_auction_counterparty(auction: Auction, user_id: int) -> int:
    if not is_successfully_closed(auction) or not is_auction_participant(auction, user_id):
        raise HTTPException(status_code=403, detail="Closed auction participant access required.")
    return auction.winner_id if user_id == auction.seller_id else auction.seller_id


def can_access_post_auction_features(auction: Auction, user_id: int) -> bool:
    return is_successfully_closed(auction) and is_auction_participant(auction, user_id)


def require_post_auction_participant(auction: Auction, user: User) -> None:
    if not can_access_post_auction_features(auction, user.id):
        raise HTTPException(status_code=403, detail="Closed auction participant access required.")


def create_message(db: Session, auction: Auction, sender: User, message: str) -> AuctionMessage:
    require_post_auction_participant(auction, sender)
    from app.services.moderation_actions import require_no_restriction
    from app.models.transaction import AuctionTransaction

    require_no_restriction(db, sender.id, "chat_ban")
    transaction = db.scalar(select(AuctionTransaction).where(AuctionTransaction.auction_id == auction.id))
    if transaction is not None and transaction.status == "archived":
        raise HTTPException(status_code=409, detail="Az archivált tranzakció chatje csak olvasható.")
    ensure_not_blocked(db, sender.id, get_auction_counterparty(auction, sender.id), "Blokkol?s miatt nem k?ldhet? ?j chat?zenet.")
    normalized_message = message.strip()
    if not normalized_message:
        raise HTTPException(status_code=422, detail="Message is required.")
    if len(normalized_message) > 2000:
        raise HTTPException(status_code=422, detail="Message is too long.")
    auction_message = AuctionMessage(auction_id=auction.id, sender_id=sender.id, message=normalized_message)
    db.add(auction_message)
    db.flush()
    counterparty_id = get_auction_counterparty(auction, sender.id)
    create_notification(
        db,
        user_id=counterparty_id,
        auction_id=auction.id,
        notification_type="auction_message",
        title="Új üzenet egy lezárt aukcióhoz",
        message=f"Új üzenet érkezett ehhez az aukcióhoz: {auction.title}",
    )
    create_domain_audit_log(
        db,
        action="auction_message_sent",
        user_id=sender.id,
        auction_id=auction.id,
        metadata={"recipient_id": counterparty_id, "message_id": auction_message.id},
    )
    db.commit()
    db.refresh(auction_message)
    return auction_message


def create_review(db: Session, auction: Auction, reviewer: User, rating: int, comment: str | None) -> AuctionReview:
    require_post_auction_participant(auction, reviewer)
    from app.services.transactions import mark_reviewed_if_complete, require_reviewable_transaction

    transaction = require_reviewable_transaction(db, auction, reviewer.id)
    reviewed_user_id = get_auction_counterparty(auction, reviewer.id)
    existing_review = db.scalar(
        select(AuctionReview).where(
            AuctionReview.auction_id == auction.id,
            AuctionReview.reviewer_id == reviewer.id,
            AuctionReview.reviewed_user_id == reviewed_user_id,
        ),
    )
    if existing_review is not None:
        raise HTTPException(status_code=409, detail="This auction participant has already been reviewed.")
    review = AuctionReview(
        auction_id=auction.id,
        reviewer_id=reviewer.id,
        reviewed_user_id=reviewed_user_id,
        rating=rating,
        comment=comment,
    )
    db.add(review)
    db.flush()
    mark_reviewed_if_complete(db, transaction)
    db.commit()
    db.refresh(review)
    return review
