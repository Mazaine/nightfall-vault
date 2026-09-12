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
)
from app.services.notifications import count_unread_notifications, delete_read_notifications, mark_all_notifications_read, mark_notification_category_read, mark_notification_read
from app.services.demo_visibility import auction_visibility_clause
from app.services.web_push_subscriptions import revoke_web_push_subscription, upsert_web_push_subscription

router = APIRouter(prefix="/api/notifications", tags=["notifications"])
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
    upsert_web_push_subscription(db, current_user, payload, request.headers.get("user-agent"))
    return WebPushSubscriptionState(active=True)


@router.post("/push/subscriptions/status", response_model=WebPushSubscriptionState)
def get_web_push_subscription_status(
    payload: WebPushSubscriptionEndpoint,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> WebPushSubscriptionState:
    active = db.scalar(select(WebPushSubscription.id).where(
        WebPushSubscription.endpoint == payload.endpoint,
        WebPushSubscription.user_id == current_user.id,
        WebPushSubscription.revoked_at.is_(None),
    )) is not None
    return WebPushSubscriptionState(active=active)


@router.delete("/push/subscriptions", response_model=WebPushSubscriptionState)
def delete_web_push_subscription(
    payload: WebPushSubscriptionEndpoint,
    request: Request,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> WebPushSubscriptionState:
    check_rate_limit(request, "web-push:subscription", settings.web_push_subscription_rate_limit_per_minute, str(current_user.id))
    revoke_web_push_subscription(db, current_user, payload.endpoint)
    return WebPushSubscriptionState(active=False)


@router.get("/preferences", response_model=NotificationPreferenceMatrix)
def get_preferences(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> NotificationPreferenceMatrix:
    rows = {row.category: row for row in db.scalars(select(NotificationPreference).where(NotificationPreference.user_id == current_user.id)).all()}
    return NotificationPreferenceMatrix(
        categories={category: NotificationChannelPreference.model_validate(rows[category], from_attributes=True) if category in rows else NotificationChannelPreference() for category in CATEGORIES},
        push_defaults_eligible=not rows,
    )


@router.put("/preferences", response_model=NotificationPreferenceMatrix)
def update_preferences(payload: NotificationPreferenceMatrix, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> NotificationPreferenceMatrix:
    if set(payload.categories) != set(CATEGORIES):
        raise HTTPException(status_code=422, detail="Minden értesítési kategóriát meg kell adni.")
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
