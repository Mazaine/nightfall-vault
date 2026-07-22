from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rate_limit import check_rate_limit
from app.db.session import get_db
from app.dependencies.auth import require_active_user
from app.models.newsletter import NewsletterSubscriber
from app.models.user import User
from app.schemas.auth import MessageResponse
from app.schemas.newsletter import NewsletterMeRead, NewsletterMeUpdate, NewsletterSubscriberCreate
from app.services.captcha_service import verify_captcha
from app.services.newsletter_tokens import normalize_newsletter_email, verify_unsubscribe_token

router = APIRouter(prefix="/api/newsletter", tags=["newsletter"])
PUBLIC_SUBSCRIBE_MESSAGE = "Ha az e-mail-cím érvényes, a feliratkozási kérés feldolgozásra került."


def get_subscriber_for_user(db: Session, user: User) -> NewsletterSubscriber | None:
    return db.scalar(
        select(NewsletterSubscriber).where(
            (NewsletterSubscriber.user_id == user.id) | (NewsletterSubscriber.email == user.email),
        ),
    )


@router.post("/subscribe", response_model=MessageResponse)
def subscribe_public(
    subscriber_create: NewsletterSubscriberCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> MessageResponse:
    check_rate_limit(request, "newsletter:subscribe", settings.newsletter_rate_limit_per_minute, str(subscriber_create.email))
    verify_captcha(subscriber_create.captcha_token or subscriber_create.turnstile_token, action="newsletter-subscribe")

    existing = db.scalar(select(NewsletterSubscriber).where(NewsletterSubscriber.email == subscriber_create.email))
    if existing is not None:
        existing.is_active = True
        existing.full_name = subscriber_create.full_name or existing.full_name
        existing.source = subscriber_create.source
        existing.unsubscribed_at = None
        db.add(existing)
        db.commit()
        return MessageResponse(message=PUBLIC_SUBSCRIBE_MESSAGE)

    subscriber = NewsletterSubscriber(**subscriber_create.model_dump(exclude={"captcha_token", "turnstile_token"}))
    db.add(subscriber)
    db.commit()
    return MessageResponse(message=PUBLIC_SUBSCRIBE_MESSAGE)


@router.get("/unsubscribe", response_model=MessageResponse)
def unsubscribe_public(
    email: str = Query(min_length=3),
    token: str = Query(min_length=16),
    db: Session = Depends(get_db),
) -> MessageResponse:
    normalized_email = normalize_newsletter_email(email)
    if not verify_unsubscribe_token(normalized_email, token):
        raise HTTPException(status_code=400, detail="Érvénytelen leiratkozási link.")

    subscriber = db.scalar(select(NewsletterSubscriber).where(NewsletterSubscriber.email == normalized_email))
    if subscriber is not None:
        subscriber.is_active = False
        subscriber.unsubscribed_at = datetime.now(timezone.utc)
        db.add(subscriber)
        db.commit()

    return MessageResponse(message="Successfully unsubscribed from the newsletter.")


@router.get("/me", response_model=NewsletterMeRead)
def get_my_newsletter_status(
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> NewsletterMeRead:
    subscriber = get_subscriber_for_user(db, current_user)
    return NewsletterMeRead(
        is_active=subscriber.is_active if subscriber else False,
        email=current_user.email,
        full_name=current_user.full_name,
    )


@router.patch("/me", response_model=NewsletterMeRead)
def update_my_newsletter_status(
    update: NewsletterMeUpdate,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> NewsletterMeRead:
    subscriber = get_subscriber_for_user(db, current_user)
    if subscriber is None:
        subscriber = NewsletterSubscriber(
            email=current_user.email,
            full_name=current_user.full_name,
            user_id=current_user.id,
            source="manual",
        )

    subscriber.email = current_user.email
    subscriber.full_name = current_user.full_name
    subscriber.user_id = current_user.id
    subscriber.is_active = update.is_active
    subscriber.unsubscribed_at = None if update.is_active else datetime.now(timezone.utc)
    db.add(subscriber)
    db.commit()
    db.refresh(subscriber)

    return NewsletterMeRead(
        is_active=subscriber.is_active,
        email=subscriber.email,
        full_name=subscriber.full_name,
    )

