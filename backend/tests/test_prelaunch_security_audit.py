"""Prelaunch security regressions; partner HTTP is always mocked.

Includes output-boundary redaction regressions.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import logging
from threading import Event
import pytest
from sqlalchemy import select

from app.core.logging_config import JsonFormatter
from app.db.session import SessionLocal
from app.models.dicemagic import DiceMagicOrder
from app.models.auction import Auction
from app.models.user import User
from app.services.dicemagic import client, utcnow
from app.services.dicemagic_client import DiceMagicError
from test_dicemagic_checkout import env, prepare_mixed, send  # noqa: F401


def test_audit_redacts_synthetic_database_credentials():
    synthetic = "AUDIT_SYNTHETIC_SECRET_NOT_REAL"
    record = logging.LogRecord("audit", logging.ERROR, __file__, 1,
        "Connection failed postgresql://audit:%s@localhost/audit_test", (synthetic,), None)
    from app.core.logging_config import RedactingFormatter
    assert synthetic not in JsonFormatter().format(record)
    assert synthetic not in RedactingFormatter("%(message)s").format(record)


@pytest.mark.parametrize("late_result", ["timeout", "malformed", "rejected", "duplicate"])
def test_late_response_preserves_accepted_retry(env, monkeypatch, late_result):
    result, _ = prepare_mixed(env, "audit-late-sender", private=False)
    order_id = result["external_orders"][0]["id"]
    entered, release = Event(), Event()
    original = client.authorized

    def slow_response(*args, **kwargs):
        entered.set()
        if not release.wait(15):
            raise AssertionError("Audit worker did not receive release")
        if late_result == "timeout":
            raise DiceMagicError("network_result_unknown")
        import httpx
        if late_result == "malformed":
            return httpx.Response(200, content=b"not-json")
        if late_result == "rejected":
            return httpx.Response(409, json={"error": "out_of_stock", "accepted": False})
        return original(*args, **kwargs)

    monkeypatch.setattr(client, "authorized", slow_response)
    with ThreadPoolExecutor(max_workers=1) as workers:
        pending = workers.submit(send, env, order_id)
        try:
            assert entered.wait(10)
            with SessionLocal() as db:
                order = db.get(DiceMagicOrder, order_id)
                order.updated_at = utcnow() - timedelta(minutes=3)
                db.commit()
            monkeypatch.setattr(client, "authorized", original)
            accepted = send(env, order_id)
            assert accepted.status_code == 200
            assert accepted.json()["status"] == "accepted"
            assert accepted.json()["transaction_id"] is not None
        finally:
            release.set()
        assert pending.result(timeout=10).status_code == 200
    with SessionLocal() as db:
        order = db.get(DiceMagicOrder, order_id)
        assert order.transaction_id == accepted.json()["transaction_id"]
        assert order.status == "accepted" and order.error is None and order.next_attempt_at is None
    calls_before = len(env.calls)
    assert send(env, order_id).json()["transaction_id"] == accepted.json()["transaction_id"]
    assert len(env.calls) == calls_before
    assert_single_acceptance(env, order_id)


@pytest.mark.parametrize("viewer", ["guest", "user", "vip", "admin"])
def test_audit_shop_visibility_and_admin_api_matrix(env, viewer):
    with SessionLocal() as db:
        normal_user = db.get(User, db.get(Auction, env.private_id).seller_id)
        normal_user.vip_expires_at = utcnow() + timedelta(days=30) if viewer == "vip" else None
        db.commit()
    headers = env.headers if viewer == "admin" else {} if viewer == "guest" else env.normal
    allowed = viewer == "admin"
    response = env.api.get(f"/api/auctions/{env.shop_id}", headers=headers)
    assert response.status_code == (200 if allowed else 404)
    listings = env.api.get("/api/auctions", headers=headers, params={"listing_type": "fixed", "limit": 100})
    assert listings.status_code == 200
    assert (env.shop_id in {row["id"] for row in listings.json()["items"]}) == allowed
    related = env.api.get(f"/api/auctions/{env.private_id}/related", headers=headers)
    assert related.status_code == 200
    assert (env.shop_id in {row["id"] for row in related.json()}) == allowed
    status = env.api.get("/api/admin/integrations/dicemagic", headers=headers)
    assert status.status_code == (200 if allowed else 401 if viewer == "guest" else 403)
    if allowed:
        # Administration returns configuration presence only, never credentials.
        body = status.json()
        assert "client_secret" not in body and "access_token" not in body and "client_id" not in body
    else:
        forbidden = env.api.post("/api/admin/integrations/dicemagic/cart", headers=headers,
            json={"auction_id": env.shop_id, "quantity": 1})
        assert forbidden.status_code == (401 if viewer == "guest" else 403)
        forbidden = env.api.post("/api/cart/items", headers=headers,
            json={"auction_id": env.shop_id, "quantity": 1})
        # The ordinary cart rejects shop items with its existing 409 domain guard.
        assert forbidden.status_code in {401, 403, 404, 409}
        if viewer != "guest":
            assert env.api.get("/api/cart", headers=headers).json()["items"] == []
    assert not env.calls


def test_audit_order_data_owner_and_demoted_admin_isolation(env):
    result, _ = prepare_mixed(env, "audit-owner-isolation", private=False)
    order_id = result["external_orders"][0]["id"]
    accepted = send(env, order_id).json()
    assert accepted["status"] == "accepted"
    with SessionLocal() as db:
        from app.models.transaction import AuctionTransaction
        transaction = db.get(AuctionTransaction, accepted["transaction_id"])
        conversation_id, auction_id = transaction.conversation_id, transaction.auction_id
    assert env.api.get("/api/admin/integrations/dicemagic/orders", headers=env.other).json() == []
    assert env.api.get(f"/api/admin/integrations/dicemagic/orders/{order_id}/reconciliation", headers=env.other).status_code == 404
    assert env.api.get(f"/api/transactions/{accepted['transaction_id']}", headers=env.other).status_code in {403, 404}
    with SessionLocal() as db:
        user = db.get(User, env.buyer_id)
        user.role = "user"
        db.commit()
    assert env.api.get(f"/api/transactions/conversations/{conversation_id}", headers=env.headers).status_code == 404
    assert env.api.get(f"/api/auctions/{auction_id}/messages", headers=env.headers).status_code == 404
    assert env.api.post(f"/api/admin/integrations/dicemagic/orders/{order_id}/send", headers=env.headers,
        json={"confirm_real_order": True}).status_code == 403
    assert len(env.calls) == 1


def test_disallowed_image_is_rejected_before_any_pillow_parser(monkeypatch):
    from io import BytesIO
    from PIL import Image
    from fastapi import HTTPException
    from app.images.validation import validate_image_upload
    buffer = BytesIO()
    Image.new("1", (8, 8)).save(buffer, format="XBM")
    monkeypatch.setattr(Image, "open", lambda *args, **kwargs: pytest.fail("Disallowed image reached Pillow"))
    with pytest.raises(HTTPException) as rejected:
        validate_image_upload(buffer.getvalue(), "image/png")
    assert rejected.value.status_code == 400
    # Benign XBM only; no slow or malicious parser payload is executed.


def assert_single_acceptance(env, order_id):
    from sqlalchemy import func
    from app.models.cart import CheckoutBatch
    from app.models.dicemagic import DiceMagicOrderHold, DiceMagicProduct
    from app.models.transaction import AuctionTransaction, AuctionTransactionItem
    from app.models.notification import Notification
    from app.models.security_log import AuditLog
    from app.models.vault import VaultPointTransaction
    with SessionLocal() as db:
        order = db.get(DiceMagicOrder, order_id)
        transaction = db.get(AuctionTransaction, order.transaction_id)
        assert db.scalar(select(func.count(AuctionTransaction.id)).where(AuctionTransaction.buyer_id == env.buyer_id)) == 1
        assert db.scalar(select(func.count(CheckoutBatch.id)).where(CheckoutBatch.buyer_id == env.buyer_id)) == 1
        assert db.scalar(select(func.count(AuctionTransactionItem.id)).where(AuctionTransactionItem.transaction_id == transaction.id)) == 1
        assert db.scalar(select(func.count(Notification.id)).where(Notification.event_key == f"dicemagic-order:{order_id}:accepted")) == 1
        assert db.scalar(select(func.count(AuditLog.id)).where(AuditLog.user_id == env.buyer_id, AuditLog.action == "dicemagic_order_accepted")) == 1
        hold = db.scalar(select(DiceMagicOrderHold).where(DiceMagicOrderHold.order_id == order_id))
        assert hold.quantity == 2 and hold.resolved_at is None
        product = db.get(DiceMagicProduct, hold.product_id)
        assert product.stock == 1000 and product.stock_blocked
        assert db.get(Auction, env.shop_id).shop_stock == 0
        assert transaction.status == "transaction_open" and transaction.completed_at is None
        assert transaction.conversation_id is not None
        assert db.scalar(select(func.count(VaultPointTransaction.id)).where(VaultPointTransaction.user_id == env.buyer_id)) == 0


@pytest.mark.parametrize("older_result", ["timeout", "rejected", "accepted"])
def test_fenced_generations_and_older_verified_success(env, monkeypatch, older_result):
    import httpx
    from threading import Lock
    result, _ = prepare_mixed(env, "audit-fenced-generations", private=False)
    order_id = result["external_orders"][0]["id"]
    entered = [Event(), Event()]
    released = [Event(), Event()]
    lock, payloads = Lock(), []
    original = client.authorized

    def interleaved(*args, **kwargs):
        with lock:
            index = len(payloads)
            payloads.append(kwargs["json"])
        assert index < 2
        entered[index].set()
        assert released[index].wait(15)
        if (index == 0 and older_result == "timeout") or (index == 1 and older_result == "accepted"):
            raise DiceMagicError("network_result_unknown")
        if index == 0 and older_result == "rejected":
            return httpx.Response(409, json={"error": "out_of_stock", "accepted": False})
        return original(*args, **kwargs)

    monkeypatch.setattr(client, "authorized", interleaved)
    with ThreadPoolExecutor(max_workers=2) as workers:
        first = workers.submit(send, env, order_id)
        try:
            assert entered[0].wait(10)
            with SessionLocal() as db:
                db.get(DiceMagicOrder, order_id).updated_at = utcnow()-timedelta(minutes=3)
                db.commit()
            second = workers.submit(send, env, order_id)
            assert entered[1].wait(10)
            released[0].set()
            first_result = first.result(timeout=10)
            assert first_result.status_code == 200
            with SessionLocal() as db:
                order = db.get(DiceMagicOrder, order_id)
                assert order.attempts == 2
                assert order.status == ("accepted" if older_result == "accepted" else "sending")
                assert order.next_attempt_at is None and order.error is None
            released[1].set()
            assert second.result(timeout=10).json()["status"] == "accepted"
        finally:
            for event in released:
                event.set()
    assert payloads[0] == payloads[1]
    assert_single_acceptance(env, order_id)


def test_simultaneous_sends_have_one_active_lease(env, monkeypatch):
    result, _ = prepare_mixed(env, "audit-simultaneous-sends", private=False)
    order_id = result["external_orders"][0]["id"]
    entered, release = Event(), Event()
    original = client.authorized

    def blocked(*args, **kwargs):
        entered.set()
        assert release.wait(15)
        return original(*args, **kwargs)

    monkeypatch.setattr(client, "authorized", blocked)
    with ThreadPoolExecutor(max_workers=3) as workers:
        first = workers.submit(send, env, order_id)
        try:
            assert entered.wait(10)
            others = [workers.submit(send, env, order_id) for _ in range(2)]
            assert [future.result(timeout=10).status_code for future in others] == [409, 409]
        finally:
            release.set()
        assert first.result(timeout=10).json()["status"] == "accepted"
    assert len(env.calls) == 1
    assert_single_acceptance(env, order_id)


def test_verified_late_success_wins_over_unreconciled_api_rejection(env, monkeypatch):
    import httpx
    result, _ = prepare_mixed(env, "audit-late-verified-success", private=False)
    order_id = result["external_orders"][0]["id"]
    entered, release = Event(), Event()
    original = client.authorized
    payloads = []

    def blocked(*args, **kwargs):
        payloads.append(kwargs["json"])
        entered.set()
        assert release.wait(15)
        return original(*args, **kwargs)

    monkeypatch.setattr(client, "authorized", blocked)
    with ThreadPoolExecutor(max_workers=1) as workers:
        first = workers.submit(send, env, order_id)
        try:
            assert entered.wait(10)
            with SessionLocal() as db:
                db.get(DiceMagicOrder, order_id).updated_at = utcnow()-timedelta(minutes=3)
                db.commit()
            def rejected(*args, **kwargs):
                payloads.append(kwargs["json"])
                return httpx.Response(409, json={"accepted": False, "error": "out_of_stock"})
            monkeypatch.setattr(client, "authorized", rejected)
            assert send(env, order_id).json()["status"] == "rejected"
        finally:
            release.set()
        assert first.result(timeout=10).json()["status"] == "accepted"
    assert payloads[0] == payloads[1]
    assert_single_acceptance(env, order_id)


def test_late_success_preserves_reconciled_cancellation_and_records_review(env, monkeypatch):
    from test_dicemagic_checkout import refresh_stock
    from app.models.security_log import AuditLog
    from app.models.transaction import AuctionTransaction
    from sqlalchemy import func
    result, _ = prepare_mixed(env, "audit-late-cancelled", private=False)
    order_id = result["external_orders"][0]["id"]
    entered, release = Event(), Event()
    original = client.authorized

    def blocked(*args, **kwargs):
        entered.set()
        assert release.wait(15)
        return original(*args, **kwargs)

    monkeypatch.setattr(client, "authorized", blocked)
    with ThreadPoolExecutor(max_workers=1) as workers:
        first = workers.submit(send, env, order_id)
        try:
            assert entered.wait(10)
            with SessionLocal() as db:
                db.get(DiceMagicOrder, order_id).updated_at = utcnow()-timedelta(minutes=3)
                db.commit()
            def timeout(*args, **kwargs):
                raise DiceMagicError("network_result_unknown")
            monkeypatch.setattr(client, "authorized", timeout)
            assert send(env, order_id).json()["status"] == "unknown"
            refresh_stock(env, 998)
            hold = env.api.get(f"/api/admin/integrations/dicemagic/orders/{order_id}/reconciliation", headers=env.headers).json()["holds"][0]
            reconciled = env.api.post(f"/api/admin/integrations/dicemagic/orders/{order_id}/holds/{hold['id']}/reconcile", headers=env.headers,
                json={"partner_status": "cancelled", "partner_reference": "Fixture verified partner cancellation", "verified_stock": 998,
                      "snapshot_token": hold["snapshot_token"], "confirm_verified": True})
            assert reconciled.status_code == 200
        finally:
            release.set()
        assert first.result(timeout=10).json()["status"] == "cancelled"
    with SessionLocal() as db:
        order = db.get(DiceMagicOrder, order_id)
        assert order.transaction_id is None and order.status == "cancelled"
        assert db.scalar(select(func.count(AuctionTransaction.id)).where(AuctionTransaction.buyer_id == env.buyer_id)) == 0
        assert db.scalar(select(func.count(AuditLog.id)).where(AuditLog.user_id == env.buyer_id, AuditLog.action == "dicemagic_late_acceptance_review")) == 1

