"""All HTTP is intercepted; these tests never submit real partner orders."""
import httpx
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from app.core.config import settings
from app.services.dicemagic_client import DiceMagicClient, DiceMagicError
from app.services.dicemagic import normalize
from app.schemas.dicemagic import ShopCheckout
from app.services.auction_lifecycle import can_view_auction
from app.models.auction import Auction
from app.models.user import User


@pytest.fixture(autouse=True)
def mock_configuration(monkeypatch):
    monkeypatch.setattr(settings, "dicemagic_enabled", True)
    monkeypatch.setattr(settings, "dicemagic_visibility", "admin_only")
    monkeypatch.setattr(settings, "dicemagic_client_id", "fixture-client")
    monkeypatch.setattr(settings, "dicemagic_client_secret", "fixture-secret")
    # A non-mocked HTTP path is an immediate test failure.
    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", lambda *_: pytest.fail("Real HTTP forbidden"))


def item(**changes):
    return dict(outer_id="fixture-1", product_id="p1", variant_id="v1", name="Fixture lap", type="card", quantity="3", price="390", in_stock=True, currency="HUF", graphic_type="normal", **changes)


def test_token_is_reused_and_refreshed_on_401():
    calls = []
    def handle(request):
        calls.append(request.url.path)
        if request.url.path.endswith("token"):
            return httpx.Response(200, json={"access_token": "fixture-token", "expires_in": 3600})
        return httpx.Response(401 if calls.count("/sync/v1/products") == 1 else 200, json={"items": []})
    client = DiceMagicClient(httpx.MockTransport(handle))
    client.products()
    client.products()
    assert calls.count("/sync/v1/token") == 2
    assert calls.count("/sync/v1/products") == 3


@pytest.mark.parametrize("status", [400, 401, 403, 429, 500])
def test_failed_auth_never_leaks_secrets(status):
    client = DiceMagicClient(httpx.MockTransport(lambda _: httpx.Response(status, text="secret body")))
    with pytest.raises(DiceMagicError) as exc:
        client.get_token()
    assert "secret" not in str(exc.value)


@pytest.mark.parametrize("quantity,expected", [("3", 3), ("0", 0), ("", None)])
def test_stock_semantics(quantity, expected):
    data = item(); data["quantity"] = quantity
    assert normalize(data)[0] == expected


@pytest.mark.parametrize("quantity", ["-1", "abc", "1.5", None])
def test_invalid_stock_rejects_entire_snapshot(quantity):
    data = item(); data["quantity"] = quantity
    with pytest.raises(DiceMagicError):
        normalize(data)


def test_sale_price_and_golden_are_not_invented_gfa():
    data = item(); data.update(is_action="1", action_price="250", graphic_type="golden")
    assert normalize(data)[1:] == (250, 390, None)
    data["action_price"] = ""
    assert normalize(data)[1] is None


@pytest.mark.parametrize("role", [None, "user", "tester"])
def test_non_admin_cannot_view_imported_listing(role):
    row = Auction(shop_source="dicemagic", status="active")
    assert not can_view_auction(row, User(role=role) if role else None)


def test_checkout_requires_real_confirmation_and_pickup_billing():
    with pytest.raises(ValidationError):
        ShopCheckout.model_validate({"buyer": {"full_name": "Fixture Buyer", "email": "fixture@example.com"}, "delivery": {"method": "pickup", "recipient_name": "Fixture Buyer"}})


def test_import_visibility_shared_cart_durable_order_and_stale_stock(monkeypatch):
    from datetime import timedelta
    from uuid import uuid4
    from sqlalchemy import select, delete
    from fastapi.testclient import TestClient
    from app.db.session import SessionLocal
    from app.main import app
    from app.models.cart import Cart, CartItem
    from app.models.dicemagic import DiceMagicState, DiceMagicProduct, DiceMagicOrder, DiceMagicSyncLog
    from app.models.security_log import AuditLog
    from app.core.security import create_access_token
    from app.services.dicemagic import client, sync_products, state, utcnow
    transport_calls = []
    def request(method, path, **kwargs):
        assert method == "POST" and path == "orders"
        payload = kwargs["json"]
        transport_calls.append(payload)
        return httpx.Response(201, json={"accepted": True, "duplicate": False, "external_order_id": payload["external_order_id"], "shop_order_id": "DM-fixture", "items_total_huf": payload["items_total_huf"]})
    monkeypatch.setattr(client, "authorized", request)
    monkeypatch.setattr(client, "products", lambda: {"type": "all", "count": 2, "generated_at": utcnow().isoformat(), "items": [item(), {**item(), "outer_id": "booster-fixture", "type": "booster", "quantity": "", "graphic_type": None}]})
    monkeypatch.setattr(settings, "dicemagic_real_order_enabled", True)
    marker = "dm-fixture-"+uuid4().hex[:8]
    cleanup_dicemagic_tests()
    api = TestClient(app)
    user_ids = []
    try:
        with SessionLocal() as db:
            for role in ["admin", "user"]:
                row = User(username=marker+role, full_name="Fixture", email=marker+role+"@example.com", password_hash="!", role=role, is_active=True, is_email_verified=True)
                db.add(row); db.flush(); user_ids.append(row.id)
            db.commit()
            summary = sync_products(db)
            assert summary["new"] == 2 and summary["boosters"] == 1
            booster = db.scalar(select(DiceMagicProduct).where(DiceMagicProduct.outer_id == "booster-fixture"))
            assert db.get(Auction, booster.auction_id).listing_format == "bundle"
            product = db.scalar(select(DiceMagicProduct).where(DiceMagicProduct.outer_id == "fixture-1"))
            auction_id = product.auction_id
            state(db).orders_enabled = True
            db.commit()
        admin_headers = {"Authorization": "Bearer "+create_access_token(subject=user_ids[0])}
        user_headers = {"Authorization": "Bearer "+create_access_token(subject=user_ids[1])}
        for headers in [{}, user_headers]:
            assert api.get(f"/api/auctions/{auction_id}", headers=headers).status_code == 404
            public = api.get("/api/auctions", params={"listing_type": "fixed"}, headers=headers).json()
            assert all(row["id"] != auction_id for row in (public if isinstance(public, list) else public["items"]))
        assert api.get(f"/api/auctions/{auction_id}", headers=admin_headers).status_code == 200
        bundles = api.get("/api/auctions", params={
            "listing_type": "fixed", "listing_format": "bundle",
        }, headers=admin_headers).json()["items"]
        assert any(row["listing_format"] == "bundle" and row["shop_source"] == "dicemagic" for row in bundles)
        # Booster quantities may be untracked (None): in_stock products still appear on home.
        homepage = api.get("/api/auctions/home", headers=admin_headers)
        assert homepage.status_code == 200, homepage.text
        assert any(row["id"] == booster.auction_id for row in homepage.json()["random_boosters"])
        assert homepage.json()["boosters_total"] >= 1
        singles = api.get("/api/auctions", params={
            "listing_type": "fixed", "listing_format": "single",
        }, headers=admin_headers).json()["items"]
        assert all(row["listing_format"] == "single" for row in singles)
        assert api.post("/api/admin/integrations/dicemagic/cart", headers=user_headers, json={"auction_id": auction_id, "quantity": 1}).status_code == 403
        added = api.post("/api/admin/integrations/dicemagic/cart", headers=admin_headers, json={"auction_id": auction_id, "quantity": 2})
        assert added.status_code == 200, added.text
        assert added.json()["items"][0]["shop_source"] == "dicemagic"
        address = {"postal_code": "1111", "city": "Fixture", "street_address": "Fixture 1", "country": "HU"}
        payload = {"idempotency_key": marker, "details": {"buyer": {"full_name": "Fixture Buyer", "email": "fixture@example.com"}, "delivery": {"method": "pickup", "recipient_name": "Fixture Buyer"}, "billing": {"name": "Fixture Buyer", "address": address}, "confirm_real_order": True, "consent_data_transfer": True}}
        prepared = api.post("/api/admin/integrations/dicemagic/orders/prepare", headers=admin_headers, json=payload)
        assert prepared.status_code == 200, prepared.text
        assert not transport_calls
        order_id = prepared.json()["id"]
        for _ in range(2):
            sent = api.post(f"/api/admin/integrations/dicemagic/orders/{order_id}/send", headers=admin_headers, json={"confirm_real_order": True})
            assert sent.status_code == 200 and sent.json()["status"] == "accepted", sent.text
        assert len(transport_calls) == 1
        assert "TESZTVÁSÁRLÁS" not in transport_calls[0]["note"]
        assert api.get("/api/cart", headers=admin_headers).json()["items"] == []
        with SessionLocal() as db:
            db.execute(delete(DiceMagicSyncLog))
            state(db).last_sync_at = utcnow()-timedelta(seconds=601)
            db.commit()
            assert sync_products(db)["new"] == 0
            product = db.scalar(select(DiceMagicProduct).where(DiceMagicProduct.auction_id == auction_id))
            assert product.stock == 3 and product.stock_blocked
            assert db.get(Auction, auction_id).shop_stock == 0
    finally:
        cleanup_dicemagic_tests()


def cleanup_dicemagic_tests():
    from sqlalchemy import delete, select, or_
    from app.db.session import SessionLocal
    from app.models.dicemagic import DiceMagicOrderHold, DiceMagicCheckoutAttempt, DiceMagicOrder, DiceMagicProduct, DiceMagicSyncLog, DiceMagicState
    from app.models.transaction import AuctionTransaction, AuctionTransactionItem, TransactionConversation, TransactionConversationMessage
    from app.models.cart import Cart, CartItem, CheckoutBatch, InventoryReservation
    from app.models.auction import AuctionMessage
    from app.models.notification import Notification, NotificationOutbox
    from app.models.security_log import AuditLog
    with SessionLocal() as db:
        ids = list(db.scalars(select(User.id).where(or_(User.username.like("dm-fixture-%"), User.username == "dicemagic_shop"))))
        auctions = list(db.scalars(select(Auction.id).where(Auction.seller_id.in_(ids))))
        conversations = list(db.scalars(select(TransactionConversation.id).where(or_(TransactionConversation.buyer_id.in_(ids), TransactionConversation.seller_id.in_(ids)))))
        transactions = list(db.scalars(select(AuctionTransaction.id).where(AuctionTransaction.auction_id.in_(auctions))))
        db.execute(delete(NotificationOutbox).where(NotificationOutbox.notification_id.in_(select(Notification.id).where(Notification.user_id.in_(ids)))))
        db.execute(delete(Notification).where(Notification.user_id.in_(ids)))
        db.execute(delete(AuditLog).where(or_(AuditLog.user_id.in_(ids), AuditLog.auction_id.in_(auctions))))
        db.execute(delete(DiceMagicCheckoutAttempt)); db.execute(delete(DiceMagicOrderHold)); db.execute(delete(DiceMagicOrder))
        db.execute(delete(AuctionTransactionItem).where(AuctionTransactionItem.transaction_id.in_(transactions)))
        db.execute(delete(AuctionTransaction).where(AuctionTransaction.id.in_(transactions)))
        db.execute(delete(TransactionConversationMessage).where(TransactionConversationMessage.conversation_id.in_(conversations)))
        db.execute(delete(TransactionConversation).where(TransactionConversation.id.in_(conversations)))
        db.execute(delete(InventoryReservation).where(InventoryReservation.auction_id.in_(auctions)))
        db.execute(delete(CartItem).where(CartItem.auction_id.in_(auctions)))
        db.execute(delete(Cart).where(Cart.user_id.in_(ids))); db.execute(delete(CheckoutBatch).where(CheckoutBatch.buyer_id.in_(ids)))
        db.execute(delete(DiceMagicProduct)); db.execute(delete(AuctionMessage).where(AuctionMessage.auction_id.in_(auctions)))
        db.execute(delete(Auction).where(Auction.id.in_(auctions))); db.execute(delete(User).where(User.id.in_(ids)))
        db.execute(delete(DiceMagicSyncLog)); db.execute(delete(DiceMagicState)); db.commit()



def test_public_dicemagic_rarity_controls_home_and_default_marketplace_order(monkeypatch):
    """Common/uncommon partner cards are discoverable, but never recommended on home."""
    from sqlalchemy import select
    from fastapi.testclient import TestClient
    from app.db.session import SessionLocal
    from app.main import app
    from app.models.dicemagic import DiceMagicProduct
    from app.services.dicemagic import client as partner, sync_products, utcnow

    partner_items = [
        {**item(), "outer_id": f"rarity-{rarity or 'missing'}", "product_id": f"product-{index}",
         "variant_id": f"variant-{index}", "name": f"Rarity fixture {index}",
         "rarity": rarity, "price": str(price)}
        for index, (rarity, price) in enumerate([
            ("common", 100), ("uncommon", 200), ("rare", 300),
            ("ultraRare", 400), (None, 500),
        ])
    ]
    monkeypatch.setattr(partner, "products", lambda: {
        "type": "all", "count": len(partner_items),
        "generated_at": utcnow().isoformat(), "items": partner_items,
    })
    monkeypatch.setattr(settings, "dicemagic_visibility", "public")
    cleanup_dicemagic_tests()
    api = TestClient(app)
    try:
        with SessionLocal() as db:
            sync_products(db)
            products = db.scalars(select(DiceMagicProduct)).all()
            ids = {row.snapshot["rarity"]: row.auction_id for row in products}

        home_response = api.get("/api/auctions/home")
        assert home_response.status_code == 200, home_response.text
        home_ids = {row["id"] for row in home_response.json()["random_cards"]}
        assert {ids["common"], ids["uncommon"]}.isdisjoint(home_ids)
        assert {ids["rare"], ids["ultraRare"], ids[None]}.issubset(home_ids)

        listing = api.get("/api/auctions", params={
            "listing_type": "fixed", "listing_format": "single",
            "seller": "DiceMagic", "sort": "balanced", "limit": 3,
        })
        assert listing.status_code == 200, listing.text
        assert listing.json()["total"] == 5
        assert {row["id"] for row in listing.json()["items"]} == {ids["rare"], ids["ultraRare"], ids[None]}
        second = api.get("/api/auctions", params={
            "listing_type": "fixed", "listing_format": "single",
            "seller": "DiceMagic", "sort": "balanced", "limit": 3, "offset": 3,
        })
        assert {row["id"] for row in second.json()["items"]} == {ids["common"], ids["uncommon"]}

        # A user-selected explicit price order is still authoritative.
        price_sort = api.get("/api/auctions", params={
            "listing_type": "fixed", "seller": "DiceMagic", "sort": "lowest_price",
        })
        assert [row["id"] for row in price_sort.json()["items"]][:2] == [ids["common"], ids["uncommon"]]
    finally:
        cleanup_dicemagic_tests()


def test_public_partner_listing_checkout_and_lifetime_vip(monkeypatch):
    """Public checkout uses buyer ownership, consent and one durable external order."""
    from uuid import uuid4
    from sqlalchemy import select
    from fastapi.testclient import TestClient
    from app.db.session import SessionLocal
    from app.main import app
    from app.core.security import create_access_token
    from app.models.dicemagic import DiceMagicProduct
    from app.services.dicemagic import client as partner, sync_products, state, utcnow
    from app.services.membership import is_vip
    from test_dicemagic import cleanup_dicemagic_tests

    sent = []

    def partner_send(method, path, **kwargs):
        assert method == "POST" and path == "orders"
        data = kwargs["json"]
        sent.append(data["external_order_id"])
        return httpx.Response(201, json={
            "accepted": True, "external_order_id": data["external_order_id"],
            "shop_order_id": "DM-public-fixture", "items_total_huf": data["items_total_huf"],
        })

    monkeypatch.setattr(partner, "authorized", partner_send)
    monkeypatch.setattr(partner, "products", lambda: {
        "type": "all", "count": 1, "generated_at": utcnow().isoformat(),
        "items": [item()],
    })
    monkeypatch.setattr(settings, "dicemagic_real_order_enabled", True)
    suffix = uuid4().hex[:12]
    cleanup_dicemagic_tests()
    api = TestClient(app)
    try:
        with SessionLocal() as db:
            users = []
            for index in range(2):
                buyer = User(
                    username=f"dm-fixture-public-{index}-{suffix}",
                    full_name="Public Buyer",
                    email=f"dm-fixture-public-{index}-{suffix}@example.com",
                    password_hash="!", role="user", is_active=True,
                    is_email_verified=True,
                )
                db.add(buyer)
                db.flush()
                users.append(buyer.id)
            admin = User(
                username=f"dm-fixture-admin-{suffix}", full_name="Partner Admin",
                email=f"dm-fixture-admin-{suffix}@example.com", password_hash="!",
                role="admin", is_active=True, is_email_verified=True,
            )
            db.add(admin)
            db.flush()
            admin_id = admin.id
            db.commit()
            sync_products(db)
            product = db.scalar(select(DiceMagicProduct).where(DiceMagicProduct.outer_id == "fixture-1"))
            auction_id = product.auction_id
            seller = db.get(Auction, auction_id).seller
            assert seller.vip_lifetime is True and is_vip(seller)
            assert seller.vip_expires_at is None
            state(db).orders_enabled = True
            db.commit()
        buyer_headers = {"Authorization": "Bearer " + create_access_token(subject=users[0])}
        other_headers = {"Authorization": "Bearer " + create_access_token(subject=users[1])}
        admin_headers = {"Authorization": "Bearer " + create_access_token(subject=admin_id)}
        assert api.get(f"/api/auctions/{auction_id}").status_code == 404
        assert api.get("/api/users/dicemagic_shop").status_code == 404
        assert api.post("/api/shop/dicemagic/cart", headers=buyer_headers,
                        json={"auction_id": auction_id, "quantity": 1}).status_code == 404

        monkeypatch.setattr(settings, "dicemagic_visibility", "public")
        assert api.get(f"/api/auctions/{auction_id}").status_code == 200
        assert api.get("/api/users/dicemagic_shop").status_code == 200
        assert any(row["id"] == auction_id for row in api.get("/api/auctions", params={"listing_type": "fixed"}).json()["items"])
        assert api.get("/api/shop/dicemagic/status", headers=buyer_headers).json()["enabled"] is True
        assert api.post("/api/admin/integrations/dicemagic/cart", headers=buyer_headers,
                        json={"auction_id": auction_id, "quantity": 1}).status_code == 403

        added = api.post("/api/shop/dicemagic/cart", headers=buyer_headers, json={
            "auction_id": auction_id, "quantity": 2,
        })
        assert added.status_code == 200, added.text
        entry = added.json()["items"][0]
        assert entry["shop_source"] == "dicemagic"
        assert entry["quantity"] == 2
        assert entry["max_quantity"] == 3
        overstock = api.post("/api/shop/dicemagic/cart", headers=buyer_headers, json={
            "auction_id": auction_id, "quantity": 4,
        })
        assert overstock.status_code == 422
        assert api.get("/api/cart", headers=buyer_headers).json()["items"][0]["quantity"] == 2
        assert api.get("/api/cart", headers=buyer_headers).json()["item_count"] == 1
        assert api.get("/api/cart", headers=other_headers).json()["item_count"] == 0

        address = {"postal_code": "1111", "city": "Fixture", "street_address": "Fixture 1"}
        details = {
            "buyer": {"full_name": "Public Buyer", "email": "public@example.com"},
            "delivery": {"method": "pickup", "recipient_name": "Public Buyer"},
            "billing": {"name": "Public Buyer", "address": address},
            "confirm_real_order": True, "consent_data_transfer": True,
        }
        idem = "pub-" + suffix
        test_order = api.post("/api/cart/checkout", headers=buyer_headers, json={
            "idempotency_key": idem, "item_ids": [entry["id"]],
            "shop_details": {**details, "test_order": True}, "confirm_real_order": True,
        })
        assert test_order.status_code == 422
        prepared = api.post("/api/cart/checkout", headers=buyer_headers, json={
            "idempotency_key": idem, "item_ids": [entry["id"]],
            "shop_details": details, "confirm_real_order": True,
        })
        assert prepared.status_code == 200, prepared.text
        order_id = prepared.json()["external_orders"][0]["id"]
        assert not sent
        assert api.post(f"/api/shop/dicemagic/orders/{order_id}/send",
                        headers=other_headers, json={"confirm_real_order": True}).status_code == 404
        assert api.post(f"/api/shop/dicemagic/orders/{order_id}/send",
                        headers=buyer_headers, json={"confirm_real_order": False}).status_code == 422
        # Staff can safely submit a buyer-owned order under its original buyer ID.
        delivered = api.post(f"/api/admin/integrations/dicemagic/orders/{order_id}/send",
                             headers=admin_headers, json={"confirm_real_order": True})
        assert delivered.status_code == 200, delivered.text
        assert delivered.json()["status"] == "accepted"
        # Buyer endpoint keeps ownership and idempotent accepted-order reads.
        buyer_delivered = api.post(f"/api/shop/dicemagic/orders/{order_id}/send",
                                   headers=buyer_headers, json={"confirm_real_order": True})
        assert buyer_delivered.status_code == 200, buyer_delivered.text
        assert buyer_delivered.json()["status"] == "accepted"
        again = api.post(f"/api/shop/dicemagic/orders/{order_id}/send",
                         headers=buyer_headers, json={"confirm_real_order": True})
        assert again.status_code == 200 and len(sent) == 1
        assert api.get("/api/cart", headers=buyer_headers).json()["item_count"] == 0
        # Staff must be able to see and reconcile external orders created by
        # normal buyers; customers still cannot reach the admin endpoints.
        admin_orders = api.get("/api/admin/integrations/dicemagic/orders", headers=admin_headers)
        assert admin_orders.status_code == 200
        assert any(order["id"] == order_id and order["buyer_id"] == users[0] for order in admin_orders.json())
        reconciliations = api.get(
            f"/api/admin/integrations/dicemagic/orders/{order_id}/reconciliation",
            headers=admin_headers,
        )
        assert reconciliations.status_code == 200, reconciliations.text
        assert reconciliations.json()["holds"]
        assert api.get(
            f"/api/admin/integrations/dicemagic/orders/{order_id}/reconciliation",
            headers=buyer_headers,
        ).status_code == 403
    finally:
        cleanup_dicemagic_tests()
