from sqlalchemy import delete

from app.db.session import SessionLocal
from app.models.auction_transaction import AuctionTransaction
from test_auction_domain import auth_headers, cleanup_test_data, client, create_sold_auction, create_test_user


def cleanup_transactions() -> None:
    db = SessionLocal()
    try:
        db.execute(delete(AuctionTransaction))
        db.commit()
    finally:
        db.close()
    cleanup_test_data()


def test_sold_auction_creates_private_participant_transaction() -> None:
    cleanup_transactions()
    seller = create_test_user("seller-transaction@auction-test.local")
    buyer = create_test_user("buyer-transaction@auction-test.local")
    outsider = create_test_user("outsider-transaction@auction-test.local")
    admin = create_test_user("admin-transaction@auction-test.local", role="admin")

    sold = create_sold_auction(seller, buyer, admin)
    seller_items = client.get("/api/transactions", headers=auth_headers(seller))
    buyer_items = client.get("/api/transactions", headers=auth_headers(buyer))
    outsider_items = client.get("/api/transactions", headers=auth_headers(outsider))

    assert seller_items.status_code == 200
    assert buyer_items.status_code == 200
    assert outsider_items.json() == []
    assert len(seller_items.json()) == 1
    assert seller_items.json()[0]["auction_id"] == sold["id"]
    assert seller_items.json()[0]["role"] == "seller"
    assert buyer_items.json()[0]["role"] == "buyer"
    transaction_id = seller_items.json()[0]["id"]
    assert client.get(f"/api/transactions/{transaction_id}", headers=auth_headers(outsider)).status_code == 404
    cleanup_transactions()


def test_two_party_confirmation_completes_transaction_idempotently() -> None:
    cleanup_transactions()
    seller = create_test_user("seller-confirm@auction-test.local")
    buyer = create_test_user("buyer-confirm@auction-test.local")
    admin = create_test_user("admin-confirm@auction-test.local", role="admin")
    create_sold_auction(seller, buyer, admin)
    transaction_id = client.get("/api/transactions", headers=auth_headers(seller)).json()[0]["id"]

    seller_confirmation = client.post(f"/api/transactions/{transaction_id}/confirm", headers=auth_headers(seller))
    seller_repeat = client.post(f"/api/transactions/{transaction_id}/confirm", headers=auth_headers(seller))
    buyer_confirmation = client.post(f"/api/transactions/{transaction_id}/confirm", headers=auth_headers(buyer))

    assert seller_confirmation.status_code == 200
    assert seller_confirmation.json()["status"] == "in_progress"
    assert seller_confirmation.json()["seller_confirmed"] is True
    assert seller_repeat.status_code == 200
    assert buyer_confirmation.status_code == 200
    assert buyer_confirmation.json()["status"] == "completed"
    assert buyer_confirmation.json()["seller_confirmed"] is True
    assert buyer_confirmation.json()["buyer_confirmed"] is True
    assert client.post(
        f"/api/transactions/{transaction_id}/disputes",
        json={"reason": "A teljesítés után már nem nyitható vita."},
        headers=auth_headers(buyer),
    ).status_code == 409
    cleanup_transactions()


def test_participant_can_open_dispute_and_confirmation_is_blocked() -> None:
    cleanup_transactions()
    seller = create_test_user("seller-dispute@auction-test.local")
    buyer = create_test_user("buyer-dispute@auction-test.local")
    admin = create_test_user("admin-dispute@auction-test.local", role="admin")
    create_sold_auction(seller, buyer, admin)
    transaction_id = client.get("/api/transactions", headers=auth_headers(buyer)).json()[0]["id"]

    too_short = client.post(
        f"/api/transactions/{transaction_id}/disputes",
        json={"reason": "Rövid"},
        headers=auth_headers(buyer),
    )
    disputed = client.post(
        f"/api/transactions/{transaction_id}/disputes",
        json={"reason": "A csomag állapota nem egyezik a leírással."},
        headers=auth_headers(buyer),
    )

    assert too_short.status_code == 422
    assert disputed.status_code == 200
    assert disputed.json()["status"] == "disputed"
    assert disputed.json()["dispute_reason"] == "A csomag állapota nem egyezik a leírással."
    assert client.post(f"/api/transactions/{transaction_id}/confirm", headers=auth_headers(seller)).status_code == 409
    cleanup_transactions()
