"""Explicit, policy-gated minimization of closed orders. No scheduler or HTTP."""
import hashlib
import hmac
import json
from datetime import timedelta
from fastapi import HTTPException
from sqlalchemy import func, select
from app.core.config import settings
from app.models.dicemagic import DiceMagicOrder, DiceMagicOrderHold
from app.models.transaction import AuctionTransaction
from app.services.dicemagic import utcnow
from app.services.security_audit import create_domain_audit_log


def fingerprint(order):
    data = json.dumps([order.id, order.payload, str(order.updated_at)], sort_keys=True).encode()
    return hmac.new(settings.secret_key.encode(), data, hashlib.sha256).hexdigest()


def eligible(db, order, now):
    days = settings.dicemagic_order_retention_days
    if not days or order.payload.get("_personal_data_removed_at"):
        return False
    if order.status not in {"accepted", "cancelled", "rejected"}:
        return False
    if db.scalar(select(DiceMagicOrderHold.id).where(DiceMagicOrderHold.order_id == order.id, DiceMagicOrderHold.resolved_at.is_(None)).limit(1)):
        return False
    closed_at = order.updated_at
    stock_closed_at = db.scalar(select(func.max(DiceMagicOrderHold.resolved_at)).where(DiceMagicOrderHold.order_id == order.id))
    if stock_closed_at:
        closed_at = max(closed_at, stock_closed_at)
    if order.status == "accepted":
        transaction = db.get(AuctionTransaction, order.transaction_id) if order.transaction_id else None
        if not transaction or transaction.status not in {"completed", "reviewed", "archived"} or not transaction.completed_at:
            return False
        closed_at = max(closed_at, transaction.updated_at, transaction.completed_at)
        if transaction.review_deadline:
            closed_at = max(closed_at, transaction.review_deadline)
    return closed_at < now - timedelta(days=days)


def preview(db, user):
    if user.role != "admin":
        raise HTTPException(403, "Adminisztrátori jogosultság szükséges.")
    orders = db.scalars(select(DiceMagicOrder).where(DiceMagicOrder.status.in_(["accepted", "cancelled", "rejected"])).order_by(DiceMagicOrder.id)).all()
    now = utcnow()
    return {"policy_approved": settings.dicemagic_retention_policy_approved,
            "retention_days": settings.dicemagic_order_retention_days,
            "items": [{"id": order.id, "status": order.status, "token": fingerprint(order)} for order in orders if eligible(db, order, now)][:100]}


def anonymize(db, user, expected, confirmed):
    if user.role != "admin":
        raise HTTPException(403, "Adminisztrátori jogosultság szükséges.")
    if not confirmed or not settings.dicemagic_retention_policy_approved or not settings.dicemagic_order_retention_days:
        raise HTTPException(409, "Jóváhagyott adatmegőrzési szabályzat és külön megerősítés szükséges.")
    orders = list(db.scalars(select(DiceMagicOrder).where(DiceMagicOrder.id.in_(expected)).order_by(DiceMagicOrder.id).with_for_update().execution_options(populate_existing=True)))
    now = utcnow()
    if len(orders) != len(expected) or any(not eligible(db, order, now) or not hmac.compare_digest(fingerprint(order), expected[order.id]) for order in orders):
        raise HTTPException(409, "A rendelés vagy az előnézet megváltozott. Készíts új előnézetet.")
    for order in orders:
        # Keep immutable idempotency, line items, totals, status and transaction links.
        order.payload = {key: value for key, value in order.payload.items() if key not in {"buyer", "billing", "delivery", "note"}}
        order.payload = {**order.payload, "_personal_data_removed_at": now.isoformat()}
        create_domain_audit_log(db, action="dicemagic_order_personal_data_removed", user_id=user.id,
                                metadata={"order_id": order.id, "retention_days": settings.dicemagic_order_retention_days})
    db.commit()
    return {"anonymized_count": len(orders)}
