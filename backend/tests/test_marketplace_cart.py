from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models.auction import Auction
from app.models.cart import Cart, CartItem, CheckoutBatch, InventoryReservation
from app.models.notification import Notification, NotificationOutbox
from app.models.security_log import AuditLog
from app.models.transaction import AuctionTransaction, AuctionTransactionItem
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
        db.execute(delete(AuctionTransactionItem)); db.execute(delete(AuctionTransaction)); db.execute(delete(InventoryReservation)); db.execute(delete(CartItem)); db.execute(delete(Cart)); db.execute(delete(CheckoutBatch))
        db.execute(delete(Auction).where(Auction.title.like("Kosár teszt%")))
        db.execute(delete(User).where(User.email.like("cart-%@auction-test.local"))); db.commit()


def test_cart_reservation_expiry_release_and_idor() -> None:
    cleanup()
    seller, first, second = user("seller"), user("first"), user("second")
    auction = listing(seller, "Kosár teszt foglalás", 3)
    try:
        created = client.post("/api/cart/items", json={"auction_id": auction.id, "quantity": 2}, headers=headers(first))
        assert created.status_code == 201, created.text
        item = created.json()["items"][0]
        expires_at = item["reservation_expires_at"]
        assert item["state"] == "reserved" and item["quantity"] == 2
        assert 3590 <= (datetime.fromisoformat(expires_at) - datetime.fromisoformat(created.json()["server_time"])).total_seconds() <= 3600
        assert client.post("/api/cart/items", json={"auction_id": auction.id, "quantity": 1}, headers=headers(seller)).status_code == 409
        resized = client.patch(f"/api/cart/items/{item['id']}", json={"quantity": 3}, headers=headers(first))
        assert resized.status_code == 200 and resized.json()["items"][0]["quantity"] == 3
        assert client.get("/api/cart", headers=headers(first)).json()["items"][0]["reservation_expires_at"] == expires_at
        blocked = client.post("/api/cart/items", json={"auction_id": auction.id, "quantity": 1}, headers=headers(second))
        assert blocked.status_code == 409
        assert client.patch(f"/api/cart/items/{item['id']}", json={"quantity": 1}, headers=headers(second)).status_code == 404
        with SessionLocal() as db:
            reservation = db.scalar(select(InventoryReservation).where(InventoryReservation.cart_item_id == item["id"]))
            reservation.starts_at = datetime.now(timezone.utc) - timedelta(minutes=61)
            reservation.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1); db.commit()
        second_cart = client.post("/api/cart/items", json={"auction_id": auction.id, "quantity": 3}, headers=headers(second))
        assert second_cart.status_code == 201, second_cart.text
        stale = client.get("/api/cart", headers=headers(first)).json()["items"][0]
        assert stale["state"] == "unavailable"
        assert client.delete(f"/api/cart/items/{second_cart.json()['items'][0]['id']}", headers=headers(second)).status_code == 200
        renewed = client.post(f"/api/cart/items/{item['id']}/reserve", headers=headers(first))
        assert renewed.status_code == 200 and renewed.json()["items"][0]["state"] == "reserved"
        assert client.post(f"/api/auctions/{auction.id}/cancel", headers=headers(seller)).status_code == 200
        assert client.get("/api/cart", headers=headers(first)).json()["items"][0]["state"] == "unavailable"
        with SessionLocal() as db:
            reservation = db.scalar(select(InventoryReservation).where(InventoryReservation.cart_item_id == item["id"]))
            assert reservation is not None and reservation.status == "released"
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


def test_postgresql_lock_allows_only_one_last_copy_reservation() -> None:
    cleanup()
    seller, first, second = user("lock-seller"), user("lock-first"), user("lock-second")
    auction = listing(seller, "Kosár teszt konkurens", 1)
    try:
        def reserve(buyer: User) -> int:
            return client.post("/api/cart/items", json={"auction_id": auction.id, "quantity": 1}, headers=headers(buyer)).status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = sorted(pool.map(reserve, [first, second]))
        assert statuses == [201, 409]
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


def test_direct_buy_respects_cart_reservation_and_consumes_own_cart_row() -> None:
    cleanup()
    seller, reserver, other = user("direct-seller"), user("direct-reserver"), user("direct-other")
    auction = listing(seller, "Kosár teszt közvetlen vétel", 2)
    try:
        added = client.post("/api/cart/items", json={"auction_id": auction.id, "quantity": 1}, headers=headers(reserver))
        assert added.status_code == 201, added.text

        blocked = client.post(f"/api/auctions/{auction.id}/bids", json={"amount": "1200.00"}, headers=headers(other))
        assert blocked.status_code == 409

        purchased = client.post(f"/api/auctions/{auction.id}/bids", json={"amount": "1200.00"}, headers=headers(reserver))
        assert purchased.status_code == 201, purchased.text
        assert client.get("/api/cart", headers=headers(reserver)).json()["items"] == []
        with SessionLocal() as db:
            reservation = db.scalar(select(InventoryReservation).where(InventoryReservation.auction_id == auction.id))
            assert reservation is not None and reservation.status == "consumed"
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
