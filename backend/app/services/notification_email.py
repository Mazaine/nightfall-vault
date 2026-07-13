import logging

from app.core.config import settings
from app.models.notification import Notification
from app.models.user import User
from app.services.email_service import send_email

logger = logging.getLogger(__name__)


def should_email(user: User, notification_type: str) -> bool:
    if notification_type == "saved_search_match":
        return False
    if not settings.notification_email_enabled:
        return False
    if notification_type == "outbid":
        return user.notify_email_outbid
    if notification_type in {"auction_won", "auction_lost", "auction_sold", "auction_unsold", "auction_moderation_action"}:
        return user.notify_email_auction_result
    if notification_type in {"report_resolved", "report_dismissed", "seller_new_auction"}:
        return user.notify_in_app and settings.notification_email_enabled
    return True


def send_notification_email(user: User, notification: Notification) -> bool:
    if not should_email(user, notification.type):
        return False
    auction_url = f"{settings.frontend_base_url.rstrip('/')}/auctions/{notification.auction_id}" if notification.auction_id else settings.frontend_base_url
    html = (
        "<h1>Nightfall Vault ertesites</h1>"
        f"<p>{notification.title}</p>"
        f"<p>{notification.message}</p>"
        f"<p><a href=\"{auction_url}\">Aukcio megnyitasa</a></p>"
    )
    try:
        return send_email(user.email, notification.title, html)
    except Exception:
        logger.exception("Notification email failed for user_id=%s type=%s", user.id, notification.type)
        return False
