from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import require_active_user
from app.models.notification import Notification
from app.models.user import User
from app.schemas.auction import NotificationRead, NotificationUnreadCount
from app.services.notifications import count_unread_notifications, mark_all_notifications_read, mark_notification_read

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationRead])
def list_notifications(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> list[NotificationRead]:
    statement = select(Notification).where(Notification.user_id == current_user.id).order_by(Notification.created_at.desc(), Notification.id.desc())
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
        raise HTTPException(status_code=404, detail="Notification not found")
    return NotificationRead.model_validate(mark_notification_read(db, notification))
