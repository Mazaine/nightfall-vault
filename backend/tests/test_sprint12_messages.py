from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.notification import Notification
from app.models.transaction import AuctionTransaction
from test_auction_domain import auth_headers, cleanup_test_data, client, create_sold_auction, create_test_user


def test_only_seller_and_winner_see_closed_auction_conversation() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-conversation@auction-test.local")
    winner = create_test_user("winner-conversation@auction-test.local")
    outsider = create_test_user("outsider-conversation@auction-test.local")
    admin = create_test_user("admin-conversation@auction-test.local", role="admin")
    sold = create_sold_auction(seller, winner, admin)

    seller_items = client.get("/api/auctions/me/conversations", headers=auth_headers(seller))
    winner_items = client.get("/api/auctions/me/conversations", headers=auth_headers(winner))
    outsider_items = client.get("/api/auctions/me/conversations", headers=auth_headers(outsider))

    assert seller_items.status_code == 200
    assert winner_items.status_code == 200
    assert outsider_items.status_code == 200
    assert outsider_items.json() == []
    assert seller_items.json()[0]["auction_id"] == sold["id"]
    assert seller_items.json()[0]["role"] == "seller"
    assert seller_items.json()[0]["counterparty"]["id"] == winner.id
    assert winner_items.json()[0]["role"] == "winner"
    assert winner_items.json()[0]["counterparty"]["id"] == seller.id
    cleanup_test_data()


def test_message_updates_conversation_preview_and_notifies_counterparty() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-message-notify@auction-test.local")
    winner = create_test_user("winner-message-notify@auction-test.local")
    admin = create_test_user("admin-message-notify@auction-test.local", role="admin")
    sold = create_sold_auction(seller, winner, admin)

    created = client.post(
        f"/api/auctions/{sold['id']}/messages",
        json={"message": "Beszéljük meg privát üzenetben a részleteket."},
        headers=auth_headers(seller),
    )
    winner_items = client.get("/api/auctions/me/conversations", headers=auth_headers(winner))

    assert created.status_code == 201
    assert winner_items.status_code == 200
    assert winner_items.json()[0]["message_count"] == 1
    assert winner_items.json()[0]["last_message"] == "Beszéljük meg privát üzenetben a részleteket."

    db = SessionLocal()
    try:
        notification = db.scalar(
            select(Notification)
            .where(Notification.user_id == winner.id, Notification.type == "auction_message")
            .order_by(Notification.id.desc()),
        )
        assert notification is not None
        assert notification.auction_id == sold["id"]
    finally:
        db.close()
    cleanup_test_data()


def test_archived_conversation_remains_writable_and_keeps_transaction_status() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-archived-chat@auction-test.local")
    winner = create_test_user("winner-archived-chat@auction-test.local")
    admin = create_test_user("admin-archived-chat@auction-test.local", role="admin")
    sold = create_sold_auction(seller, winner, admin)
    assert client.post(f"/api/auctions/{sold['id']}/messages", json={"message": "Archiválás előtti üzenet."}, headers=auth_headers(seller)).status_code == 201

    db = SessionLocal()
    try:
        transaction = db.scalar(select(AuctionTransaction).where(AuctionTransaction.auction_id == sold["id"]))
        assert transaction is not None
        transaction.status = "archived"
        transaction.archived_at = datetime.now(timezone.utc)
        db.add(transaction)
        db.commit()
    finally:
        db.close()

    detail = client.get(f"/api/auctions/{sold['id']}", headers=auth_headers(seller))
    messages = client.get(f"/api/auctions/{sold['id']}/messages", headers=auth_headers(seller))
    sent_after_archive = client.post(f"/api/auctions/{sold['id']}/messages", json={"message": "Archiválás után is elérhető."}, headers=auth_headers(seller))
    assert detail.status_code == 200 and detail.json()["can_chat"] is True and detail.json()["chat_read_only"] is False
    assert messages.status_code == 200 and messages.json()[0]["message"] == "Archiválás előtti üzenet."
    assert sent_after_archive.status_code == 201
    with SessionLocal() as db:
        assert db.scalar(select(AuctionTransaction.status).where(AuctionTransaction.auction_id == sold["id"])) == "archived"
    cleanup_test_data()


def test_completed_transaction_allows_both_participants_but_not_an_outsider() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-completed-chat@auction-test.local")
    winner = create_test_user("winner-completed-chat@auction-test.local")
    outsider = create_test_user("outsider-completed-chat@auction-test.local")
    admin = create_test_user("admin-completed-chat@auction-test.local", role="admin")
    sold = create_sold_auction(seller, winner, admin)
    with SessionLocal() as db:
        transaction = db.scalar(select(AuctionTransaction).where(AuctionTransaction.auction_id == sold["id"]))
        transaction.status = "completed"
        transaction.completed_at = datetime.now(timezone.utc)
        db.add(transaction)
        db.commit()

    assert client.post(f"/api/auctions/{sold['id']}/messages", json={"message": "Eladói üzenet."}, headers=auth_headers(seller)).status_code == 201
    assert client.post(f"/api/auctions/{sold['id']}/messages", json={"message": "Vevői üzenet."}, headers=auth_headers(winner)).status_code == 201
    assert client.get(f"/api/auctions/{sold['id']}/messages", headers=auth_headers(outsider)).status_code == 403
    assert client.post(f"/api/auctions/{sold['id']}/messages", json={"message": "Idegen üzenet."}, headers=auth_headers(outsider)).status_code == 403
    with SessionLocal() as db:
        assert db.scalar(select(AuctionTransaction.status).where(AuctionTransaction.auction_id == sold["id"])) == "completed"
    cleanup_test_data()


def test_chat_ban_is_enforced_by_message_endpoint() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-chat-ban@auction-test.local")
    winner = create_test_user("winner-chat-ban@auction-test.local")
    admin = create_test_user("admin-chat-ban@auction-test.local", role="admin")
    sold = create_sold_auction(seller, winner, admin)
    restriction = client.post(
        "/api/admin/moderation/actions",
        json={"target_user_id": seller.id, "action_type": "chat_ban", "reason": "Chatküldés tesztkorlátozása", "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()},
        headers=auth_headers(admin),
    )
    blocked_send = client.post(f"/api/auctions/{sold['id']}/messages", json={"message": "Tiltott üzenet."}, headers=auth_headers(seller))
    assert restriction.status_code == 201
    assert blocked_send.status_code == 403
    assert "moderációs korlátozása" in blocked_send.json()["detail"]
    cleanup_test_data()


def test_webshop_routes_are_not_part_of_the_active_api() -> None:
    paths = set(client.get("/openapi.json").json()["paths"])
    retired_prefixes = (
        "/api/checkout",
        "/api/orders",
        "/api/products",
        "/api/shipping",
        "/api/pickup-points",
        "/api/admin/orders",
        "/api/admin/products",
        "/api/admin/stock-movements",
    )

    for prefix in retired_prefixes:
        assert not any(path.startswith(prefix) for path in paths)
