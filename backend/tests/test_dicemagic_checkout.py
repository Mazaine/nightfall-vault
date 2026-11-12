"""Local DB regressions. Every partner HTTP operation is replaced before use."""
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4
import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, delete, func
from sqlalchemy.exc import IntegrityError
from app.core.config import settings
from app.core.security import create_access_token
from app.db.session import SessionLocal
from app.main import app
from app.models.auction import Auction
from app.models.cart import Cart, CartItem
from app.models.dicemagic import DiceMagicOrder, DiceMagicProduct, DiceMagicSyncLog, DiceMagicCheckoutAttempt
from app.models.transaction import AuctionTransaction, AuctionTransactionItem
from app.models.user import User
from app.services.dicemagic import client, state, sync_products, utcnow
from app.services.dicemagic_client import DiceMagicError
from test_dicemagic import cleanup_dicemagic_tests, item


@pytest.fixture
def env(monkeypatch):
    cleanup_dicemagic_tests()
    monkeypatch.setattr(settings, "dicemagic_enabled", True)
    monkeypatch.setattr(settings, "dicemagic_real_order_enabled", True)
    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", lambda *_: pytest.fail("Real HTTP forbidden"))
    raw = item(); raw["quantity"] = "1000"
    calls = []
    behavior = {"status": 201, "error": None}
    def send(method, path, **kwargs):
        assert (method, path) == ("POST", "orders")
        payload = kwargs["json"]; calls.append(payload)
        if behavior["error"] == "timeout":
            raise DiceMagicError("network_result_unknown")
        if behavior["status"] not in {200, 201}:
            return httpx.Response(behavior["status"], json={"error": behavior["error"], "accepted": False})
        return httpx.Response(behavior["status"], json={"accepted": True, "duplicate": behavior["status"] == 200,
            "shop_order_id": "DM-fixture-"+payload["external_order_id"], "external_order_id": payload["external_order_id"], "items_total_huf": payload["items_total_huf"]})
    monkeypatch.setattr(client, "authorized", send)
    monkeypatch.setattr(client, "products", lambda: {"type": "all", "count": 1, "generated_at": utcnow().isoformat(), "items": [dict(raw)]})
    ids = []
    with SessionLocal() as db:
        for role in ["admin", "admin", "user"]:
            marker = "dm-fixture-"+uuid4().hex[:10]
            user = User(username=marker, full_name="Fixture "+role, email=marker+"@example.com", password_hash="!", role=role, is_active=True, is_email_verified=True)
            db.add(user); db.flush(); ids.append(user.id)
        db.commit(); sync_products(db); state(db).orders_enabled = True; db.commit()
        product = db.scalar(select(DiceMagicProduct)); shop_id = product.auction_id
        now = utcnow()
        private = Auction(seller_id=ids[2], creation_key=str(uuid4()), listing_type="fixed", listing_format="single", vault_quantity=3,
            title="Private fixed fixture", description="Fixture", category="Hatalom Kártyái Kártyajáték", condition="NM", status="active",
            starting_price=0, bid_increment=1, current_price=100, buy_now_enabled=True, buy_now_price=100,
            starts_at=now-timedelta(minutes=1), ends_at=now+timedelta(days=30), seller_declaration_accepted_at=now, seller_declaration_version="fixture")
        db.add(private); db.commit(); private_id = private.id
    header = lambda uid: {"Authorization": "Bearer "+create_access_token(subject=uid)}
    api = TestClient(app)
    details = {"buyer": {"full_name": "Fixture Buyer", "email": "fixture@example.com"}, "delivery": {"method": "pickup", "recipient_name": "Fixture Buyer"},
        "billing": {"name": "Fixture Buyer", "address": {"postal_code": "1111", "city": "Fixture", "street_address": "Fixture 1", "country": "HU"}}, "confirm_real_order": True, "consent_data_transfer": True}
    fixture = SimpleNamespace(api=api, headers=header(ids[0]), other=header(ids[1]), normal=header(ids[2]), buyer_id=ids[0], shop_id=shop_id,
        private_id=private_id, raw=raw, behavior=behavior, calls=calls, details=details)
    yield fixture
    cleanup_dicemagic_tests()


def add_shop(env, quantity=2):
    result = env.api.post("/api/admin/integrations/dicemagic/cart", headers=env.headers, json={"auction_id": env.shop_id, "quantity": quantity})
    assert result.status_code == 200, result.text
    return result.json()


def prepare_mixed(env, key="mixed-fixture-key", private=True, quantity=2):
    call_count = len(env.calls)
    add_shop(env, quantity)
    if private:
        result = env.api.post("/api/cart/items", headers=env.headers, json={"auction_id": env.private_id, "quantity": 2})
        assert result.status_code == 201, result.text
    payload = {"idempotency_key": key, "shop_details": env.details, "confirm_real_order": True}
    result = env.api.post("/api/cart/checkout", headers=env.headers, json=payload)
    assert result.status_code == 200, result.text
    assert len(env.calls) == call_count  # preparation never calls the partner API
    return result.json(), payload


def send(env, order_id):
    return env.api.post(f"/api/admin/integrations/dicemagic/orders/{order_id}/send", headers=env.headers, json={"confirm_real_order": True})


def test_cart_exposes_only_own_pending_checkout_key_without_sending(env):
    result, _ = prepare_mixed(env, "resume-cart-fixture-key", private=False)
    own = env.api.get("/api/cart", headers=env.headers)
    assert own.status_code == 200
    assert own.json()["checkout_resume_key"] == "resume-cart-fixture-key"
    assert own.json()["items"][0]["state"] == "order_pending"
    for headers in (env.other, env.normal):
        response = env.api.get("/api/cart", headers=headers)
        assert response.status_code == 200
        assert response.json()["checkout_resume_key"] is None
    assert env.calls == []
    order_id = result["external_orders"][0]["id"]
    with SessionLocal() as db:
        assert db.get(DiceMagicOrder, order_id).status == "queued"
    assert send(env, order_id).status_code == 200
    assert env.api.get("/api/cart", headers=env.headers).json()["checkout_resume_key"] is None


def refresh_stock(env, stock):
    env.raw["quantity"] = str(stock)
    env.raw["in_stock"] = stock > 0
    with SessionLocal() as db:
        db.execute(delete(DiceMagicSyncLog)); state(db).last_sync_at = utcnow()-timedelta(seconds=601); db.commit(); sync_products(db)


def test_999_scoped_quantity_and_two_orders_share_existing_chat(env):
    assert env.api.post("/api/cart/items", headers=env.headers, json={"auction_id": env.private_id, "quantity": 10}).status_code == 422
    assert env.api.post("/api/admin/integrations/dicemagic/cart", headers=env.headers, json={"auction_id": env.shop_id, "quantity": 1000}).status_code == 422
    result, _ = prepare_mixed(env, "quantity-999-fixture", private=False, quantity=999)
    order_id = result["external_orders"][0]["id"]
    assert result["status"] == "pending" and result["transaction_count"] == 0
    accepted = send(env, order_id); assert accepted.status_code == 200, accepted.text
    transaction_id = accepted.json()["transaction_id"]
    assert send(env, order_id).json()["transaction_id"] == transaction_id and len(env.calls) == 1
    transactions = env.api.get("/api/transactions", headers=env.headers).json()["items"]
    first = next(row for row in transactions if row["id"] == transaction_id)
    assert first["items"][0]["quantity"] == 999 and first["status"] == "transaction_open"
    assert first["completed_at"] is None and first["seller_completed_at"] is None and first["buyer_completed_at"] is None
    assert first["partner"]["full_name"] == "DiceMagic"
    conversation_id = first["conversation_id"]
    assert env.api.get(f"/api/transactions/conversations/{conversation_id}", headers=env.other).status_code == 404
    assert env.api.post(f"/api/transactions/{transaction_id}/cancel", headers=env.headers).status_code == 409
    refresh_stock(env, 1)
    review = env.api.get(f"/api/admin/integrations/dicemagic/orders/{order_id}/reconciliation", headers=env.headers).json()
    hold = review["holds"][0]
    released = env.api.post(f"/api/admin/integrations/dicemagic/orders/{order_id}/holds/{hold['id']}/reconcile", headers=env.headers,
        json={"partner_status": "accepted", "partner_reference": "Verified partner fixture receipt", "verified_stock": 1, "snapshot_token": hold["snapshot_token"], "confirm_verified": True})
    assert released.status_code == 200, released.text
    second, _ = prepare_mixed(env, "second-fixture-order", private=False, quantity=1)
    assert send(env, second["external_orders"][0]["id"]).status_code == 200
    chat = env.api.get(f"/api/transactions/conversations/{conversation_id}", headers=env.headers).json()
    assert len(chat["transactions"]) == 2 and chat["item_count"] == 1000 and chat["total"] == 390000
    assert env.api.post(f"/api/transactions/conversations/{conversation_id}/messages", headers=env.headers, json={"message": "Fixture message"}).status_code == 201


@pytest.mark.parametrize("code,error", [(409, "price_mismatch"), (409, "out_of_stock"), (409, "in_progress"), (403, "forbidden"), (500, "server_error"), (500, "timeout")])
def test_mixed_checkout_failure_preserves_private_sale_and_stable_retry(env, code, error):
    result, payload = prepare_mixed(env)
    order_id = result["external_orders"][0]["id"]
    assert result["status"] == "partial" and result["transaction_count"] == 1 and Decimal(result["total"]) == 200
    env.behavior.update(status=code, error=error)
    response = send(env, order_id)
    assert response.status_code == 200, response.text
    response = env.api.post("/api/cart/checkout", headers=env.headers, json={"idempotency_key": payload["idempotency_key"]})
    assert response.status_code == 200 and response.json()["status"] == "partial"
    assert response.json()["transaction_count"] == 1 and len(env.calls) == 1
    assert len(env.api.get("/api/cart", headers=env.headers).json()["items"]) == 1
    if error in {"server_error", "timeout", "in_progress"}:
        with SessionLocal() as db:
            order = db.get(DiceMagicOrder, order_id); order.next_attempt_at = utcnow()-timedelta(seconds=1); db.commit()
        env.behavior.update(status=200, error=None)
        assert send(env, order_id).json()["status"] == "accepted"
        assert env.calls[0] == env.calls[1]
        completed = env.api.post("/api/cart/checkout", headers=env.headers, json=payload).json()
        assert completed["status"] == "completed" and completed["transaction_count"] == 2 and Decimal(completed["total"]) == 980
        assert env.api.get("/api/cart", headers=env.headers).json()["items"] == []


def test_normal_database_quantity_constraint_does_not_allow_ten(env):
    with SessionLocal() as db:
        cart = Cart(user_id=env.buyer_id); db.add(cart); db.flush()
        db.add(CartItem(cart_id=cart.id, auction_id=env.private_id, quantity=10, price_snapshot=100, status="active"))
        with pytest.raises(IntegrityError):
            db.flush()
        db.rollback()


def test_manual_send_permission_and_idor(env):
    result, _ = prepare_mixed(env, private=False)
    oid = result["external_orders"][0]["id"]
    assert env.api.post(f"/api/admin/integrations/dicemagic/orders/{oid}/send", headers=env.headers, json={}).status_code == 422
    assert env.api.post(f"/api/admin/integrations/dicemagic/orders/{oid}/send", headers=env.other, json={"confirm_real_order": True}).status_code == 404
    with SessionLocal() as db:
        state(db).orders_enabled = False; db.commit()
    assert send(env, oid).status_code == 409 and not env.calls


@pytest.mark.parametrize("failure", ["oversized", "stale", "changed_token", "wrong_stock", "no_confirmation", "unknown_order"])
def test_reconciliation_rejects_unverified_or_unsafe_release(env, failure):
    result, _ = prepare_mixed(env, private=False)
    oid = result["external_orders"][0]["id"]
    if failure != "unknown_order":
        assert send(env, oid).json()["status"] == "accepted"
    else:
        env.behavior.update(status=500, error="timeout"); send(env, oid)
    refresh_stock(env, 1000 if failure == "oversized" else 998)
    if failure == "stale":
        with SessionLocal() as db:
            product = db.scalar(select(DiceMagicProduct)); product.synced_at = utcnow()-timedelta(minutes=16); db.commit()
    review = env.api.get(f"/api/admin/integrations/dicemagic/orders/{oid}/reconciliation", headers=env.headers).json()
    hold = review["holds"][0]
    data = {"partner_status": "accepted", "partner_reference": "Partner fixture evidence", "verified_stock": hold["stock"], "snapshot_token": hold["snapshot_token"], "confirm_verified": True}
    if failure == "changed_token": data["snapshot_token"] = "0"*64
    if failure == "wrong_stock": data["verified_stock"] = 999
    if failure == "no_confirmation": data["confirm_verified"] = False
    response = env.api.post(f"/api/admin/integrations/dicemagic/orders/{oid}/holds/{hold['id']}/reconcile", headers=env.headers, json=data)
    assert response.status_code in {409, 422}, response.text
    with SessionLocal() as db:
        assert db.scalar(select(DiceMagicProduct)).stock_blocked and db.get(Auction, env.shop_id).shop_stock == 0


def test_reconciled_stock_ceiling_prevents_later_stale_restock(env):
    result, _ = prepare_mixed(env, private=False)
    oid = result["external_orders"][0]["id"]; send(env, oid)
    refresh_stock(env, 998)
    hold = env.api.get(f"/api/admin/integrations/dicemagic/orders/{oid}/reconciliation", headers=env.headers).json()["holds"][0]
    data = {"partner_status": "accepted", "partner_reference": "Verified stock includes partner order", "verified_stock": 998, "snapshot_token": hold["snapshot_token"], "confirm_verified": True}
    response = env.api.post(f"/api/admin/integrations/dicemagic/orders/{oid}/holds/{hold['id']}/reconcile", headers=env.headers, json=data)
    assert response.status_code == 200, response.text
    refresh_stock(env, 1000)
    with SessionLocal() as db:
        assert db.get(Auction, env.shop_id).shop_stock == 998
    refresh_stock(env, 0)
    assert add_shop_if_available(env).status_code == 409


def add_shop_if_available(env):
    return env.api.post("/api/admin/integrations/dicemagic/cart", headers=env.headers, json={"auction_id": env.shop_id, "quantity": 1})


def test_private_failure_is_separate_and_can_be_retried_without_duplicate_shop_order(env):
    add_shop(env)
    env.api.post("/api/cart/items", headers=env.headers, json={"auction_id": env.private_id, "quantity": 1})
    with SessionLocal() as db:
        db.get(Auction, env.private_id).status = "cancelled"; db.commit()
    payload = {"idempotency_key": "private-error-fixture", "shop_details": env.details, "confirm_real_order": True}
    result = env.api.post("/api/cart/checkout", headers=env.headers, json=payload).json()
    assert result["private_error"] and result["transaction_count"] == 0
    oid = result["external_orders"][0]["id"]; assert send(env, oid).json()["status"] == "accepted"
    partial = env.api.post("/api/cart/checkout", headers=env.headers, json=payload).json()
    assert partial["status"] == "partial" and partial["transaction_count"] == 1
    with SessionLocal() as db:
        db.get(Auction, env.private_id).status = "active"; db.commit()
    completed = env.api.post("/api/cart/checkout", headers=env.headers, json=payload).json()
    assert completed["status"] == "completed" and completed["transaction_count"] == 2
    assert len(env.calls) == 1


def test_concurrent_senders_create_only_one_transaction(env):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    result, _ = prepare_mixed(env, private=False)
    oid = result["external_orders"][0]["id"]
    # Both requests use the same durable row; sending state excludes the second request.
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: send(env, oid), range(2)))
    assert all(response.status_code in {200, 409} for response in responses)
    with SessionLocal() as db:
        assert db.scalar(select(func.count(AuctionTransaction.id)).where(AuctionTransaction.buyer_id == env.buyer_id)) == 1
        assert db.get(DiceMagicOrder, oid).transaction_id is not None
    assert len(env.calls) == 1


def test_partner_acceptance_before_local_failure_is_recovered_with_same_key(env, monkeypatch):
    from app.services import dicemagic_transactions
    result, _ = prepare_mixed(env, private=False)
    oid = result["external_orders"][0]["id"]
    original = dicemagic_transactions.link_accepted_order
    def fail(*_):
        raise RuntimeError("simulated local failure after external acceptance")
    monkeypatch.setattr(dicemagic_transactions, "link_accepted_order", fail)
    with pytest.raises(RuntimeError):
        send(env, oid)
    with SessionLocal() as db:
        order = db.get(DiceMagicOrder, oid)
        assert order.status == "sending" and order.transaction_id is None
        order.updated_at = utcnow()-timedelta(minutes=3); db.commit()
    monkeypatch.setattr(dicemagic_transactions, "link_accepted_order", original)
    env.behavior.update(status=200, error=None)
    accepted = send(env, oid)
    assert accepted.status_code == 200 and accepted.json()["status"] == "accepted"
    assert len(env.calls) == 2 and env.calls[0] == env.calls[1]
    with SessionLocal() as db:
        assert db.scalar(select(func.count(AuctionTransaction.id)).where(AuctionTransaction.buyer_id == env.buyer_id)) == 1


def test_demoted_admin_cannot_read_shop_transaction_or_conversation(env):
    result, _ = prepare_mixed(env, private=False)
    accepted = send(env, result["external_orders"][0]["id"]).json()
    with SessionLocal() as db:
        conversation_id = db.get(AuctionTransaction, accepted["transaction_id"]).conversation_id
        db.get(User, env.buyer_id).role = "user"; db.commit()
    assert env.api.get("/api/transactions", headers=env.headers).json()["items"] == []
    assert env.api.get(f"/api/transactions/conversations/{conversation_id}", headers=env.headers).status_code == 404
    assert env.api.get(f"/api/auctions/{env.shop_id}", headers=env.headers).status_code == 404


@pytest.mark.parametrize("new_price", ["100", "500"])
def test_shop_price_change_in_either_direction_requires_explicit_acceptance(env, new_price):
    add_shop(env)
    env.raw["price"] = new_price
    refresh_stock(env, 1000)
    cart = env.api.get("/api/cart", headers=env.headers).json()
    assert cart["items"][0]["price_changed"] and Decimal(cart["items"][0]["unit_price"]) == 390
    unchanged = env.api.post("/api/admin/integrations/dicemagic/cart", headers=env.headers, json={"auction_id": env.shop_id, "quantity": 3})
    assert unchanged.status_code == 409
    accepted = env.api.post("/api/admin/integrations/dicemagic/cart", headers=env.headers, json={"auction_id": env.shop_id, "quantity": 3, "accept_price": True})
    assert accepted.status_code == 200 and not accepted.json()["items"][0]["price_changed"]


def test_untracked_stock_stays_unknown_and_uses_partner_validation(env):
    env.raw["quantity"] = ""
    with SessionLocal() as db:
        db.execute(delete(DiceMagicSyncLog)); state(db).last_sync_at = utcnow()-timedelta(seconds=601); db.commit(); sync_products(db)
    result, _ = prepare_mixed(env, private=False, quantity=999)
    oid = result["external_orders"][0]["id"]
    assert send(env, oid).json()["status"] == "accepted"
    with SessionLocal() as db:
        db.execute(delete(DiceMagicSyncLog)); state(db).last_sync_at = utcnow()-timedelta(seconds=601); db.commit(); sync_products(db)
    hold = env.api.get(f"/api/admin/integrations/dicemagic/orders/{oid}/reconciliation", headers=env.headers).json()["holds"][0]
    assert hold["stock"] is None and hold["baseline_stock"] is None
    data = {"partner_status": "accepted", "partner_reference": "Partner confirmed untracked availability", "verified_stock": None, "snapshot_token": hold["snapshot_token"], "confirm_verified": True}
    released = env.api.post(f"/api/admin/integrations/dicemagic/orders/{oid}/holds/{hold['id']}/reconcile", headers=env.headers, json=data)
    assert released.status_code == 200, released.text
    with SessionLocal() as db:
        assert db.scalar(select(DiceMagicProduct)).stock is None
        assert db.get(Auction, env.shop_id).shop_stock is None


def test_zero_stock_reconciliation_never_reopens_sold_out_product(env):
    result, _ = prepare_mixed(env, private=False, quantity=999)
    oid = result["external_orders"][0]["id"]; send(env, oid); refresh_stock(env, 0)
    hold = env.api.get(f"/api/admin/integrations/dicemagic/orders/{oid}/reconciliation", headers=env.headers).json()["holds"][0]
    released = env.api.post(f"/api/admin/integrations/dicemagic/orders/{oid}/holds/{hold['id']}/reconcile", headers=env.headers,
        json={"partner_status": "accepted", "partner_reference": "Verified sold out partner stock", "verified_stock": 0, "snapshot_token": hold["snapshot_token"], "confirm_verified": True})
    assert released.status_code == 200, released.text
    assert add_shop_if_available(env).status_code == 409


def test_two_admin_buyers_cannot_prepare_overlapping_external_stock(env):
    from concurrent.futures import ThreadPoolExecutor
    from app.models.dicemagic import DiceMagicOrderHold
    add_shop(env)
    assert env.api.post("/api/admin/integrations/dicemagic/cart", headers=env.other, json={"auction_id": env.shop_id, "quantity": 2}).status_code == 200
    def prepare(headers):
        return env.api.post("/api/cart/checkout", headers=headers, json={"idempotency_key": "concurrent-buyers-fixture", "shop_details": env.details, "confirm_real_order": True})
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(prepare, [env.headers, env.other]))
    assert sorted(response.status_code for response in responses) == [200, 409]
    with SessionLocal() as db:
        assert db.scalar(select(func.count(DiceMagicOrder.id))) == 1
        assert db.scalar(select(func.count(DiceMagicOrderHold.id))) == 1
    assert not env.calls


def test_zen_booster_missing_details_has_no_order_or_transaction_side_effects(env, monkeypatch):
    from app.models.dicemagic import DiceMagicOrderHold
    env.raw.update(name="Zén Legendái: Varázslatok", price="690")
    refresh_stock(env, 32)
    monkeypatch.setattr(settings, "dicemagic_real_order_enabled", False)
    with SessionLocal() as db:
        state(db).orders_enabled = False
        db.commit()
    add_shop(env, 1)
    payload = {"idempotency_key": "zen-booster-checkout-fixture", "confirm_real_order": True}
    rejected = env.api.post("/api/cart/checkout", headers=env.headers, json=payload)
    assert rejected.status_code == 422
    assert "adatlap" in rejected.json()["detail"]
    with SessionLocal() as db:
        assert db.scalar(select(func.count(DiceMagicCheckoutAttempt.id))) == 0
        assert db.scalar(select(func.count(DiceMagicOrder.id))) == 0
        assert db.scalar(select(func.count(DiceMagicOrderHold.id))) == 0
        assert db.scalar(select(func.count(AuctionTransaction.id)).where(AuctionTransaction.buyer_id == env.buyer_id)) == 0
        assert db.get(Auction, env.shop_id).shop_stock == 32
    # Complete preparation works with sending disabled; partner HTTP remains absent.
    prepared = env.api.post("/api/cart/checkout", headers=env.headers, json={**payload, "shop_details": env.details})
    assert prepared.status_code == 200
    assert prepared.json()["status"] == "pending" and prepared.json()["transaction_count"] == 0
    order = prepared.json()["external_orders"][0]
    assert order["status"] == "queued" and order["transaction_id"] is None and order["total"] == 690
    assert order["items"][0]["name"] == "Zén Legendái: Varázslatok"
    assert order["items"][0]["quantity"] == 1 and order["items"][0]["unit_price_huf"] == 690
    assert env.api.post("/api/cart/checkout", headers=env.headers, json=payload).json()["external_orders"][0]["id"] == order["id"]
    assert send(env, order["id"]).status_code == 409
    monkeypatch.setattr(settings, "dicemagic_real_order_enabled", True)
    assert send(env, order["id"]).status_code == 409  # independent DB gate still enforced
    assert not env.calls


def test_recovering_unprepared_intent_requires_details_without_500_or_duplicate(env, monkeypatch):
    from app.services import dicemagic_checkout
    from fastapi import HTTPException
    add_shop(env, 1)
    original = dicemagic_checkout.prepare_order
    def unavailable(*_):
        raise HTTPException(409, "Fixture preparation interrupted")
    monkeypatch.setattr(dicemagic_checkout, "prepare_order", unavailable)
    payload = {"idempotency_key": "recover-intent-fixture", "shop_details": env.details, "confirm_real_order": True}
    assert env.api.post("/api/cart/checkout", headers=env.headers, json=payload).status_code == 409
    monkeypatch.setattr(dicemagic_checkout, "prepare_order", original)
    missing = {"idempotency_key": payload["idempotency_key"], "confirm_real_order": True}
    assert env.api.post("/api/cart/checkout", headers=env.headers, json=missing).status_code == 422
    with SessionLocal() as db:
        assert db.scalar(select(func.count(DiceMagicCheckoutAttempt.id))) == 1
        assert db.scalar(select(func.count(DiceMagicOrder.id))) == 0
    assert env.api.post("/api/cart/checkout", headers=env.headers, json=payload).status_code == 200
    with SessionLocal() as db:
        assert db.scalar(select(func.count(DiceMagicCheckoutAttempt.id))) == 1
        assert db.scalar(select(func.count(DiceMagicOrder.id))) == 1
    assert not env.calls
