from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.models.auction import Auction
from app.models.moderation import Report
from app.models.newsletter import NewsletterCampaign, NewsletterSubscriber
from app.models.password_reset_token import PasswordResetToken
from app.models.security_log import AuditLog
from app.models.user import User
from app.schemas.moderation import AdminReportPage, AdminReportRead, ReportNoteUpdate, ReportPriorityUpdate, ReportStatusUpdate
from app.schemas.newsletter import NewsletterBulkSendResponse, NewsletterCampaignCreate, NewsletterCampaignRead, NewsletterCampaignUpdate, NewsletterSendBulkRequest, NewsletterSendTestRequest, NewsletterSubscriberCreate, NewsletterSubscriberRead, NewsletterSubscriberUpdate
from app.schemas.auction import AuctionListItem, AuctionModerationRequest, AuctionStatusResponse
from app.schemas.user import UserAdminUpdate, UserPublic
from app.services.email import send_test_newsletter_email
from app.services.email_service import send_newsletter_email
from app.services.reports import get_report_or_404, related_report_counts, report_options, update_report_note, update_report_priority, update_report_status
from app.services.auction_lifecycle import get_auction_statement, sync_auction_status
from app.services.auction_moderation import restore_auction, soft_delete_auction, suspend_auction

router = APIRouter(prefix="/api/admin", tags=["admin"])


def serialize_audit_log(log: AuditLog) -> dict:
    return {
        "id": log.id,
        "user_id": log.user_id,
        "auction_id": log.auction_id,
        "action": log.action,
        "path": log.path,
        "method": log.method,
        "status_code": log.status_code,
        "created_at": log.created_at,
        "metadata_json": log.metadata_json,
    }


def active_user_statement():
    return select(User).where(User.deleted_at.is_(None))


def get_active_user_or_404(db: Session, user_id: int) -> User:
    user = db.scalar(active_user_statement().where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=404, detail="A felhasználó nem található.")
    return user


@router.get("/me", response_model=UserPublic)
def get_admin_me(current_user: User = Depends(require_admin)) -> UserPublic:
    return UserPublic.model_validate(current_user)


@router.get("/stats")
def get_admin_stats(_current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict[str, int]:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)
    new_users = db.scalar(select(func.count()).select_from(User).where(User.created_at >= week_start, User.deleted_at.is_(None))) or 0
    return {
        "total_auctions": db.scalar(select(func.count()).select_from(Auction).where(Auction.deleted_at.is_(None))) or 0,
        "active_auctions": db.scalar(select(func.count()).select_from(Auction).where(Auction.status == "active", Auction.deleted_at.is_(None))) or 0,
        "today_auctions": db.scalar(select(func.count()).select_from(Auction).where(Auction.created_at >= today_start, Auction.deleted_at.is_(None))) or 0,
        "sold_auctions": db.scalar(select(func.count()).select_from(Auction).where(Auction.status == "sold", Auction.deleted_at.is_(None))) or 0,
        "open_reports": db.scalar(select(func.count()).select_from(Report).where(Report.status.in_(["open", "under_review"]))) or 0,
        "total_users": db.scalar(select(func.count()).select_from(User).where(User.deleted_at.is_(None))) or 0,
        "new_users": int(new_users),
    }




def admin_report_read(db: Session, report: Report) -> AdminReportRead:
    open_count, total_count = related_report_counts(db, report)
    return AdminReportRead.model_validate(report).model_copy(update={"related_open_reports": open_count, "related_total_reports": total_count})


@router.get("/reports", response_model=AdminReportPage)
def list_admin_reports(
    status_filter: str | None = Query(default=None, alias="status", max_length=30),
    target_type: str | None = Query(default=None, max_length=20),
    reason: str | None = Query(default=None, max_length=80),
    priority: str | None = Query(default=None, max_length=20),
    reporter_id: int | None = None,
    reported_user_id: int | None = None,
    auction_id: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    assigned_admin_id: int | None = None,
    sort: str = Query(default="newest"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminReportPage:
    query = db.query(Report).options(*report_options())
    if status_filter:
        query = query.filter(Report.status == status_filter)
    if target_type:
        query = query.filter(Report.target_type == target_type)
    if reason:
        query = query.filter(Report.reason == reason)
    if priority:
        query = query.filter(Report.priority == priority)
    if reporter_id is not None:
        query = query.filter(Report.reporter_id == reporter_id)
    if reported_user_id is not None:
        query = query.filter(Report.reported_user_id == reported_user_id)
    if auction_id is not None:
        query = query.filter(Report.auction_id == auction_id)
    if date_from is not None:
        query = query.filter(Report.created_at >= date_from)
    if date_to is not None:
        query = query.filter(Report.created_at <= date_to)
    if assigned_admin_id is not None:
        query = query.filter(Report.assigned_admin_id == assigned_admin_id)
    total = query.count()
    if sort == "oldest":
        query = query.order_by(Report.created_at.asc(), Report.id.asc())
    elif sort == "priority":
        query = query.order_by(Report.priority.desc(), Report.created_at.desc(), Report.id.desc())
    else:
        query = query.order_by(Report.created_at.desc(), Report.id.desc())
    reports = query.offset(offset).limit(limit).all()
    return AdminReportPage(items=[admin_report_read(db, report) for report in reports], total=total, limit=limit, offset=offset)


@router.get("/reports/{report_id}", response_model=AdminReportRead)
def get_admin_report(report_id: int, _current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> AdminReportRead:
    return admin_report_read(db, get_report_or_404(db, report_id))


@router.put("/reports/{report_id}/status", response_model=AdminReportRead)
def update_admin_report_status(report_id: int, payload: ReportStatusUpdate, current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> AdminReportRead:
    report = update_report_status(db, get_report_or_404(db, report_id), current_user, payload.status, payload.public_resolution)
    return admin_report_read(db, report)


@router.put("/reports/{report_id}/priority", response_model=AdminReportRead)
def update_admin_report_priority(report_id: int, payload: ReportPriorityUpdate, current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> AdminReportRead:
    report = update_report_priority(db, get_report_or_404(db, report_id), current_user, payload.priority)
    return admin_report_read(db, report)


@router.put("/reports/{report_id}/note", response_model=AdminReportRead)
def update_admin_report_note(report_id: int, payload: ReportNoteUpdate, current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> AdminReportRead:
    report = update_report_note(db, get_report_or_404(db, report_id), current_user, payload.admin_note)
    return admin_report_read(db, report)


@router.get("/audit-logs")
def list_admin_audit_logs(
    action: str | None = Query(default=None, max_length=120),
    auction_id: int | None = None,
    user_id: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    statement = select(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
    if action:
        statement = statement.where(AuditLog.action == action)
    if auction_id is not None:
        statement = statement.where(AuditLog.auction_id == auction_id)
    if user_id is not None:
        statement = statement.where(AuditLog.user_id == user_id)
    if date_from is not None:
        statement = statement.where(AuditLog.created_at >= date_from)
    if date_to is not None:
        statement = statement.where(AuditLog.created_at <= date_to)
    rows = db.scalars(statement.offset(offset).limit(limit)).all()
    return {"items": [serialize_audit_log(row) for row in rows], "limit": limit, "offset": offset}


@router.get("/audit-logs/{audit_log_id}")
def get_admin_audit_log(audit_log_id: int, _current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    log = db.get(AuditLog, audit_log_id)
    if log is None:
        raise HTTPException(status_code=404, detail="Az auditbejegyzés nem található.")
    return serialize_audit_log(log)


@router.get("/auctions", response_model=list[AuctionListItem])
def list_admin_auctions(_current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[AuctionListItem]:
    statement = get_auction_statement().order_by(Auction.created_at.desc(), Auction.id.desc()).limit(100)
    return [AuctionListItem.model_validate(sync_auction_status(db, auction)) for auction in db.scalars(statement).all()]


@router.post("/auctions/{auction_id}/suspend", response_model=AuctionStatusResponse)
def suspend_admin_auction(
    auction_id: int,
    moderation_request: AuctionModerationRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AuctionStatusResponse:
    auction = db.scalar(get_auction_statement().where(Auction.id == auction_id))
    if auction is None:
        raise HTTPException(status_code=404, detail="Az aukció nem található.")
    return AuctionStatusResponse.model_validate(suspend_auction(db, auction, current_user, moderation_request.reason))


@router.post("/auctions/{auction_id}/restore", response_model=AuctionStatusResponse)
def restore_admin_auction(
    auction_id: int,
    moderation_request: AuctionModerationRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AuctionStatusResponse:
    auction = db.scalar(get_auction_statement().where(Auction.id == auction_id))
    if auction is None:
        raise HTTPException(status_code=404, detail="Az aukció nem található.")
    return AuctionStatusResponse.model_validate(restore_auction(db, auction, current_user, moderation_request.reason))


@router.delete("/auctions/{auction_id}", response_model=AuctionStatusResponse)
def delete_admin_auction(
    auction_id: int,
    moderation_request: AuctionModerationRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AuctionStatusResponse:
    auction = db.scalar(get_auction_statement().where(Auction.id == auction_id))
    if auction is None:
        raise HTTPException(status_code=404, detail="Az aukció nem található.")
    return AuctionStatusResponse.model_validate(soft_delete_auction(db, auction, current_user, moderation_request.reason))


@router.get("/newsletters/campaigns", response_model=list[NewsletterCampaignRead])
def list_admin_newsletter_campaigns(_current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[NewsletterCampaignRead]:
    return list(db.scalars(select(NewsletterCampaign).order_by(NewsletterCampaign.created_at.desc(), NewsletterCampaign.id.desc())).all())


@router.post("/newsletters/campaigns", response_model=NewsletterCampaignRead, status_code=status.HTTP_201_CREATED)
def create_admin_newsletter_campaign(campaign_create: NewsletterCampaignCreate, current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> NewsletterCampaignRead:
    campaign = NewsletterCampaign(**campaign_create.model_dump(), created_by_admin_id=current_user.id)
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return NewsletterCampaignRead.model_validate(campaign)


@router.get("/newsletters/campaigns/{campaign_id}", response_model=NewsletterCampaignRead)
def get_admin_newsletter_campaign(campaign_id: int, _current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> NewsletterCampaignRead:
    campaign = db.get(NewsletterCampaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Newsletter campaign not found.")
    return NewsletterCampaignRead.model_validate(campaign)


@router.patch("/newsletters/campaigns/{campaign_id}", response_model=NewsletterCampaignRead)
def update_admin_newsletter_campaign(campaign_id: int, campaign_update: NewsletterCampaignUpdate, _current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> NewsletterCampaignRead:
    campaign = db.get(NewsletterCampaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Newsletter campaign not found.")
    for field_name, value in campaign_update.model_dump(exclude_unset=True).items():
        setattr(campaign, field_name, value)
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return NewsletterCampaignRead.model_validate(campaign)


@router.delete("/newsletters/campaigns/{campaign_id}", response_model=NewsletterCampaignRead)
def delete_admin_newsletter_campaign(campaign_id: int, _current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> NewsletterCampaignRead:
    campaign = db.get(NewsletterCampaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Newsletter campaign not found.")
    response = NewsletterCampaignRead.model_validate(campaign)
    db.delete(campaign)
    db.commit()
    return response


@router.post("/newsletters/campaigns/{campaign_id}/send-test", response_model=NewsletterCampaignRead)
def send_admin_newsletter_test(campaign_id: int, send_request: NewsletterSendTestRequest, _current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> NewsletterCampaignRead:
    campaign = db.get(NewsletterCampaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Newsletter campaign not found.")
    send_test_newsletter_email(to_email=str(send_request.test_email), subject=campaign.subject, html_content=campaign.content_html, text_content=campaign.content_text)
    campaign.status = "test_sent"
    campaign.test_email = str(send_request.test_email)
    campaign.sent_at = datetime.now(timezone.utc)
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return NewsletterCampaignRead.model_validate(campaign)


@router.post("/newsletters/campaigns/{campaign_id}/send", response_model=NewsletterBulkSendResponse)
def send_admin_newsletter_bulk(campaign_id: int, send_request: NewsletterSendBulkRequest, _current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> NewsletterBulkSendResponse:
    campaign = db.get(NewsletterCampaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Newsletter campaign not found.")
    statement = select(NewsletterSubscriber).outerjoin(User, NewsletterSubscriber.user_id == User.id).where(NewsletterSubscriber.is_active.is_(True), (NewsletterSubscriber.user_id.is_(None)) | (User.deleted_at.is_(None)))
    if not send_request.send_to_all:
        if not send_request.subscriber_ids:
            raise HTTPException(status_code=400, detail="No active newsletter subscribers selected.")
        statement = statement.where(NewsletterSubscriber.id.in_(set(send_request.subscriber_ids)))
    subscribers = list(db.scalars(statement).all())
    if not subscribers:
        raise HTTPException(status_code=400, detail="No active newsletter subscribers found.")
    sent_count = 0
    failed_count = 0
    for subscriber in subscribers:
        try:
            if send_newsletter_email(subscriber.email, campaign.subject, campaign.content_html):
                sent_count += 1
            else:
                failed_count += 1
        except Exception:
            failed_count += 1
            logger.exception("Newsletter send failed: %s", subscriber.email)
    campaign.sent_at = datetime.now(timezone.utc)
    campaign.status = "sent" if failed_count == 0 and sent_count > 0 else "ready"
    db.add(campaign)
    db.commit()
    return NewsletterBulkSendResponse(message="Newsletter send finished.", sent_count=sent_count, failed_count=failed_count)


@router.get("/newsletters/subscribers", response_model=list[NewsletterSubscriberRead])
def list_admin_newsletter_subscribers(_current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[NewsletterSubscriberRead]:
    statement = select(NewsletterSubscriber).outerjoin(User, NewsletterSubscriber.user_id == User.id).where((NewsletterSubscriber.user_id.is_(None)) | (User.deleted_at.is_(None))).order_by(NewsletterSubscriber.created_at.desc(), NewsletterSubscriber.id.desc())
    return list(db.scalars(statement).all())


@router.post("/newsletters/subscribers", response_model=NewsletterSubscriberRead, status_code=status.HTTP_201_CREATED)
def create_admin_newsletter_subscriber(subscriber_create: NewsletterSubscriberCreate, _current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> NewsletterSubscriberRead:
    existing = db.scalar(select(NewsletterSubscriber).where(NewsletterSubscriber.email == subscriber_create.email))
    if existing is not None:
        raise HTTPException(status_code=409, detail="Email is already subscribed.")
    subscriber = NewsletterSubscriber(**subscriber_create.model_dump(exclude={"captcha_token", "turnstile_token"}))
    db.add(subscriber)
    db.commit()
    db.refresh(subscriber)
    return NewsletterSubscriberRead.model_validate(subscriber)


@router.patch("/newsletters/subscribers/{subscriber_id}", response_model=NewsletterSubscriberRead)
def update_admin_newsletter_subscriber(subscriber_id: int, subscriber_update: NewsletterSubscriberUpdate, _current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> NewsletterSubscriberRead:
    subscriber = db.get(NewsletterSubscriber, subscriber_id)
    if subscriber is None:
        raise HTTPException(status_code=404, detail="Subscriber not found.")
    update_data = subscriber_update.model_dump(exclude_unset=True)
    if "is_active" in update_data:
        subscriber.unsubscribed_at = None if update_data["is_active"] else datetime.now(timezone.utc)
    for field_name, value in update_data.items():
        setattr(subscriber, field_name, value)
    db.add(subscriber)
    db.commit()
    db.refresh(subscriber)
    return NewsletterSubscriberRead.model_validate(subscriber)


@router.delete("/newsletters/subscribers/{subscriber_id}", response_model=NewsletterSubscriberRead)
def delete_admin_newsletter_subscriber(subscriber_id: int, _current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> NewsletterSubscriberRead:
    subscriber = db.get(NewsletterSubscriber, subscriber_id)
    if subscriber is None:
        raise HTTPException(status_code=404, detail="Subscriber not found.")
    subscriber.is_active = False
    subscriber.unsubscribed_at = datetime.now(timezone.utc)
    db.add(subscriber)
    db.commit()
    db.refresh(subscriber)
    return NewsletterSubscriberRead.model_validate(subscriber)


@router.get("/users", response_model=list[UserPublic])
def list_admin_users(_current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[UserPublic]:
    return list(db.scalars(active_user_statement().order_by(User.created_at.desc(), User.id.desc())).all())


@router.get("/users/search", response_model=list[UserPublic])
def search_admin_users(query: str = Query(min_length=2, max_length=120), _current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[UserPublic]:
    search_pattern = f"%{query.strip()}%"
    statement = active_user_statement().where(User.email.ilike(search_pattern) | User.username.ilike(search_pattern) | User.full_name.ilike(search_pattern)).order_by(User.created_at.desc(), User.id.desc()).limit(20)
    return list(db.scalars(statement).all())


@router.patch("/users/{user_id}", response_model=UserPublic)
def update_admin_user(user_id: int, user_update: UserAdminUpdate, _current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> UserPublic:
    user = get_active_user_or_404(db, user_id)
    for field_name, value in user_update.model_dump(exclude_unset=True).items():
        setattr(user, field_name, value)
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserPublic.model_validate(user)
@router.delete("/users/{user_id}", response_model=UserPublic)
def delete_admin_user(user_id: int, _current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> UserPublic:
    user = get_active_user_or_404(db, user_id)
    user.deleted_at = datetime.now(timezone.utc)
    user.is_active = False
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserPublic.model_validate(user)
