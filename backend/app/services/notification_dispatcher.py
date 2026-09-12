from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.notification import Notification, NotificationOutbox, NotificationPreference, WebPushSubscription
from app.models.user import User
from app.models.auction import Auction
from app.services.demo_visibility import can_access_demo_auctions
from app.services.notification_targets import validate_notification_target_url

TYPE_CATEGORY = {
    "outbid": "bids", "auction_bid_received": "bids",
    "bid_withdrawn_bidder": "bids", "bid_withdrawn_seller": "bids", "bid_leader_changed_after_withdrawal": "bids", "bid_withdrawal_warning": "moderation",
    "auction_won": "transactions", "auction_lost": "transactions", "auction_sold": "transactions", "auction_unsold": "transactions",
    "auction_message": "chat",
    "seller_new_auction": "follows",
    "transaction_opened": "transactions", "transaction_confirmation": "transactions", "transaction_completed": "transactions",
    "review_received": "reviews",
    "report_resolved": "moderation", "report_dismissed": "moderation", "auction_moderation_action": "moderation",
    "moderation_action": "moderation", "moderation_strike": "moderation", "moderation_revoked": "moderation",
    "saved_search_match": "system", "watchlist_reminder": "system",
}


@dataclass(frozen=True)
class DeliveryPreference:
    in_app: bool = True
    browser: bool = False
    email: bool = False
    push: bool = False


def preference_for(db: Session, user_id: int, category: str) -> DeliveryPreference:
    row = db.scalar(select(NotificationPreference).where(NotificationPreference.user_id == user_id, NotificationPreference.category == category))
    if row is None:
        return DeliveryPreference()
    return DeliveryPreference(in_app=row.in_app, browser=row.browser, email=row.email, push=row.push)


def dispatch_notification(
    db: Session,
    *,
    user_id: int,
    notification_type: str,
    title: str,
    message: str,
    auction_id: int | None = None,
    target_url: str | None = None,
    event_key: str | None = None,
    send_email: bool = True,
) -> Notification | None:
    category = TYPE_CATEGORY.get(notification_type, "system")
    preference = preference_for(db, user_id, category)
    user = db.get(User, user_id)
    auction = db.get(Auction, auction_id) if auction_id is not None else None
    if auction is not None and auction.demo_batch_id is not None and not can_access_demo_auctions(user):
        return None
    resolved_target = validate_notification_target_url(target_url or (f"/auctions/{auction_id}" if auction_id else "/account/notifications"))
    if event_key:
        existing = db.scalar(select(Notification).where(Notification.event_key == event_key))
        if existing is not None:
            return existing

    push_configured = bool(
        settings.web_push_enabled
        and settings.vapid_public_key
        and settings.vapid_private_key
        and settings.vapid_subject
    )
    push_subscriptions = []
    if user is not None and preference.push and push_configured:
        push_subscriptions = list(db.scalars(
            select(WebPushSubscription).where(
                WebPushSubscription.user_id == user_id,
                WebPushSubscription.revoked_at.is_(None),
            ).order_by(WebPushSubscription.id.asc())
        ).all())

    notification = Notification(
        user_id=user_id, auction_id=auction_id, type=notification_type, category=category,
        title=title, message=message, target_url=resolved_target,
        event_key=event_key, in_app_enabled=preference.in_app, browser_enabled=preference.browser,
        email_enabled=preference.email and send_email, push_enabled=bool(push_subscriptions),
    )
    try:
        with db.begin_nested():
            db.add(notification)
            db.flush()
            delivery_event_key = event_key or f"notification:{notification.id}"
            db.add(NotificationOutbox(
                notification_id=notification.id,
                event_key=delivery_event_key,
                task_type="realtime",
            ))
            if user is not None and notification.email_enabled:
                db.add(NotificationOutbox(
                    notification_id=notification.id,
                    event_key=delivery_event_key,
                    task_type="email",
                ))
            for subscription in push_subscriptions:
                db.add(NotificationOutbox(
                    notification_id=notification.id,
                    web_push_subscription_id=subscription.id,
                    event_key=f"{delivery_event_key}:push:{subscription.id}",
                    task_type="push",
                ))
            db.flush()
    except IntegrityError:
        if not event_key:
            raise
        existing = db.scalar(select(Notification).where(Notification.event_key == event_key))
        if existing is None:
            raise
        return existing
    return notification
