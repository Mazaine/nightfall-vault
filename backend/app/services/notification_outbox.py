import asyncio
import contextlib
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.notification import Notification, NotificationOutbox, WebPushSubscription
from app.models.user import User
from app.services.notification_email import send_notification_email, should_email
from app.services.realtime import publish_user_event
from app.services.web_push_delivery import WebPushDeliveryError, build_web_push_payload, send_web_push

logger = logging.getLogger(__name__)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class DeliveryError(Exception):
    def __init__(self, code: str, *, transient: bool) -> None:
        super().__init__(code)
        self.code = code
        self.transient = transient


def notification_payload(notification: Notification) -> dict:
    return {
        "id": notification.id,
        "auction_id": notification.auction_id,
        "type": notification.type,
        "category": notification.category,
        "title": notification.title,
        "message": notification.message,
        "target_url": notification.target_url,
        "is_read": notification.is_read,
        "in_app_enabled": notification.in_app_enabled,
        "browser_enabled": notification.browser_enabled,
        "email_enabled": notification.email_enabled,
        "push_enabled": notification.push_enabled,
        "created_at": notification.created_at.isoformat() if notification.created_at else None,
    }


def claim_next_outbox_item(db: Session) -> int | None:
    current_time = now_utc()
    stale_before = current_time - timedelta(seconds=settings.notification_outbox_lock_timeout_seconds)
    item = db.scalar(
        select(NotificationOutbox)
        .where(
            or_(
                NotificationOutbox.status.in_(("pending", "retry")),
                (NotificationOutbox.status == "processing") & (NotificationOutbox.locked_at <= stale_before),
            ),
            NotificationOutbox.next_attempt_at <= current_time,
        )
        .order_by(NotificationOutbox.next_attempt_at.asc(), NotificationOutbox.id.asc())
        .with_for_update(skip_locked=True)
        .limit(1)
    )
    if item is None:
        db.rollback()
        return None
    item.status = "processing"
    item.attempts += 1
    item.locked_at = current_time
    item.last_error = None
    db.add(item)
    db.commit()
    return item.id


def deliver_outbox_item(db: Session, item_id: int) -> None:
    item = db.get(NotificationOutbox, item_id)
    if item is None or item.status != "processing":
        return
    notification = db.get(Notification, item.notification_id)
    if notification is None:
        raise DeliveryError("notification_missing", transient=False)
    if item.task_type == "realtime":
        if publish_user_event(notification.user_id, "notification", notification_payload(notification)) is None:
            raise DeliveryError("realtime_unavailable", transient=True)
        return
    if item.task_type == "email":
        user = db.get(User, notification.user_id)
        if user is None:
            raise DeliveryError("recipient_missing", transient=False)
        if not notification.email_enabled or not should_email(user, notification.type):
            return
        if not settings.email_delivery_enabled:
            raise DeliveryError("email_delivery_disabled", transient=False)
        if not send_notification_email(user, notification):
            raise DeliveryError("email_delivery_failed", transient=True)
        return
    if item.task_type == "push":
        if not settings.web_push_enabled or not notification.push_enabled:
            return
        subscription = db.get(WebPushSubscription, item.web_push_subscription_id)
        if (
            subscription is None
            or subscription.revoked_at is not None
            or subscription.user_id != notification.user_id
        ):
            return
        try:
            payload = build_web_push_payload(notification)
            send_web_push(subscription, payload)
        except WebPushDeliveryError as exc:
            if exc.expired:
                subscription.revoked_at = now_utc()
                subscription.updated_at = subscription.revoked_at
                db.add(subscription)
                return
            raise DeliveryError(exc.code, transient=exc.transient) from exc
        subscription.last_success_at = now_utc()
        subscription.updated_at = subscription.last_success_at
        db.add(subscription)
        return
    raise DeliveryError("unsupported_task_type", transient=False)


def _retry_delay(attempts: int) -> int:
    exponent = max(0, attempts - 1)
    return min(
        settings.notification_outbox_max_backoff_seconds,
        settings.notification_outbox_base_backoff_seconds * (2 ** exponent),
    )


def mark_outbox_success(db: Session, item_id: int) -> None:
    item = db.get(NotificationOutbox, item_id)
    if item is None:
        return
    item.status = "delivered"
    item.processed_at = now_utc()
    item.locked_at = None
    item.last_error = None
    db.add(item)
    db.commit()


def mark_outbox_failure(db: Session, item_id: int, error: DeliveryError) -> None:
    item = db.get(NotificationOutbox, item_id)
    if item is None:
        return
    current_time = now_utc()
    exhausted = item.attempts >= settings.notification_outbox_max_attempts
    if error.transient and not exhausted:
        item.status = "retry"
        item.next_attempt_at = current_time + timedelta(seconds=_retry_delay(item.attempts))
    else:
        item.status = "failed"
        item.processed_at = current_time
    item.locked_at = None
    item.last_error = error.code[:120]
    db.add(item)
    db.commit()


def process_outbox_item(item_id: int) -> bool:
    db = SessionLocal()
    try:
        try:
            deliver_outbox_item(db, item_id)
        except DeliveryError as exc:
            db.rollback()
            mark_outbox_failure(db, item_id, exc)
            logger.warning("Notification outbox delivery failed item_id=%s task_type_error=%s", item_id, exc.code)
            return False
        except Exception:
            db.rollback()
            mark_outbox_failure(db, item_id, DeliveryError("unexpected_delivery_error", transient=True))
            logger.exception("Notification outbox delivery raised an unexpected error item_id=%s", item_id)
            return False
        mark_outbox_success(db, item_id)
        return True
    finally:
        db.close()


def process_outbox_batch(limit: int | None = None) -> int:
    batch_limit = limit or settings.notification_outbox_batch_size
    processed = 0
    for _ in range(batch_limit):
        claim_db = SessionLocal()
        try:
            item_id = claim_next_outbox_item(claim_db)
        finally:
            claim_db.close()
        if item_id is None:
            break
        process_outbox_item(item_id)
        processed += 1
    return processed


async def notification_outbox_loop(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        if not settings.notification_outbox_enabled:
            with contextlib.suppress(asyncio.TimeoutError):
                await asyncio.wait_for(stop_event.wait(), timeout=settings.notification_outbox_poll_seconds)
            continue
        try:
            processed = process_outbox_batch()
        except Exception:
            logger.exception("Notification outbox worker iteration failed.")
            processed = 0
        if processed:
            await asyncio.sleep(0)
            continue
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(stop_event.wait(), timeout=settings.notification_outbox_poll_seconds)
