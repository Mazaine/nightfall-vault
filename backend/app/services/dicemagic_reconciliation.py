"""Manual partner evidence + an exact, fresh API snapshot; no arbitrary stock input."""
import hashlib
import json
from datetime import timedelta
from fastapi import HTTPException
from sqlalchemy import select
from app.models.auction import Auction
from app.models.dicemagic import DiceMagicOrder, DiceMagicOrderHold, DiceMagicProduct
from app.services.dicemagic import utcnow
from app.services.security_audit import create_domain_audit_log


def snapshot_token(product):
    data = [product.id, product.snapshot, str(product.synced_at), str(product.snapshot_generated_at), product.stock_ceiling]
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


def participant_order(db, order_id, user, *, lock=False):
    query = select(DiceMagicOrder).where(DiceMagicOrder.id == order_id, DiceMagicOrder.buyer_id == user.id)
    order = db.scalar(query.with_for_update() if lock else query)
    if user.role != "admin" or order is None:
        raise HTTPException(404, "A bolti rendelés nem található.")
    return order


def reconciliation_read(db, order_id, user):
    order = participant_order(db, order_id, user)
    holds = db.scalars(select(DiceMagicOrderHold).where(DiceMagicOrderHold.order_id == order.id).order_by(DiceMagicOrderHold.id)).all()
    return {"order_id": order.id, "order_status": order.status, "shop_order_id": (order.response or {}).get("shop_order_id"), "holds": [{
        "id": hold.id, "outer_id": (p := db.get(DiceMagicProduct, hold.product_id)).outer_id,
        "quantity": hold.quantity, "baseline_stock": hold.baseline_stock, "stock": p.stock,
        "generated_at": p.snapshot_generated_at, "synced_at": p.synced_at, "snapshot_token": snapshot_token(p),
        "resolved_at": hold.resolved_at, "effective_stock": db.get(Auction, p.auction_id).shop_stock,
    } for hold in holds]}


def reconcile_hold(db, order_id, hold_id, user, payload):
    order = participant_order(db, order_id, user, lock=True)
    hold = db.scalar(select(DiceMagicOrderHold).where(DiceMagicOrderHold.id == hold_id, DiceMagicOrderHold.order_id == order.id).with_for_update())
    if hold is None or hold.resolved_at:
        raise HTTPException(409, "A készletblokk nem található vagy már feloldott.")
    product = db.scalar(select(DiceMagicProduct).where(DiceMagicProduct.id == hold.product_id).with_for_update())
    auction = db.scalar(select(Auction).where(Auction.id == product.auction_id).with_for_update())
    if not payload.confirm_verified or len(payload.partner_reference.strip()) < 5:
        raise HTTPException(422, "A partner rendelésállapotának igazolt ellenőrzése és hivatkozása szükséges.")
    if payload.snapshot_token != snapshot_token(product) or payload.verified_stock != product.stock:
        raise HTTPException(409, "A készletsnapshot megváltozott. Frissítsd az ellenőrzést.")
    if (product.stock is None and hold.baseline_stock is not None) or not product.snapshot_generated_at or product.snapshot_generated_at <= (order.last_sent_at or order.created_at) or utcnow() - product.synced_at > timedelta(minutes=15):
        raise HTTPException(409, "A rendelés utáni friss külső készlet szükséges. Követett készlet nem váltható ismeretlen mennyiségre a feloldáshoz.")
    if payload.partner_status == "accepted":
        if order.status != "accepted" or not order.response or not order.transaction_id:
            raise HTTPException(409, "Elfogadást csak az API-val visszaigazolt rendelésnél lehet egyeztetni. Bizonytalan eredménynél idempotens újrapróbálás szükséges.")
        ceiling = max(0, hold.baseline_stock - hold.quantity) if hold.baseline_stock is not None else product.stock
    else:
        if payload.partner_status == "rejected" and order.status not in {"rejected", "unknown"}:
            raise HTTPException(409, "Ez a rendelés nem jelölhető elutasítottnak.")
        if payload.partner_status == "cancelled" and order.status not in {"accepted", "unknown", "rejected", "queued", "cancelled"}:
            raise HTTPException(409, "Folyamatban lévő küldés nem oldható fel.")
        ceiling = hold.baseline_stock if hold.baseline_stock is not None else product.stock
    if product.stock is not None and ceiling is not None and product.stock > ceiling:
        raise HTTPException(409, "A snapshot nagyobb a rendelés utáni biztonságos készletnél; a blokk nem oldható fel.")
    resolved = db.scalars(select(DiceMagicOrderHold).where(DiceMagicOrderHold.order_id == order.id, DiceMagicOrderHold.resolved_at.is_not(None))).all()
    if any(row.evidence.get("partner_status") != payload.partner_status for row in resolved):
        raise HTTPException(409, "Egy rendelés tételeihez azonos igazolt partnerállapot szükséges.")
    hold.resolved_at, hold.resolved_by = utcnow(), user.id
    hold.evidence = {"partner_status": payload.partner_status, "partner_reference": payload.partner_reference.strip(), "stock": product.stock, "snapshot_token": payload.snapshot_token, "generated_at": product.snapshot_generated_at.isoformat()}
    product.stock_ceiling = min(product.stock, product.stock_ceiling) if product.stock is not None and product.stock_ceiling is not None else product.stock
    db.flush()
    unresolved = db.scalar(select(DiceMagicOrderHold.id).where(DiceMagicOrderHold.product_id == product.id, DiceMagicOrderHold.resolved_at.is_(None)).limit(1))
    product.stock_blocked = unresolved is not None
    auction.shop_stock = 0 if product.stock_blocked or not product.active else product.stock_ceiling
    # Rejection/partner cancellation must be terminal for the entire immutable order.
    # Do not mark the whole order resolved while some product blocks remain.
    pending = db.scalar(select(DiceMagicOrderHold.id).where(DiceMagicOrderHold.order_id == order.id, DiceMagicOrderHold.resolved_at.is_(None)).limit(1))
    if payload.partner_status != "accepted":
        order.status = payload.partner_status
        if order.transaction_id and pending is None:
            from app.models.transaction import AuctionTransaction
            transaction = db.get(AuctionTransaction, order.transaction_id)
            if transaction.status != "transaction_open" or transaction.buyer_completed_at or transaction.seller_completed_at:
                raise HTTPException(409, "A már megerősített ügylet külön felülvizsgálatot igényel.")
            transaction.status = "cancelled"
    create_domain_audit_log(db, action="dicemagic_stock_reconciled", user_id=user.id,
        metadata={"order_id": order.id, "hold_id": hold.id, "evidence": hold.evidence, "effective_stock": auction.shop_stock})
    db.commit()
    return reconciliation_read(db, order.id, user)
