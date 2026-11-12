"""Durable mixed-cart preparation. External sending remains a separate admin action."""
from decimal import Decimal
from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from app.models.cart import Cart, CartItem, CheckoutBatch
from app.models.dicemagic import DiceMagicCheckoutAttempt, DiceMagicOrder
from app.models.transaction import AuctionTransaction
from app.services.dicemagic import prepare_order, order_read


def checkout_with_shop(db, user, key, item_ids, details, confirmed, private_checkout):
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": f"mixed-checkout:{user.id}:{key}"})
    attempt = db.scalar(select(DiceMagicCheckoutAttempt).where(DiceMagicCheckoutAttempt.buyer_id == user.id, DiceMagicCheckoutAttempt.idempotency_key == key).with_for_update())
    query = select(CartItem).join(Cart).where(Cart.user_id == user.id, CartItem.status == "active")
    if item_ids is not None:
        query = query.where(CartItem.id.in_(item_ids))
    # Classification is read-only. Let the original checkout acquire its own
    # locks; taking cart-item locks here would reverse its established order.
    items = list(db.scalars(query.order_by(CartItem.id)).all())
    shop = [row for row in items if row.auction.shop_source]
    if not shop and attempt is None:
        return private_checkout(db, user, key, item_ids)
    if user.role != "admin":
        raise HTTPException(404, "A bolti termék nem található.")
    if attempt is None:
        if not details or not confirmed:
            raise HTTPException(422, "A bolti rendeléshez vásárlási adatlap és külön megerősítés szükséges.")
        private = [row for row in items if not row.auction.shop_source]
        attempt = DiceMagicCheckoutAttempt(buyer_id=user.id, idempotency_key=key,
            private_item_ids=[row.id for row in private], shop_item_ids=[row.id for row in shop],
            shop_snapshots=[{"id": row.id, "quantity": row.quantity, "price": str(row.price_snapshot)} for row in shop],
            private_snapshots=[{"id": row.id, "quantity": row.quantity, "price": str(row.price_snapshot)} for row in private])
        db.add(attempt)
        db.commit()
    if attempt.shop_order_id is None:
        # Recover preparation committed before a process failure; never allocate a new key.
        order = db.scalar(select(DiceMagicOrder).where(DiceMagicOrder.buyer_id == user.id, DiceMagicOrder.idempotency_key == key))
        if order is None:
            if not details or not confirmed:
                raise HTTPException(422, "A bolti rendeléshez vásárlási adatlap és külön megerősítés szükséges.")
            selected = list(db.scalars(select(CartItem).join(Cart).where(Cart.user_id == user.id, CartItem.id.in_(attempt.shop_item_ids), CartItem.status == "active").order_by(CartItem.id).with_for_update()).all())
            if len(selected) != len(attempt.shop_item_ids):
                raise HTTPException(409, "A bolti kosár megváltozott. Készíts új összesítőt.")
            snapshots = {row["id"]: row for row in attempt.shop_snapshots}
            if any(row.quantity != snapshots[row.id]["quantity"] or row.price_snapshot != Decimal(snapshots[row.id]["price"]) for row in selected):
                raise HTTPException(409, "A bolti darabszám vagy ár megváltozott. Új összesítő szükséges.")
            order = prepare_order(db, user, key, selected, details)
        attempt.shop_order_id = order.id
        db.commit()
    if attempt.private_item_ids and attempt.private_result is None:
        try:
            existing_batch = db.scalar(select(CheckoutBatch.id).where(CheckoutBatch.buyer_id == user.id, CheckoutBatch.idempotency_key == key))
            if not existing_batch:
                rows = {row.id: row for row in db.scalars(select(CartItem).join(Cart).where(Cart.user_id == user.id, CartItem.id.in_(attempt.private_item_ids)).with_for_update()).all()}
                for snapshot in attempt.private_snapshots:
                    row = rows.get(snapshot["id"])
                    if row is None or row.status != "active" or row.quantity != snapshot["quantity"] or row.price_snapshot != Decimal(snapshot["price"]):
                        raise HTTPException(409, "A magáneladós kosár megváltozott. Új összesítő szükséges.")
            result = private_checkout(db, user, key, attempt.private_item_ids)
            attempt.private_result, attempt.private_error = jsonable_encoder(result), None
            db.commit()
        except (HTTPException, SQLAlchemyError) as exc:
            db.rollback()
            attempt.private_error = str(exc.detail)[:300] if isinstance(exc, HTTPException) else "A belső véglegesítés átmenetileg nem elérhető. Ugyanazzal az azonosítóval újrapróbálható."
            db.commit()
    external = order_read(db.get(DiceMagicOrder, attempt.shop_order_id))
    private = attempt.private_result
    transactions = list(private["transactions"]) if private else []
    total = Decimal(str(private["total"])) if private else Decimal(0)
    item_count = private["item_count"] if private else 0
    seller_count = private["seller_count"] if private else 0
    if external["status"] == "accepted" and external["transaction_id"]:
        transaction = db.get(AuctionTransaction, external["transaction_id"])
        transactions.append({"id": transaction.id, "seller_id": transaction.seller_id, "auction_id": transaction.auction_id, "item_count": len(transaction.items)})
        total += Decimal(external["total"])
        item_count += len(external["items"])
        seller_count += 1
    all_done = external["status"] == "accepted" and bool(external["transaction_id"]) and (not attempt.private_item_ids or private is not None)
    return {"checkout_batch_id": private["checkout_batch_id"] if private else 0,
        "transaction_count": len(transactions), "seller_count": seller_count, "item_count": item_count,
        "total": total, "transactions": transactions, "external_orders": [external],
        "private_error": attempt.private_error, "status": "completed" if all_done else "partial" if transactions else "pending"}
