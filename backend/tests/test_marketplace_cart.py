from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models.auction import Auction, AuctionMessage
from app.models.cart import Cart, CartItem, CheckoutBatch, InventoryReservation
from app.models.notification import Notification, NotificationOutbox
from app.models.security_log import AuditLog
from app.models.transaction import AuctionTransaction, AuctionTransactionItem, TransactionConversation, TransactionConversationMessage
from app.models.user import User

client = TestClient(app)


def headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(subject=user.id)}"}


def user(label: str) -> User:
    with SessionLocal() as db:
        row = User(email=f"cart-{label}-{uuid4().hex[:8]}@auction-test.local", username=f"cart-{label}-{uuid4().hex[:8]}", full_name=f"Cart {label}", password_hash=hash_password("CartTest123!"), role="user", is_active=True, is_email_verified=True)
        db.add(row); db.commit(); db.refresh(row); return row


def listing(seller: User, title: str, quantity: int = 3, *, bundle: bool = False) -> Auction:
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        row = Auction(seller_id=seller.id, creation_key=str(uuid4()), listing_type="fixed", listing_format="bundle" if bundle else "single", vault_external_card_id=str(10000 + quantity), vault_print_variant="normal", vault_quantity=None if bundle else quantity, title=title, description="Kosár integrációs teszthirdetés.", category="Hatalom Kártyái Kártyajáték", condition="NM", status="active", starting_price=Decimal("0"), bid_increment=Decimal("1200"), current_price=Decimal("1200"), buy_now_enabled=True, buy_now_price=Decimal("1200"), starts_at=now - timedelta(minutes=1), ends_at=now + timedelta(days=30), five_minute_rule_enabled=False, seller_declaration_accepted_at=now, seller_declaration_version="2026-07-11")
        db.add(row); db.commit(); db.refresh(row); return row


def cleanup() -> None:
    with SessionLocal() as db:
        db.execute(delete(NotificationOutbox)); db.execute(delete(Notification)); db.execute(delete(AuditLog))
        db.execute(delete(TransactionConversationMessage)); db.execute(delete(AuctionMessage)); db.execute(delete(AuctionTransactionItem)); db.execute(delete(AuctionTransaction)); db.execute(delete(TransactionConversation)); db.execute(delete(InventoryReservation)); db.execute(delete(CartItem)); db.execute(delete(Cart)); db.execute(delete(CheckoutBatch))
        db.execute(delete(Auction).where(Auction.title.like("Kosár teszt%")))
        db.execute(delete(User).where(User.email.like("cart-%@auction-test.local"))); db.commit()


def test_cart_does_not_reserve_inventory_and_keeps_idor_protection() -> None:
    cleanup()
    seller, first, second = user("seller"), user("first"), user("second")
    auction = listing(seller, "Kosár teszt foglalás", 3)
    try:
        created = client.post("/api/cart/items", json={"auction_id": auction.id, "quantity": 2}, headers=headers(first))
        assert created.status_code == 201, created.text
        item = created.json()["items"][0]
        assert item["state"] == "available" and item["quantity"] == 2
        assert item["reservation_expires_at"] is None
        assert client.post("/api/cart/items", json={"auction_id": auction.id, "quantity": 1}, headers=headers(seller)).status_code == 409
        resized = client.patch(f"/api/cart/items/{item['id']}", json={"quantity": 3}, headers=headers(first))
        assert resized.status_code == 200 and resized.json()["items"][0]["quantity"] == 3
        blocked = client.post("/api/cart/items", json={"auction_id": auction.id, "quantity": 1}, headers=headers(second))
        assert blocked.status_code == 201
        assert client.patch(f"/api/cart/items/{item['id']}", json={"quantity": 1}, headers=headers(second)).status_code == 404
        with SessionLocal() as db:
            reservation = db.scalar(select(InventoryReservation).where(InventoryReservation.cart_item_id == item["id"]))
            assert reservation is None
        assert client.post(f"/api/auctions/{auction.id}/cancel", headers=headers(seller)).status_code == 200
        assert client.get("/api/cart", headers=headers(first)).json()["items"][0]["state"] == "listing_removed"
    finally:
        cleanup()


def test_multi_seller_checkout_is_atomic_grouped_and_idempotent() -> None:
    cleanup()
    seller_a, seller_b, buyer = user("seller-a"), user("seller-b"), user("buyer")
    first = listing(seller_a, "Kosár teszt A", 2)
    second = listing(seller_b, "Kosár teszt B", 1)
    try:
        assert client.post("/api/cart/items", json={"auction_id": first.id, "quantity": 1}, headers=headers(buyer)).status_code == 201
        assert client.post("/api/cart/items", json={"auction_id": second.id, "quantity": 1}, headers=headers(buyer)).status_code == 201
        payload = {"idempotency_key": "cart-test-idempotency-key"}
        response = client.post("/api/cart/checkout", json=payload, headers=headers(buyer))
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["transaction_count"] == 2 and result["seller_count"] == 2 and result["item_count"] == 2
        repeated = client.post("/api/cart/checkout", json=payload, headers=headers(buyer))
        assert repeated.status_code == 200 and repeated.json()["checkout_batch_id"] == result["checkout_batch_id"]
        assert client.get("/api/cart", headers=headers(buyer)).json()["items"] == []
        with SessionLocal() as db:
            assert len(db.scalars(select(AuctionTransaction).where(AuctionTransaction.checkout_batch_id == result["checkout_batch_id"])).all()) == 2
            assert len(db.scalars(select(AuctionTransactionItem)).all()) == 2
            assert len(db.scalars(select(Notification).where(Notification.type.in_(["purchase_intent_created", "purchase_intent_confirmed"]))).all()) == 3
    finally:
        cleanup()


def test_two_buyers_can_cart_last_copy_but_only_one_can_checkout() -> None:
    cleanup()
    seller, first, second = user("lock-seller"), user("lock-first"), user("lock-second")
    auction = listing(seller, "Kosár teszt konkurens", 1)
    try:
        def reserve(buyer: User) -> int:
            return client.post("/api/cart/items", json={"auction_id": auction.id, "quantity": 1}, headers=headers(buyer)).status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = sorted(pool.map(reserve, [first, second]))
        assert statuses == [201, 201]
        def checkout(buyer: User, suffix: str) -> int:
            return client.post("/api/cart/checkout", json={"idempotency_key": f"cart-race-{suffix}-key"}, headers=headers(buyer)).status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            checkout_statuses = sorted(pool.map(lambda pair: checkout(*pair), [(first, "first"), (second, "second")]))
        assert checkout_statuses == [200, 409]
    finally:
        cleanup()


def test_cancelled_grouped_transaction_restores_partial_listing_quantity() -> None:
    cleanup()
    seller, buyer = user("cancel-seller"), user("cancel-buyer")
    auction = listing(seller, "Kosár teszt meghiúsulás", 2)
    try:
        assert client.post("/api/cart/items", json={"auction_id": auction.id, "quantity": 1}, headers=headers(buyer)).status_code == 201
        checked = client.post("/api/cart/checkout", json={"idempotency_key": "cart-cancel-idempotency"}, headers=headers(buyer))
        assert checked.status_code == 200, checked.text
        transaction_id = checked.json()["transactions"][0]["id"]
        cancelled = client.post(f"/api/transactions/{transaction_id}/cancel", headers=headers(buyer))
        assert cancelled.status_code == 200, cancelled.text
        assert cancelled.json()["status"] == "cancelled"
        with SessionLocal() as db:
            source = db.get(Auction, auction.id)
            assert source.status == "active" and source.vault_quantity == 2
    finally:
        cleanup()


def test_partial_then_full_quantity_checkout_updates_listing_and_transaction_items() -> None:
    cleanup()
    seller, first, second = user("quantity-seller"), user("quantity-first"), user("quantity-second")
    auction = listing(seller, "Kosár teszt mennyiség", 3)
    try:
        assert client.post("/api/cart/items", json={"auction_id": auction.id, "quantity": 2}, headers=headers(first)).status_code == 201
        partial = client.post("/api/cart/checkout", json={"idempotency_key": "cart-quantity-partial"}, headers=headers(first))
        assert partial.status_code == 200, partial.text
        with SessionLocal() as db:
            source = db.get(Auction, auction.id)
            item = db.scalar(select(AuctionTransactionItem).where(AuctionTransactionItem.source_auction_id == auction.id))
            assert source.status == "active" and source.vault_quantity == 1
            assert item is not None and item.quantity == 2 and item.unit_price == Decimal("1200")
            assert item.quantity * item.unit_price == Decimal("2400")
        partial_detail = client.get(f"/api/auctions/{auction.id}")
        assert partial_detail.status_code == 200 and partial_detail.json()["available_quantity"] == 1

        assert client.post("/api/cart/items", json={"auction_id": auction.id, "quantity": 1}, headers=headers(second)).status_code == 201
        final = client.post("/api/cart/checkout", json={"idempotency_key": "cart-quantity-final"}, headers=headers(second))
        assert final.status_code == 200, final.text
        with SessionLocal() as db:
            source = db.get(Auction, auction.id)
            quantities = sorted(db.scalars(select(AuctionTransactionItem.quantity).where(AuctionTransactionItem.source_auction_id == auction.id)).all())
            assert source.status == "sold" and source.vault_quantity is None
            assert quantities == [1, 2]
        sold_detail = client.get(f"/api/auctions/{auction.id}")
        assert sold_detail.status_code == 200 and sold_detail.json()["available_quantity"] == 0
    finally:
        cleanup()


def test_sold_listing_never_exposes_stale_quantity_as_available() -> None:
    cleanup()
    seller, buyer = user("stale-seller"), user("stale-buyer")
    auction = listing(seller, "Kosár teszt régi eladott készlet", 1)
    try:
        with SessionLocal() as db:
            row = db.get(Auction, auction.id)
            row.status = "sold"; row.winner_id = buyer.id; row.finalized_at = datetime.now(timezone.utc); row.vault_quantity = 1
            db.commit()
        detail = client.get(f"/api/auctions/{auction.id}")
        assert detail.status_code == 200
        assert detail.json()["vault_quantity"] == 1
        assert detail.json()["available_quantity"] == 0
    finally:
        cleanup()


def test_partner_conversation_joins_purchases_keeps_legacy_messages_and_isolates_outsiders() -> None:
    cleanup()
    seller, buyer, outsider, other_seller = user("conversation-seller"), user("conversation-buyer"), user("conversation-outsider"), user("conversation-other")
    first = listing(seller, "Kosár teszt közös chat A", 1)
    second = listing(seller, "Kosár teszt közös chat B", 1)
    third = listing(other_seller, "Kosár teszt külön chat", 1)
    try:
        transaction_ids: list[int] = []
        for index, auction in enumerate((first, second), start=1):
            assert client.post("/api/cart/items", json={"auction_id": auction.id, "quantity": 1}, headers=headers(buyer)).status_code == 201
            checked = client.post("/api/cart/checkout", json={"idempotency_key": f"conversation-checkout-{index}"}, headers=headers(buyer))
            assert checked.status_code == 200, checked.text
            transaction_ids.append(checked.json()["transactions"][0]["id"])
        assert client.post("/api/cart/items", json={"auction_id": third.id, "quantity": 1}, headers=headers(buyer)).status_code == 201
        other_checked = client.post("/api/cart/checkout", json={"idempotency_key": "conversation-checkout-other"}, headers=headers(buyer))
        assert other_checked.status_code == 200
        with SessionLocal() as db:
            transactions = list(db.scalars(select(AuctionTransaction).where(AuctionTransaction.id.in_(transaction_ids)).order_by(AuctionTransaction.id)).all())
            assert transactions[0].conversation_id == transactions[1].conversation_id
            conversation_id = int(transactions[0].conversation_id)
            other_transaction = db.get(AuctionTransaction, other_checked.json()["transactions"][0]["id"])
            assert other_transaction.conversation_id != conversation_id
            other_conversation_id = int(other_transaction.conversation_id)
            db.add_all([
                AuctionMessage(auction_id=transactions[0].auction_id, sender_id=seller.id, message="Régi első hirdetés üzenete"),
                AuctionMessage(auction_id=transactions[1].auction_id, sender_id=buyer.id, message="Régi második hirdetés üzenete"),
            ])
            db.commit()
        buyer_view = client.get(f"/api/transactions/conversations/{conversation_id}", headers=headers(buyer))
        assert buyer_view.status_code == 200, buyer_view.text
        assert len(buyer_view.json()["transactions"]) == 2
        assert [message["source"] for message in buyer_view.json()["messages"]] == ["legacy", "legacy"]
        assert {message["auction_title"] for message in buyer_view.json()["messages"]} == {"Kosár teszt közös chat A", "Kosár teszt közös chat B"}
        posted = client.post(f"/api/transactions/conversations/{conversation_id}/messages", json={"message": "Közös egyeztetés üzenete"}, headers=headers(buyer))
        assert posted.status_code == 201, posted.text
        assert [message["message"] for message in posted.json()["messages"]].count("Közös egyeztetés üzenete") == 1
        seller_view = client.get(f"/api/transactions/conversations/{conversation_id}", headers=headers(seller))
        assert seller_view.status_code == 200 and seller_view.json()["messages"][-1]["message"] == "Közös egyeztetés üzenete"
        assert client.get(f"/api/transactions/conversations/{conversation_id}", headers=headers(outsider)).status_code == 404
        assert client.get(f"/api/transactions/conversations/{other_conversation_id}", headers=headers(seller)).status_code == 404
    finally:
        cleanup()


def test_owner_can_cancel_bundle_idempotently_and_carts_see_removed_listing() -> None:
    cleanup()
    seller, buyer = user("bundle-cancel-seller"), user("bundle-cancel-buyer")
    bundle = listing(seller, "Kosár teszt megszakítható csomag", 1, bundle=True)
    try:
        assert client.post("/api/cart/items", json={"auction_id": bundle.id, "quantity": 1}, headers=headers(buyer)).status_code == 201
        assert client.post(f"/api/auctions/{bundle.id}/cancel", headers=headers(buyer)).status_code == 403
        first = client.post(f"/api/auctions/{bundle.id}/cancel", headers=headers(seller))
        repeated = client.post(f"/api/auctions/{bundle.id}/cancel", headers=headers(seller))
        assert first.status_code == 200 and first.json()["status"] == "cancelled"
        assert repeated.status_code == 200 and repeated.json()["status"] == "cancelled"
        assert client.get("/api/cart", headers=headers(buyer)).json()["items"][0]["state"] == "listing_removed"
        public = client.get("/api/auctions?listing_type=fixed&listing_format=bundle").json()
        assert all(item["id"] != bundle.id for item in public["items"])
    finally:
        cleanup()


def test_bundle_is_indivisible_and_failed_checkout_rolls_back_every_seller() -> None:
    cleanup()
    seller_a, seller_b, buyer = user("atomic-a"), user("atomic-b"), user("atomic-buyer")
    bundle = listing(seller_a, "Kosár teszt csomag", 1, bundle=True)
    single = listing(seller_b, "Kosár teszt rollback", 1)
    try:
        assert client.post("/api/cart/items", json={"auction_id": bundle.id, "quantity": 2}, headers=headers(buyer)).status_code == 422
        assert client.post("/api/cart/items", json={"auction_id": bundle.id, "quantity": 1}, headers=headers(buyer)).status_code == 201
        assert client.post("/api/cart/items", json={"auction_id": single.id, "quantity": 1}, headers=headers(buyer)).status_code == 201
        with SessionLocal() as db:
            row = db.get(Auction, single.id); row.status = "cancelled"; db.commit()
        failed = client.post("/api/cart/checkout", json={"idempotency_key": "cart-atomic-rollback"}, headers=headers(buyer))
        assert failed.status_code == 409
        with SessionLocal() as db:
            assert db.scalar(select(CheckoutBatch).where(CheckoutBatch.idempotency_key == "cart-atomic-rollback")) is None
            assert db.get(Auction, bundle.id).status == "active"
    finally:
        cleanup()


def test_legacy_fixed_price_bid_endpoint_is_rejected_without_consuming_inventory() -> None:
    cleanup()
    seller, reserver, other = user("direct-seller"), user("direct-reserver"), user("direct-other")
    auction = listing(seller, "Kosár teszt közvetlen vétel", 2)
    try:
        added = client.post("/api/cart/items", json={"auction_id": auction.id, "quantity": 1}, headers=headers(reserver))
        assert added.status_code == 201, added.text

        purchased = client.post(f"/api/auctions/{auction.id}/bids", json={"amount": "1200.00"}, headers=headers(other))
        assert purchased.status_code == 409
        assert "kosár-véglegesítéssel" in purchased.json()["detail"]
        assert client.get("/api/cart", headers=headers(reserver)).json()["items"][0]["state"] == "available"
        with SessionLocal() as db:
            reservation = db.scalar(select(InventoryReservation).where(InventoryReservation.auction_id == auction.id))
            assert reservation is None
    finally:
        cleanup()


def test_cart_requires_higher_price_approval_and_applies_lower_price_automatically() -> None:
    cleanup()
    seller, buyer = user("price-seller"), user("price-buyer")
    auction = listing(seller, "Kosár teszt árváltozás", 2)
    try:
        added = client.post("/api/cart/items", json={"auction_id": auction.id, "quantity": 1}, headers=headers(buyer))
        assert added.status_code == 201
        item_id = added.json()["items"][0]["id"]
        with SessionLocal() as db:
            row = db.get(Auction, auction.id)
            row.current_price = row.buy_now_price = Decimal("1500")
            db.commit()
        changed = client.get("/api/cart", headers=headers(buyer)).json()["items"][0]
        assert changed["price_changed"] is True and changed["unit_price"] == "1200.00"
        assert client.patch(f"/api/cart/items/{item_id}", json={"quantity": 1}, headers=headers(buyer)).status_code == 409
        accepted = client.patch(f"/api/cart/items/{item_id}", json={"quantity": 1, "accept_price": True}, headers=headers(buyer))
        assert accepted.status_code == 200 and accepted.json()["items"][0]["unit_price"] == "1500.00"
        with SessionLocal() as db:
            row = db.get(Auction, auction.id)
            row.current_price = row.buy_now_price = Decimal("900")
            db.commit()
        cheaper = client.get("/api/cart", headers=headers(buyer)).json()["items"][0]
        assert cheaper["price_changed"] is False and cheaper["unit_price"] == "900.00"
    finally:
        cleanup()
