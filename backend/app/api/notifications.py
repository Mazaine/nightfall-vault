import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.config import settings
from app.core.rate_limit import check_rate_limit
from app.dependencies.auth import require_active_user
from app.models.notification import Notification, NotificationPreference, WebPushSubscription
from app.models.user import User
from app.models.auction import Auction
from app.schemas.auction import NotificationRead, NotificationUnreadCount
from app.schemas.user import (
    NotificationChannelPreference,
    NotificationPreferenceMatrix,
    WebPushPublicKeyRead,
    WebPushSubscriptionCreate,
    WebPushSubscriptionEndpoint,
    WebPushSubscriptionState,
    WebPushTestResult,
)
from app.services.notifications import count_unread_notifications, delete_read_notifications, mark_all_notifications_read, mark_notification_category_read, mark_notification_read
from app.services.demo_visibility import auction_visibility_clause
from app.services.notification_dispatcher import PREFERENCE_KEYS
from app.services.web_push_subscriptions import revoke_web_push_subscription, upsert_web_push_subscription
from app.services.web_push_delivery import WebPushDeliveryError, build_web_push_test_payload, send_web_push

router = APIRouter(prefix="/api/notifications", tags=["notifications"])
logger = logging.getLogger(__name__)
CATEGORIES = ("bids", "chat", "follows", "transactions", "reviews", "moderation", "system")


def require_web_push_configuration() -> None:
    if not (settings.web_push_enabled and settings.vapid_public_key and settings.vapid_private_key and settings.vapid_subject):
        raise HTTPException(status_code=503, detail="A telefonos push feliratkozás jelenleg nincs engedélyezve.")


@router.get("/push/public-key", response_model=WebPushPublicKeyRead)
def get_web_push_public_key(current_user: User = Depends(require_active_user)) -> WebPushPublicKeyRead:
    enabled = bool(settings.web_push_enabled and settings.vapid_public_key and settings.vapid_private_key and settings.vapid_subject)
    return WebPushPublicKeyRead(enabled=enabled, public_key=settings.vapid_public_key if enabled else None)


@router.post("/push/subscriptions", response_model=WebPushSubscriptionState)
def register_web_push_subscription(
    payload: WebPushSubscriptionCreate,
    request: Request,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> WebPushSubscriptionState:
    check_rate_limit(request, "web-push:subscription", settings.web_push_subscription_rate_limit_per_minute, str(current_user.id))
    require_web_push_configuration()
    subscription = upsert_web_push_subscription(db, current_user, payload, request.headers.get("user-agent"))
    return WebPushSubscriptionState(active=True, state="active", last_success_at=subscription.last_success_at)


@router.post("/push/subscriptions/status", response_model=WebPushSubscriptionState)
def get_web_push_subscription_status(
    payload: WebPushSubscriptionEndpoint,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> WebPushSubscriptionState:
    subscription = db.scalar(select(WebPushSubscription).where(
        WebPushSubscription.endpoint == payload.endpoint,
        WebPushSubscription.user_id == current_user.id,
    ))
    if subscription is None:
        return WebPushSubscriptionState(active=False, state="unsubscribed")
    if subscription.revoked_at is not None:
        return WebPushSubscriptionState(active=False, state="needs_resubscribe", last_success_at=subscription.last_success_at)
    return WebPushSubscriptionState(active=True, state="active", last_success_at=subscription.last_success_at)


@router.delete("/push/subscriptions", response_model=WebPushSubscriptionState)
def delete_web_push_subscription(
    payload: WebPushSubscriptionEndpoint,
    request: Request,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> WebPushSubscriptionState:
    check_rate_limit(request, "web-push:subscription", settings.web_push_subscription_rate_limit_per_minute, str(current_user.id))
    revoke_web_push_subscription(db, current_user, payload.endpoint)
    return WebPushSubscriptionState(active=False, state="unsubscribed")


@router.post("/push/subscriptions/test", response_model=WebPushTestResult)
def test_web_push_subscription(
    payload: WebPushSubscriptionEndpoint,
    request: Request,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> WebPushTestResult:
    check_rate_limit(request, "web-push:test", settings.web_push_subscription_rate_limit_per_minute, str(current_user.id))
    require_web_push_configuration()
    subscription = db.scalar(select(WebPushSubscription).where(
        WebPushSubscription.endpoint == payload.endpoint,
        WebPushSubscription.user_id == current_user.id,
        WebPushSubscription.revoked_at.is_(None),
    ).with_for_update())
    if subscription is None:
        raise HTTPException(status_code=404, detail="Ehhez a fiókhoz nem tartozik aktív push-feliratkozás ezen az eszközön.")
    try:
        send_web_push(subscription, build_web_push_test_payload(subscription.id))
    except WebPushDeliveryError as exc:
        if exc.expired:
            subscription.revoked_at = datetime.now(timezone.utc)
            subscription.updated_at = subscription.revoked_at
            db.add(subscription)
            db.commit()
        logger.warning(
            "Web push test failed user_id=%s subscription_id=%s error_code=%s transient=%s expired=%s",
            current_user.id, subscription.id, exc.code, exc.transient, exc.expired,
        )
        detail = "A push-feliratkozás lejárt; iratkozz fel újra ezen az eszközön." if exc.expired else "A tesztértesítés kézbesítése nem sikerült. Próbáld újra később."
        raise HTTPException(status_code=410 if exc.expired else 503 if exc.transient else 502, detail=detail) from exc
    subscription.last_success_at = datetime.now(timezone.utc)
    subscription.updated_at = subscription.last_success_at
    db.add(subscription)
    db.commit()
    logger.info("Web push test delivered user_id=%s subscription_id=%s", current_user.id, subscription.id)
    return WebPushTestResult(success=True, last_success_at=subscription.last_success_at)


@router.get("/preferences", response_model=NotificationPreferenceMatrix)
def get_preferences(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> NotificationPreferenceMatrix:
    rows = {row.category: row for row in db.scalars(select(NotificationPreference).where(NotificationPreference.user_id == current_user.id)).all()}
    return NotificationPreferenceMatrix(
        categories={key: NotificationChannelPreference.model_validate(rows[key], from_attributes=True) if key in rows else NotificationChannelPreference() for key in PREFERENCE_KEYS},
        push_defaults_eligible=not rows,
    )


@router.put("/preferences", response_model=NotificationPreferenceMatrix)
def update_preferences(payload: NotificationPreferenceMatrix, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> NotificationPreferenceMatrix:
    if set(payload.categories) != set(PREFERENCE_KEYS):
        raise HTTPException(status_code=422, detail="Minden értesítési eseményt meg kell adni.")
    rows = {row.category: row for row in db.scalars(select(NotificationPreference).where(NotificationPreference.user_id == current_user.id)).all()}
    for category, values in payload.categories.items():
        row = rows.get(category) or NotificationPreference(user_id=current_user.id, category=category)
        row.in_app, row.browser, row.email, row.push = values.in_app, values.browser, values.email, values.push
        db.add(row)
    db.commit()
    return get_preferences(current_user, db)


@router.get("", response_model=list[NotificationRead])
def list_notifications(category: str | None = Query(default=None), current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> list[NotificationRead]:
    statement = select(Notification).where(Notification.user_id == current_user.id, Notification.in_app_enabled.is_(True))
    statement = statement.outerjoin(Auction, Auction.id == Notification.auction_id).where((Notification.auction_id.is_(None)) | auction_visibility_clause(current_user))
    if category and category != "all":
        statement = statement.where(Notification.category == category)
    statement = statement.order_by(Notification.created_at.desc(), Notification.id.desc())
    return [NotificationRead.model_validate(notification).model_copy(update={"is_demo": bool(notification.auction and notification.auction.demo_batch_id is not None)}) for notification in db.scalars(statement).all()]


@router.get("/unread-count", response_model=NotificationUnreadCount)
def get_unread_notification_count(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> NotificationUnreadCount:
    return NotificationUnreadCount(unread_count=count_unread_notifications(db, current_user.id))


@router.post("/mark-all-read")
def mark_all_read(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> dict[str, int]:
    return {"updated": mark_all_notifications_read(db, current_user.id)}


@router.post("/mark-category-read")
def mark_category_read(category: str = Query(...), current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> dict[str, int]:
    if category not in CATEGORIES:
        raise HTTPException(status_code=422, detail="Ismeretlen értesítési kategória.")
    return {"updated": mark_notification_category_read(db, current_user.id, category)}


@router.delete("/read")
def delete_read_notification_history(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> dict[str, int]:
    deleted, retained = delete_read_notifications(db, current_user.id)
    return {"deleted": deleted, "retained": retained}


@router.post("/{notification_id}/read", response_model=NotificationRead)
def mark_read(notification_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> NotificationRead:
    notification = db.get(Notification, notification_id)
    if notification is None or notification.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Az értesítés nem található.")
    if notification.auction is not None and notification.auction.demo_batch_id is not None and current_user.role not in {"tester", "admin"}:
        raise HTTPException(status_code=404, detail="Az értesítés nem található.")
    updated = mark_notification_read(db, notification)
    return NotificationRead.model_validate(updated).model_copy(update={"is_demo": bool(updated.auction and updated.auction.demo_batch_id is not None)})
