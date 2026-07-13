from datetime import datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.auction import Auction, Bid
from app.models.notification import Notification
from app.models.user import SellerFollow, User
from app.services.notification_email import send_notification_email


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def create_notification(
    db: Session,
    *,
    user_id: int,
    notification_type: str,
    title: str,
    message: str,
    auction_id: int | None = None,
    send_email: bool = True,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        auction_id=auction_id,
        type=notification_type,
        title=title,
        message=message,
    )
    db.add(notification)
    db.flush()
    user = db.get(User, user_id)
    if user is not None and send_email:
        send_notification_email(user, notification)
    return notification


def mark_notification_read(db: Session, notification: Notification) -> Notification:
    if not notification.is_read:
        notification.is_read = True
        notification.read_at = now_utc()
        db.add(notification)
        db.commit()
        db.refresh(notification)
    return notification


def mark_all_notifications_read(db: Session, user_id: int) -> int:
    result = db.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.is_read.is_(False))
        .values(is_read=True, read_at=now_utc()),
    )
    db.commit()
    return int(result.rowcount or 0)


def count_unread_notifications(db: Session, user_id: int) -> int:
    return int(db.scalar(select(func.count()).select_from(Notification).where(Notification.user_id == user_id, Notification.is_read.is_(False))) or 0)


def notify_auction_closed(db: Session, auction: Auction) -> None:
    if auction.status == "sold" and auction.winner_id is not None:
        create_notification(
            db,
            user_id=auction.winner_id,
            auction_id=auction.id,
            notification_type="auction_won",
            title="Megnyert aukcio",
            message=f"Megnyerted ezt az aukciot: {auction.title}",
        )
        create_notification(
            db,
            user_id=auction.seller_id,
            auction_id=auction.id,
            notification_type="auction_sold",
            title="Eladott aukcio",
            message=f"Sikeresen lezart aukcio: {auction.title}",
        )
        losing_bidder_ids = {
            bidder_id
            for (bidder_id,) in db.execute(select(Bid.bidder_id).where(Bid.auction_id == auction.id, Bid.bidder_id != auction.winner_id).distinct()).all()
        }
        for bidder_id in losing_bidder_ids:
            create_notification(
                db,
                user_id=bidder_id,
                auction_id=auction.id,
                notification_type="auction_lost",
                title="Lezart aukcio",
                message=f"Nem te nyerted ezt az aukciot: {auction.title}",
            )
    elif auction.status == "unsold":
        create_notification(
            db,
            user_id=auction.seller_id,
            auction_id=auction.id,
            notification_type="auction_unsold",
            title="Eladatlan aukcio",
            message=f"Az aukcio licit nelkul zarult: {auction.title}",
        )

def notify_followers_new_auction(db: Session, auction: Auction) -> None:
    follower_ids = [
        follower_id
        for (follower_id,) in db.execute(
            select(SellerFollow.follower_id).where(SellerFollow.seller_id == auction.seller_id)
        ).all()
    ]
    for follower_id in follower_ids:
        create_notification(
            db,
            user_id=follower_id,
            auction_id=auction.id,
            notification_type="seller_new_auction",
            title="Kovetett elado uj aukcioja",
            message=f"Uj aukcio indult: {auction.title}",
        )
