import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models.auction import Auction, AuctionImage, AuctionMessage, AuctionReview, Bid, WatchlistItem
from app.models.notification import Notification
from app.models.security_log import AuditLog
from app.models.user import User
from app.services.auction_scheduler import close_expired_auctions
from app.services.bidding import format_bid_amount


client = TestClient(app)
VALID_PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC")


def auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(subject=user.id)}"}


def create_test_user(email: str, role: str = "user") -> User:
    db = SessionLocal()
    try:
        user = User(
            email=email,
            username=f"{email.split('@', 1)[0].replace('.', '-')}-{uuid4().hex[:8]}",
            full_name="Bid Test User",
            password_hash=hash_password("BidTest123!"),
            role=role,
            is_active=True,
            is_email_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def cleanup_test_data() -> None:
    db = SessionLocal()
    try:
        db.query(Auction).update({Auction.highest_bid_id: None})
        db.commit()
        db.execute(delete(AuditLog))
        db.execute(delete(WatchlistItem))
        db.execute(delete(Notification))
        db.execute(delete(Bid))
        db.execute(delete(AuctionReview))
        db.execute(delete(AuctionMessage))
        db.execute(delete(AuctionImage))
        db.execute(delete(Auction))
        db.execute(delete(User).where(User.email.like("%@bid-test.local")))
        db.commit()
    finally:
        db.close()


def auction_payload(**overrides):
    now = datetime.now(timezone.utc)
    payload = {
        "title": "Teszt licites aukciĂł",
        "description": "RĂ©szletes licitmotor teszt aukciĂł leĂ­rĂˇsa.",
        "category": "Pokemon",
        "condition": "like_new",
        "starting_price": "1000.00",
        "bid_increment": "100.00",
        "buy_now_enabled": False,
        "buy_now_price": None,
        "starts_at": (now - timedelta(minutes=1)).isoformat(),
        "ends_at": (now + timedelta(hours=1)).isoformat(),
        "five_minute_rule_enabled": True,
        "seller_declaration_accepted": True,
    }
    payload.update(overrides)
    return payload


def upload_png(auction_id: int, user: User):
    return client.post(
        f"/api/auctions/{auction_id}/images",
        headers=auth_headers(user),
        files={"image": ("card.png", VALID_PNG, "image/png")},
    )


def create_active_auction(seller: User, **overrides) -> dict:
    created = client.post("/api/auctions", json=auction_payload(**overrides), headers=auth_headers(seller)).json()
    upload_png(created["id"], seller)
    activated = client.post(f"/api/auctions/{created['id']}/activate", headers=auth_headers(seller))
    assert activated.status_code == 200
    assert activated.json()["status"] == "active"
    return client.get(f"/api/auctions/{created['id']}", headers=auth_headers(seller)).json()


def place_bid(auction_id: int, bidder: User, amount: str):
    return client.post(f"/api/auctions/{auction_id}/bids", json={"amount": amount}, headers=auth_headers(bidder))


def test_bid_amount_is_formatted_as_hungarian_forint() -> None:
    assert format_bid_amount(Decimal("21000.00")) == "21 000 Ft"


def test_successful_bid_updates_current_price_and_highest_bid() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-success@bid-test.local")
    bidder = create_test_user("bidder-success@bid-test.local")
    auction = create_active_auction(seller)

    response = place_bid(auction["id"], bidder, "1100.00")
    refreshed = client.get(f"/api/auctions/{auction['id']}", headers=auth_headers(bidder))

    assert response.status_code == 201
    assert response.json()["amount"] == "1100.00"
    assert response.json()["is_highest"] is True
    assert refreshed.json()["current_price"] == "1100.00"
    assert refreshed.json()["highest_bid_id"] == response.json()["id"]


def test_bid_validation_rejects_too_low_amount_and_respects_increment() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-increment@bid-test.local")
    bidder = create_test_user("bidder-increment@bid-test.local")
    auction = create_active_auction(seller)

    too_low = place_bid(auction["id"], bidder, "1000.00")
    valid = place_bid(auction["id"], bidder, "1100.00")
    next_too_low = place_bid(auction["id"], bidder, "1150.00")

    assert too_low.status_code == 422
    assert too_low.json()["detail"] == "A licit összege legalább 1 100 Ft legyen."
    assert valid.status_code == 201
    assert next_too_low.status_code == 422
    assert next_too_low.json()["detail"] == "A licit összege legalább 1 200 Ft legyen."


def test_seller_cannot_bid_on_own_auction() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-own@bid-test.local")
    auction = create_active_auction(seller)

    response = place_bid(auction["id"], seller, "1100.00")

    assert response.status_code == 403
    assert response.json()["detail"] == "A saját aukciódra nem licitálhatsz."


def test_bids_are_rejected_on_closed_and_suspended_auctions() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-closed@bid-test.local")
    bidder = create_test_user("bidder-closed@bid-test.local")
    closed = create_active_auction(seller)
    suspended = create_active_auction(seller)
    client.post(f"/api/auctions/{closed['id']}/cancel", headers=auth_headers(seller))

    db = SessionLocal()
    try:
        suspended_auction = db.get(Auction, suspended["id"])
        assert suspended_auction is not None
        suspended_auction.status = "suspended"
        db.add(suspended_auction)
        db.commit()
    finally:
        db.close()

    closed_response = place_bid(closed["id"], bidder, "1100.00")
    suspended_response = place_bid(suspended["id"], bidder, "1100.00")

    assert closed_response.status_code == 409
    assert suspended_response.status_code == 409
    assert closed_response.json()["detail"] == "Licit csak aktív aukcióra adható le."
    assert suspended_response.json()["detail"] == "Licit csak aktív aukcióra adható le."


def test_concurrent_bids_keep_single_highest_price() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-concurrent@bid-test.local")
    bidder_one = create_test_user("bidder-one-concurrent@bid-test.local")
    bidder_two = create_test_user("bidder-two-concurrent@bid-test.local")
    auction = create_active_auction(seller)

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda user: place_bid(auction["id"], user, "1100.00"), [bidder_one, bidder_two]))

    status_codes = sorted(response.status_code for response in responses)
    refreshed = client.get(f"/api/auctions/{auction['id']}", headers=auth_headers(bidder_one))

    assert status_codes == [201, 422]
    assert refreshed.json()["current_price"] == "1100.00"


def test_bid_history_is_public_and_anonymized() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-history@bid-test.local")
    bidder_one = create_test_user("bidder-one-history@bid-test.local")
    bidder_two = create_test_user("bidder-two-history@bid-test.local")
    auction = create_active_auction(seller)
    place_bid(auction["id"], bidder_one, "1100.00")
    place_bid(auction["id"], bidder_two, "1200.00")

    history = client.get(f"/api/auctions/{auction['id']}/bids")

    assert history.status_code == 200
    assert [item["amount"] for item in history.json()] == ["1200.00", "1100.00"]
    assert all("bidder_id" not in item for item in history.json())
    assert history.json()[0]["is_highest"] is True


def test_expired_active_auction_sets_winner_from_highest_bid() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-winner@bid-test.local")
    bidder_one = create_test_user("bidder-one-winner@bid-test.local")
    bidder_two = create_test_user("bidder-two-winner@bid-test.local")
    auction = create_active_auction(seller)
    place_bid(auction["id"], bidder_one, "1100.00")
    highest = place_bid(auction["id"], bidder_two, "1200.00").json()

    db = SessionLocal()
    try:
        auction_row = db.get(Auction, auction["id"])
        assert auction_row is not None
        auction_row.ends_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.add(auction_row)
        db.commit()
    finally:
        db.close()

    status_response = client.get(f"/api/auctions/{auction['id']}/status", headers=auth_headers(bidder_one))

    assert status_response.status_code == 200
    assert status_response.json()["status"] == "sold"
    assert status_response.json()["winner_id"] == bidder_two.id
    assert status_response.json()["highest_bid_id"] == highest["id"]


def test_expired_active_auction_without_bid_becomes_unsold() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-unsold@bid-test.local")
    auction = create_active_auction(seller)

    db = SessionLocal()
    try:
        auction_row = db.get(Auction, auction["id"])
        assert auction_row is not None
        auction_row.ends_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.add(auction_row)
        db.commit()
    finally:
        db.close()

    status_response = client.get(f"/api/auctions/{auction['id']}/status", headers=auth_headers(seller))

    assert status_response.status_code == 200
    assert status_response.json()["status"] == "unsold"
    assert status_response.json()["winner_id"] is None


def test_buy_now_preparation_flags_reaching_bid_without_frontend_calculation() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-buy-now@bid-test.local")
    bidder = create_test_user("bidder-buy-now@bid-test.local")
    auction = create_active_auction(seller, buy_now_enabled=True, buy_now_price="1500.00")

    response = place_bid(auction["id"], bidder, "1500.00")

    assert response.status_code == 201
    assert response.json()["reaches_buy_now"] is True


def test_buy_now_closes_auction_and_enables_winner_features() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-buy-now-close@bid-test.local")
    bidder = create_test_user("bidder-buy-now-close@bid-test.local")
    auction = create_active_auction(seller, buy_now_enabled=True, buy_now_price="1500.00")

    response = place_bid(auction["id"], bidder, "1500.00")
    refreshed = client.get(f"/api/auctions/{auction['id']}", headers=auth_headers(bidder))
    next_bid = place_bid(auction["id"], create_test_user("late-buy-now@bid-test.local"), "1600.00")

    assert response.status_code == 201
    assert refreshed.json()["status"] == "sold"
    assert refreshed.json()["winner_id"] == bidder.id
    assert refreshed.json()["can_chat"] is True
    assert refreshed.json()["can_review"] is False
    transactions = client.get("/api/transactions", headers=auth_headers(bidder))
    assert transactions.status_code == 200
    assert transactions.json()["items"][0]["auction_id"] == auction["id"]
    assert transactions.json()["items"][0]["status"] == "transaction_open"
    assert next_bid.status_code == 409


def test_double_buy_now_is_transaction_safe() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-double-buy-now@bid-test.local")
    bidder_one = create_test_user("bidder-one-double-buy-now@bid-test.local")
    bidder_two = create_test_user("bidder-two-double-buy-now@bid-test.local")
    auction = create_active_auction(seller, buy_now_enabled=True, buy_now_price="1500.00")

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda user: place_bid(auction["id"], user, "1500.00"), [bidder_one, bidder_two]))

    status_codes = sorted(response.status_code for response in responses)
    refreshed = client.get(f"/api/auctions/{auction['id']}", headers=auth_headers(seller))

    assert status_codes == [201, 409]
    assert refreshed.json()["status"] == "sold"
    assert refreshed.json()["winner_id"] in {bidder_one.id, bidder_two.id}


def test_scheduler_closes_expired_active_auction_as_sold() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-scheduler-sold@bid-test.local")
    bidder = create_test_user("bidder-scheduler-sold@bid-test.local")
    auction = create_active_auction(seller)
    place_bid(auction["id"], bidder, "1100.00")

    db = SessionLocal()
    try:
        auction_row = db.get(Auction, auction["id"])
        assert auction_row is not None
        auction_row.ends_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.add(auction_row)
        db.commit()
        closed_count = close_expired_auctions(db)
        db.refresh(auction_row)
        assert closed_count == 1
        assert auction_row.status == "sold"
        assert auction_row.winner_id == bidder.id
        assert close_expired_auctions(db) == 0
    finally:
        db.close()


def test_scheduler_closes_expired_active_auction_as_unsold() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-scheduler-unsold@bid-test.local")
    auction = create_active_auction(seller)

    db = SessionLocal()
    try:
        auction_row = db.get(Auction, auction["id"])
        assert auction_row is not None
        auction_row.ends_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.add(auction_row)
        db.commit()
        closed_count = close_expired_auctions(db)
        db.refresh(auction_row)
        assert closed_count == 1
        assert auction_row.status == "unsold"
        assert auction_row.winner_id is None
    finally:
        db.close()


def test_five_minute_extension_prevents_scheduler_close() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-extension@bid-test.local")
    bidder = create_test_user("bidder-extension@bid-test.local")
    auction = create_active_auction(seller, ends_at=(datetime.now(timezone.utc) + timedelta(minutes=1)).isoformat())

    response = place_bid(auction["id"], bidder, "1100.00")
    db = SessionLocal()
    try:
        auction_row = db.get(Auction, auction["id"])
        assert auction_row is not None
        closed_count = close_expired_auctions(db)
        assert response.status_code == 201
        assert closed_count == 0
        assert auction_row.status == "active"
        assert auction_row.ends_at > datetime.now(timezone.utc)
    finally:
        db.close()


def test_outbid_notification_and_my_bids_endpoint() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-notification@bid-test.local")
    bidder_one = create_test_user("bidder-one-notification@bid-test.local")
    bidder_two = create_test_user("bidder-two-notification@bid-test.local")
    auction = create_active_auction(seller)
    place_bid(auction["id"], bidder_one, "1100.00")
    place_bid(auction["id"], bidder_two, "1200.00")

    notifications = client.get("/api/auctions/notifications", headers=auth_headers(bidder_one))
    my_bids = client.get("/api/auctions/my-bids", headers=auth_headers(bidder_one))

    assert notifications.status_code == 200
    assert notifications.json()[0]["type"] == "outbid"
    assert notifications.json()[0]["auction_id"] == auction["id"]
    assert my_bids.status_code == 200
    assert my_bids.json()[0]["is_leading"] is False
    assert my_bids.json()[0]["is_outbid"] is True
    assert my_bids.json()[0]["auction"]["current_price"] == "1200.00"


def test_realtime_stream_returns_auction_snapshot() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-stream@bid-test.local")
    bidder = create_test_user("bidder-stream@bid-test.local")
    auction = create_active_auction(seller)
    place_bid(auction["id"], bidder, "1100.00")

    with client.stream("GET", f"/api/auctions/{auction['id']}/stream?once=true") as response:
        lines = list(response.iter_lines())

    assert response.status_code == 200
    assert lines[0] == "event: auction_update"
    assert '"current_price": "1100.00"' in lines[1]
    assert '"bid_count": 1' in lines[1]
