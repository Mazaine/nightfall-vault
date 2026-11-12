from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Annotated, Literal
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.models.auction import Auction
from app.models.cart import Cart, CartItem
from app.models.dicemagic import DiceMagicOrder, DiceMagicProduct, DiceMagicSyncLog
from app.services.dicemagic import state, sync_products, prepare_order, send_order, order_read, utcnow
from app.services.dicemagic_client import client, DiceMagicError
from app.schemas.dicemagic import ShopCheckout
from app.services.security_audit import create_domain_audit_log

router = APIRouter(prefix="/api/admin/integrations/dicemagic", tags=["dicemagic"], dependencies=[Depends(require_admin)])


class PrivacyApply(BaseModel):
    expected: dict[Annotated[int, Field(gt=0)], Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]] = Field(min_length=1, max_length=100)
    confirmed: bool = False


@router.get("/privacy/preview")
def privacy_preview(user=Depends(require_admin), db: Session = Depends(get_db)):
    from app.services.dicemagic_privacy import preview
    return preview(db, user)


@router.post("/privacy/anonymize")
def privacy_apply(payload: PrivacyApply, user=Depends(require_admin), db: Session = Depends(get_db)):
    from app.services.dicemagic_privacy import anonymize
    return anonymize(db, user, payload.expected, payload.confirmed)


class Controls(BaseModel):
    sync_enabled: bool
    orders_enabled: bool
    confirm_real_orders: bool = False


@router.get("")
def status(db: Session = Depends(get_db)):
    config = state(db)
    result = {"enabled": settings.dicemagic_enabled, "client_id_configured": bool(settings.dicemagic_client_id), "secret_configured": bool(settings.dicemagic_client_secret), "visibility": settings.dicemagic_visibility, "token_cached": client.token is not None and client.expires > __import__("time").monotonic(), "order_permission": "unknown", "order_environment_enabled": settings.dicemagic_real_order_enabled, "orders_enabled": config.orders_enabled, "sync_enabled": config.sync_enabled, "last_sync_at": config.last_sync_at, "next_sync_at": config.last_sync_at + timedelta(seconds=settings.dicemagic_sync_interval_seconds) if config.last_sync_at and config.sync_enabled else None, "last_error": config.last_error, "summary": config.summary}
    db.commit()
    return result


@router.put("/controls")
def controls(payload: Controls, user=Depends(require_admin), db: Session = Depends(get_db)):
    if payload.orders_enabled and not payload.confirm_real_orders:
        raise HTTPException(422, "Erősítsd meg: ez valódi rendeléseket hozhat létre a DiceMagicnél.")
    config = state(db)
    config.sync_enabled, config.orders_enabled = payload.sync_enabled, payload.orders_enabled
    create_domain_audit_log(db, action="dicemagic_controls_updated", user_id=user.id, metadata={"sync": payload.sync_enabled, "orders": payload.orders_enabled})
    db.commit()
    return status(db)


@router.post("/connection")
def connection():
    try:
        client.get_token()
    except DiceMagicError as exc:
        raise HTTPException(502, exc.code) from None
    return {"connected": True, "order_permission": "unknown"}


@router.post("/sync")
def sync(db: Session = Depends(get_db)):
    try:
        return sync_products(db, force=True)
    except DiceMagicError as exc:
        db.rollback()
        state(db).last_error = exc.code
        db.add(DiceMagicSyncLog(summary={"error": exc.code}))
        db.commit()
        raise HTTPException(502, exc.code) from None


@router.get("/logs")
def logs(db: Session = Depends(get_db)):
    return [{"at": log.created_at, "summary": log.summary} for log in db.scalars(select(DiceMagicSyncLog).order_by(DiceMagicSyncLog.id.desc()).limit(50))]


@router.get("/orders")
def orders(user=Depends(require_admin), db: Session = Depends(get_db)):
    return [{**order_read(row), "buyer_id": row.buyer_id} for row in db.scalars(
        select(DiceMagicOrder).order_by(DiceMagicOrder.id.desc()).limit(100)
    )]


class Prepare(BaseModel):
    idempotency_key: str
    details: ShopCheckout


class ShopCartItem(BaseModel):
    auction_id: int
    quantity: int
    accept_price: bool = False


@router.post("/cart")
def add_shop_cart(payload: ShopCartItem, user=Depends(require_admin), db: Session = Depends(get_db)):
    from app.services.cart import _get_or_create_cart, get_cart
    product = db.scalar(select(DiceMagicProduct).where(DiceMagicProduct.auction_id == payload.auction_id).with_for_update())
    auction = db.scalar(select(Auction).where(Auction.id == payload.auction_id, Auction.shop_source == "dicemagic").with_for_update())
    if not auction or not product or not product.active or product.stock_blocked or auction.status != "active":
        raise HTTPException(409, "A bolti termék jelenleg nem rendelhető.")
    if not 1 <= payload.quantity <= 999 or auction.shop_stock is not None and payload.quantity > auction.shop_stock:
        raise HTTPException(422, "Érvénytelen bolti darabszám (1–999 vagy az elérhető készlet).")
    cart = _get_or_create_cart(db, user.id)
    item = db.scalar(select(CartItem).where(CartItem.cart_id == cart.id, CartItem.auction_id == auction.id).with_for_update())
    if item is None:
        item = CartItem(cart_id=cart.id, auction_id=auction.id, price_snapshot=auction.buy_now_price, quantity=payload.quantity, status="active", shop_source="dicemagic")
        db.add(item)
    else:
        if item.status == "active" and item.price_snapshot != auction.buy_now_price and not payload.accept_price:
            raise HTTPException(409, "A bolti ár megváltozott. Fogadd el az új árat a kosárban.")
        item.quantity, item.price_snapshot, item.status = payload.quantity, auction.buy_now_price, "active"
        item.shop_source = "dicemagic"
    db.commit()
    return get_cart(db, user.id)


@router.post("/orders/prepare")
def prepare(payload: Prepare, user=Depends(require_admin), db: Session = Depends(get_db)):
    if not 8 <= len(payload.idempotency_key) <= 80:
        raise HTTPException(422, "Érvénytelen idempotenciakulcs.")
    items = list(db.scalars(select(CartItem).join(Cart).join(Auction).where(Cart.user_id == user.id, CartItem.status == "active", Auction.shop_source == "dicemagic").order_by(CartItem.id).with_for_update()).all())
    return order_read(prepare_order(db, user, payload.idempotency_key, items, payload.details.model_dump(mode="json")))


class Send(BaseModel):
    confirm_real_order: bool = False


@router.post("/orders/{order_id}/send")
def send(order_id: int, payload: Send, user=Depends(require_admin), db: Session = Depends(get_db)):
    if not payload.confirm_real_order:
        raise HTTPException(422, "A valódi rendelés elküldését meg kell erősíteni.")
    return send_order(db, order_id, user)


class Reconcile(BaseModel):
    partner_status: Literal["accepted", "rejected", "cancelled"]
    partner_reference: str = Field(min_length=5, max_length=500)
    verified_stock: int | None = Field(ge=0)
    snapshot_token: str = Field(min_length=64, max_length=64)
    confirm_verified: bool = False


@router.get("/orders/{order_id}/reconciliation")
def reconciliation(order_id: int, user=Depends(require_admin), db: Session = Depends(get_db)):
    from app.services.dicemagic_reconciliation import reconciliation_read
    return reconciliation_read(db, order_id, user)


@router.post("/orders/{order_id}/holds/{hold_id}/reconcile")
def reconcile(order_id: int, hold_id: int, payload: Reconcile, user=Depends(require_admin), db: Session = Depends(get_db)):
    from app.services.dicemagic_reconciliation import reconcile_hold
    return reconcile_hold(db, order_id, hold_id, user, payload)
