from pathlib import Path
from datetime import datetime, timedelta, timezone
import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.crud.category import get_active_categories
from app.crud.product import create_product, deactivate_product, get_admin_products, get_any_product_by_slug, get_product_by_id, update_product
from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.models.auction import Auction
from app.models.newsletter import NewsletterCampaign, NewsletterSubscriber
from app.models.order import Order
from app.models.password_reset_token import PasswordResetToken
from app.models.product import Product
from app.models.security_log import AuditLog
from app.models.user import User
from app.schemas.newsletter import NewsletterBulkSendResponse, NewsletterCampaignCreate, NewsletterCampaignRead, NewsletterCampaignUpdate, NewsletterSendBulkRequest, NewsletterSendTestRequest, NewsletterSubscriberCreate, NewsletterSubscriberRead, NewsletterSubscriberUpdate
from app.schemas.order import OrderDetailRead, OrderRead, OrderStatusUpdate
from app.schemas.auction import AuctionListItem, AuctionModerationRequest, AuctionStatusResponse
from app.schemas.product import ProductAdminRead, ProductCreate, ProductUpdate
from app.schemas.stock_movement import StockAdjustmentCreate, StockMovementRead
from app.schemas.user import UserAdminUpdate, UserPublic
from app.services.email import send_test_newsletter_email
from app.services.email_service import send_newsletter_email, send_order_completed_email
from app.services.auction_lifecycle import get_auction_statement, sync_auction_status
from app.services.auction_moderation import restore_auction, soft_delete_auction, suspend_auction
from app.services.stock_movements import adjust_product_stock, list_stock_movements, release_order_stock

router = APIRouter(prefix="/api/admin", tags=["admin"])
logger = logging.getLogger(__name__)

ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
PRODUCT_UPLOAD_DIR = Path("uploads/products")
COMPLETED_ORDER_STATUSES = {"completed"}


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
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/me", response_model=UserPublic)
def get_admin_me(current_user: User = Depends(require_admin)) -> UserPublic:
    return UserPublic.model_validate(current_user)


@router.get("/stats")
def get_admin_stats(_current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict[str, int]:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)
    completed_revenue = db.scalar(select(func.coalesce(func.sum(Order.total_amount), 0)).where(Order.status == "completed"))
    new_users = db.scalar(select(func.count()).select_from(User).where(User.created_at >= week_start, User.deleted_at.is_(None))) or 0
    return {
        "total_orders": db.scalar(select(func.count()).select_from(Order)) or 0,
        "today_orders": db.scalar(select(func.count()).select_from(Order).where(Order.created_at >= today_start)) or 0,
        "week_orders": db.scalar(select(func.count()).select_from(Order).where(Order.created_at >= week_start)) or 0,
        "pending_orders": db.scalar(select(func.count()).select_from(Order).where(Order.status.in_(["pending_payment", "processing"]))) or 0,
        "completed_revenue": int(completed_revenue or 0),
        "total_users": db.scalar(select(func.count()).select_from(User).where(User.deleted_at.is_(None))) or 0,
        "new_users": int(new_users),
        "total_products": db.scalar(select(func.count()).select_from(Product)) or 0,
        "low_stock_products": db.scalar(select(func.count()).select_from(Product).where(Product.is_active.is_(True), Product.stock_quantity <= 3)) or 0,
    }


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
        raise HTTPException(status_code=404, detail="Audit log not found")
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
        raise HTTPException(status_code=404, detail="Auction not found")
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
        raise HTTPException(status_code=404, detail="Auction not found")
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
        raise HTTPException(status_code=404, detail="Auction not found")
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


@router.get("/orders", response_model=list[OrderRead])
def list_admin_orders(search: str | None = Query(default=None, max_length=120), status_filter: str | None = Query(default=None, alias="status", max_length=30), _current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[OrderRead]:
    statement = select(Order).order_by(Order.created_at.desc(), Order.id.desc())
    if status_filter:
        statement = statement.where(Order.status == status_filter)
    if search:
        normalized_search = f"%{search.strip()}%"
        statement = statement.where(Order.order_number.ilike(normalized_search) | Order.customer_name.ilike(normalized_search) | Order.customer_email.ilike(normalized_search))
    return list(db.scalars(statement).all())


@router.get("/orders/{order_id}", response_model=OrderDetailRead)
def get_admin_order(order_id: int, _current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> OrderDetailRead:
    order = db.scalar(select(Order).options(selectinload(Order.items)).where(Order.id == order_id))
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return OrderDetailRead.model_validate(order)


@router.patch("/orders/{order_id}/status", response_model=OrderDetailRead)
def update_admin_order_status(order_id: int, status_update: OrderStatusUpdate, _current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> OrderDetailRead:
    order = db.scalar(select(Order).options(selectinload(Order.items)).where(Order.id == order_id))
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    was_completed_before = order.status in COMPLETED_ORDER_STATUSES
    order.status = status_update.status
    if status_update.status == "cancelled" and order.stock_released_at is None:
        release_order_stock(db, order, _current_user)
    db.add(order)
    db.commit()
    db.refresh(order)
    if status_update.status in COMPLETED_ORDER_STATUSES and not was_completed_before:
        try:
            send_order_completed_email(order)
        except Exception:
            logger.exception("Order completed email failed: %s", order.order_number)
    return OrderDetailRead.model_validate(order)


@router.post("/products/images")
async def upload_admin_product_image(request: Request, image: UploadFile = File(...), _current_user: User = Depends(require_admin)) -> dict[str, str]:
    if image.content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    PRODUCT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    suffix = Path(image.filename or "").suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        suffix = ".jpg"
    file_name = f"{uuid4().hex}{suffix}"
    file_path = PRODUCT_UPLOAD_DIR / file_name
    file_path.write_bytes(await image.read())
    return {"image_url": str(request.base_url).rstrip("/") + f"/uploads/products/{file_name}"}


@router.get("/stock-movements", response_model=list[StockMovementRead])
def list_admin_stock_movements(_current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[StockMovementRead]:
    return list_stock_movements(db)


@router.get("/products/{product_id}/stock-movements", response_model=list[StockMovementRead])
def list_admin_product_stock_movements(product_id: int, _current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[StockMovementRead]:
    product = get_product_by_id(db, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found.")
    return list_stock_movements(db, product_id=product.id)


@router.post("/products/{product_id}/stock-adjust", response_model=ProductAdminRead)
def adjust_admin_product_stock(product_id: int, stock_adjustment: StockAdjustmentCreate, current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> ProductAdminRead:
    product = get_product_by_id(db, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found.")
    updated_product = adjust_product_stock(db=db, product=product, quantity_change=stock_adjustment.quantity_change, note=stock_adjustment.note, admin_user=current_user)
    if updated_product.manage_stock and updated_product.stock_quantity <= 0:
        updated_product.stock_status = "out_of_stock"
    elif updated_product.manage_stock and updated_product.stock_quantity > 0 and updated_product.stock_status == "out_of_stock":
        updated_product.stock_status = "in_stock"
    db.add(updated_product)
    db.commit()
    db.refresh(updated_product)
    return ProductAdminRead.model_validate(updated_product)


@router.get("/products", response_model=list[ProductAdminRead])
def list_admin_products(_current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[ProductAdminRead]:
    return get_admin_products(db)


@router.post("/products", response_model=ProductAdminRead, status_code=status.HTTP_201_CREATED)
def create_admin_product(product_create: ProductCreate, _current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> ProductAdminRead:
    if not any(category.id == product_create.category_id for category in get_active_categories(db)):
        raise HTTPException(status_code=404, detail="Category not found")
    if get_any_product_by_slug(db, product_create.slug) is not None:
        raise HTTPException(status_code=409, detail="Product slug already exists")
    return create_product(db, product_create)


@router.patch("/products/{product_id}", response_model=ProductAdminRead)
def update_admin_product(product_id: int, product_update: ProductUpdate, _current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> ProductAdminRead:
    product = get_product_by_id(db, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    if product_update.category_id is not None and not any(category.id == product_update.category_id for category in get_active_categories(db)):
        raise HTTPException(status_code=404, detail="Category not found")
    if product_update.slug is not None:
        existing_product = get_any_product_by_slug(db, product_update.slug)
        if existing_product is not None and existing_product.id != product.id:
            raise HTTPException(status_code=409, detail="Product slug already exists")
    return update_product(db, product, product_update)


@router.delete("/products/{product_id}", response_model=ProductAdminRead)
def delete_admin_product(product_id: int, _current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> ProductAdminRead:
    product = get_product_by_id(db, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return deactivate_product(db, product)
