import logging

from app.core.config import settings
from app.models.notification import Notification
from app.models.user import User
from app.services.email_service import send_email

logger = logging.getLogger(__name__)


def should_email(user: User, notification_type: str) -> bool:
    # Event-specific consent is snapshotted on Notification.email_enabled by the
    # dispatcher. Account-security mail uses the dedicated auth email service and
    # never enters this optional notification pipeline.
    return settings.notification_email_enabled and user.is_active and user.deleted_at is None


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
