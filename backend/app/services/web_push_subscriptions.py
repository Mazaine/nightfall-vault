from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.notification import WebPushSubscription
from app.models.user import User
from app.schemas.user import WebPushSubscriptionCreate
from app.services.web_push_security import validate_push_service_endpoint


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def sanitize_user_agent(value: str | None) -> str | None:
    cleaned = "".join(character for character in (value or "") if character >= " " and character != "\x7f").strip()
    return cleaned[:255] or None


def _apply_subscription(
    subscription: WebPushSubscription,
    user: User,
    payload: WebPushSubscriptionCreate,
    user_agent: str | None,
) -> WebPushSubscription:
    subscription.user_id = user.id
    subscription.p256dh = payload.keys.p256dh
    subscription.auth = payload.keys.auth
    subscription.user_agent = sanitize_user_agent(user_agent)
    subscription.revoked_at = None
    subscription.updated_at = now_utc()
    return subscription


def upsert_web_push_subscription(
    db: Session,
    user: User,
    payload: WebPushSubscriptionCreate,
    user_agent: str | None,
) -> WebPushSubscription:
    validate_push_service_endpoint(payload.endpoint, resolve_dns=False)
    subscription = db.scalar(
        select(WebPushSubscription).where(WebPushSubscription.endpoint == payload.endpoint).with_for_update()
    )
    if subscription is None:
        subscription = WebPushSubscription(
            user_id=user.id,
            endpoint=payload.endpoint,
            p256dh=payload.keys.p256dh,
            auth=payload.keys.auth,
            user_agent=sanitize_user_agent(user_agent),
        )
    else:
        _apply_subscription(subscription, user, payload, user_agent)
    db.add(subscription)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        subscription = db.scalar(
            select(WebPushSubscription).where(WebPushSubscription.endpoint == payload.endpoint).with_for_update()
        )
        if subscription is None:
            raise
        _apply_subscription(subscription, user, payload, user_agent)
        db.add(subscription)
        db.commit()
    db.refresh(subscription)
    return subscription


def revoke_web_push_subscription(db: Session, user: User, endpoint: str) -> None:
    subscription = db.scalar(
        select(WebPushSubscription).where(
            WebPushSubscription.endpoint == endpoint,
            WebPushSubscription.user_id == user.id,
        ).with_for_update()
    )
    if subscription is None:
        raise HTTPException(status_code=404, detail="Az eszköz push-feliratkozása nem található.")
    if subscription.revoked_at is None:
        subscription.revoked_at = now_utc()
        subscription.updated_at = subscription.revoked_at
        db.add(subscription)
        db.commit()
