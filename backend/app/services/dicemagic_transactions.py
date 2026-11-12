"""Adapt an accepted partner order to the existing historical-sale/transaction model."""
from decimal import Decimal
from uuid import uuid4
from sqlalchemy import select
from app.models.auction import Auction
from app.models.cart import CheckoutBatch
from app.models.dicemagic import DiceMagicProduct
from app.models.transaction import AuctionTransaction, AuctionTransactionItem
from app.services.cart import _sold_snapshot
from app.services.transaction_conversations import ensure_transaction_conversation
from app.services.notifications import create_notification


def link_accepted_order(db, order):
    # Caller holds the order row lock. The unique FK is saved in the same commit
    # as accepted status; retry cannot create a second historical sale/transaction.
    if order.transaction_id is not None:
        return db.get(AuctionTransaction, order.transaction_id)
    if order.status != "accepted" or not order.response:
        raise ValueError("Only verified accepted orders can become transactions")
    rows = []
    for line in order.payload["items"]:
        product = db.scalar(select(DiceMagicProduct).where(DiceMagicProduct.shop_id == "dicemagic", DiceMagicProduct.outer_id == line["outer_id"]))
        if product is None:
            raise RuntimeError("Accepted order product reference missing")
        source = db.get(Auction, product.auction_id)
        sold = _sold_snapshot(db, source, order.buyer_id, line["quantity"], shop_order_key=order.external_order_id)
        sold.title = line["name"][:180]
        sold.buy_now_price = sold.current_price = Decimal(line["unit_price_huf"])
        rows.append((source, sold, line))
    batch = CheckoutBatch(buyer_id=order.buyer_id, idempotency_key="dm:"+order.external_order_id, total_amount=order.payload["items_total_huf"], seller_count=1, item_count=len(rows))
    db.add(batch)
    db.flush()
    transaction = AuctionTransaction(auction_id=rows[0][1].id, checkout_batch_id=batch.id, seller_id=rows[0][0].seller_id, buyer_id=order.buyer_id, status="transaction_open")
    db.add(transaction)
    db.flush()
    ensure_transaction_conversation(db, transaction)
    for source, sold, line in rows:
        db.add(AuctionTransactionItem(transaction_id=transaction.id, auction_id=sold.id, source_auction_id=source.id,
            quantity=line["quantity"], unit_price=line["unit_price_huf"], title_snapshot=line["name"][:180], shop_source="dicemagic"))
    order.transaction_id = transaction.id
    create_notification(db, user_id=order.buyer_id, notification_type="purchase_intent_confirmed", title="DiceMagic elfogadta a rendelést",
        message="A rendelés létrejött. A fizetést és átvételt a DiceMagic kezeli; a teljesítés még nincs igazolva.",
        target_url=f"/account/transactions/conversations/{transaction.conversation_id}", event_key=f"dicemagic-order:{order.id}:accepted")
    return transaction
