from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.notification import Notification, NotificationPreference
from app.models.user import User
from app.services.notification_email import send_notification_email
from app.services.realtime import publish_user_event

TYPE_CATEGORY = {
    "outbid": "bids",
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


def preference_for(db: Session, user_id: int, category: str) -> DeliveryPreference:
    row = db.scalar(select(NotificationPreference).where(NotificationPreference.user_id == user_id, NotificationPreference.category == category))
    if row is None:
        return DeliveryPreference()
    return DeliveryPreference(in_app=row.in_app, browser=row.browser, email=row.email)


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
) -> Notification:
    category = TYPE_CATEGORY.get(notification_type, "system")
    preference = preference_for(db, user_id, category)
    if event_key:
        existing = db.scalar(select(Notification).where(Notification.event_key == event_key))
        if existing is not None:
            return existing
    notification = Notification(
        user_id=user_id, auction_id=auction_id, type=notification_type, category=category,
        title=title, message=message, target_url=target_url or (f"/auctions/{auction_id}" if auction_id else "/account/notifications"),
        event_key=event_key, in_app_enabled=preference.in_app, browser_enabled=preference.browser,
        email_enabled=preference.email and send_email,
    )
    db.add(notification)
    db.flush()
    payload = {
        "id": notification.id, "auction_id": auction_id, "type": notification_type, "category": category,
        "title": title, "message": message, "target_url": notification.target_url,
        "is_read": False, "in_app_enabled": notification.in_app_enabled,
        "browser_enabled": notification.browser_enabled, "email_enabled": notification.email_enabled,
        "created_at": notification.created_at.isoformat() if notification.created_at else None,
    }
    publish_user_event(user_id, "notification", payload)
    user = db.get(User, user_id)
    if user is not None and notification.email_enabled:
        send_notification_email(user, notification)
    return notification
