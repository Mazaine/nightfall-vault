from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import require_active_user
from app.models.notification import Notification
from app.models.notification import NotificationPreference
from app.models.user import User
from app.schemas.auction import NotificationRead, NotificationUnreadCount
from app.schemas.user import NotificationChannelPreference, NotificationPreferenceMatrix
from app.services.notifications import count_unread_notifications, mark_all_notifications_read, mark_notification_read

router = APIRouter(prefix="/api/notifications", tags=["notifications"])
CATEGORIES = ("bids", "chat", "follows", "transactions", "reviews", "moderation", "system")


@router.get("/preferences", response_model=NotificationPreferenceMatrix)
def get_preferences(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> NotificationPreferenceMatrix:
    rows = {row.category: row for row in db.scalars(select(NotificationPreference).where(NotificationPreference.user_id == current_user.id)).all()}
    return NotificationPreferenceMatrix(categories={category: NotificationChannelPreference.model_validate(rows[category], from_attributes=True) if category in rows else NotificationChannelPreference() for category in CATEGORIES})


@router.put("/preferences", response_model=NotificationPreferenceMatrix)
def update_preferences(payload: NotificationPreferenceMatrix, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> NotificationPreferenceMatrix:
    if set(payload.categories) != set(CATEGORIES):
        raise HTTPException(status_code=422, detail="Minden értesítési kategóriát meg kell adni.")
    rows = {row.category: row for row in db.scalars(select(NotificationPreference).where(NotificationPreference.user_id == current_user.id)).all()}
    for category, values in payload.categories.items():
        row = rows.get(category) or NotificationPreference(user_id=current_user.id, category=category)
        row.in_app, row.browser, row.email = values.in_app, values.browser, values.email
        db.add(row)
    db.commit()
    return get_preferences(current_user, db)


@router.get("", response_model=list[NotificationRead])
def list_notifications(category: str | None = Query(default=None), current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> list[NotificationRead]:
    statement = select(Notification).where(Notification.user_id == current_user.id, Notification.in_app_enabled.is_(True))
    if category and category != "all":
        statement = statement.where(Notification.category == category)
    statement = statement.order_by(Notification.created_at.desc(), Notification.id.desc())
    return [NotificationRead.model_validate(notification) for notification in db.scalars(statement).all()]


@router.get("/unread-count", response_model=NotificationUnreadCount)
def get_unread_notification_count(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> NotificationUnreadCount:
    return NotificationUnreadCount(unread_count=count_unread_notifications(db, current_user.id))


@router.post("/mark-all-read")
def mark_all_read(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> dict[str, int]:
    return {"updated": mark_all_notifications_read(db, current_user.id)}


@router.post("/{notification_id}/read", response_model=NotificationRead)
def mark_read(notification_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> NotificationRead:
    notification = db.get(Notification, notification_id)
    if notification is None or notification.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Az értesítés nem található.")
    return NotificationRead.model_validate(mark_notification_read(db, notification))
