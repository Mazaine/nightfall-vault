from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.notification import Notification
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
