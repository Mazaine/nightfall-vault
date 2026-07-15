from datetime import datetime, timedelta, timezone

from sqlalchemy import delete

from app.db.session import SessionLocal
from app.models.user import SellerFollow
from test_auction_domain import auth_headers, auction_payload, cleanup_test_data, client, complete_auction_transaction, create_sold_auction, create_test_user, upload_png


def cleanup_sprint7_data() -> None:
    db = SessionLocal()
    try:
        db.execute(delete(SellerFollow))
        db.commit()
    finally:
        db.close()
    cleanup_test_data()


def create_active_auction(seller, **overrides):
    now = datetime.now(timezone.utc)
    payload = auction_payload(
        starts_at=(now - timedelta(minutes=2)).isoformat(),
        ends_at=(now + timedelta(days=1)).isoformat(),
        **overrides,
    )
    created = client.post("/api/auctions", json=payload, headers=auth_headers(seller))
    assert created.status_code == 201
    auction = created.json()
    assert upload_png(auction["id"], seller).status_code == 201
    activated = client.post(f"/api/auctions/{auction['id']}/activate", headers=auth_headers(seller))
    assert activated.status_code == 200
    return auction


def test_public_profile_exposes_safe_fields_and_stats() -> None:
    cleanup_sprint7_data()
    seller = create_test_user("seller-profile@auction-test.local")
    winner = create_test_user("winner-profile@auction-test.local")
    admin = create_test_user("admin-profile@auction-test.local", role="admin")
    sold = create_sold_auction(seller, winner, admin)
    complete_auction_transaction(seller, winner)
    review = client.post(f"/api/auctions/{sold['id']}/reviews", json={"rating": 5, "comment": "Korrekt elado."}, headers=auth_headers(winner))
    assert review.status_code == 201

    response = client.get(f"/api/users/{seller.username}")

    assert response.status_code == 200
    data = response.json()
    assert data["username"] == seller.username
    assert "email" not in data
    assert "role" not in data
    assert "id" not in data
    assert data["stats"]["positive_reviews"] == 1
    assert data["stats"]["negative_reviews"] == 0
    assert data["stats"]["sold_auctions"] == 1
    assert data["stats"]["closed_auctions"] == 1
    assert data["stats"]["won_auctions"] == 0
    assert data["recent_reviews"][0]["comment"] == "Korrekt elado."


def test_follow_system_requires_auth_prevents_self_follow_and_lists_sellers() -> None:
    cleanup_sprint7_data()
    seller = create_test_user("seller-follow@auction-test.local")
    follower = create_test_user("follower-follow@auction-test.local")

    anonymous = client.post("/api/follow", json={"username": seller.username})
    self_follow = client.post("/api/follow", json={"username": follower.username}, headers=auth_headers(follower))
    created = client.post("/api/follow", json={"username": seller.username}, headers=auth_headers(follower))
    duplicate = client.post("/api/follow", json={"username": seller.username}, headers=auth_headers(follower))
    following = client.get("/api/following", headers=auth_headers(follower))
    deleted = client.request("DELETE", "/api/follow", json={"username": seller.username}, headers=auth_headers(follower))
    following_after_delete = client.get("/api/following", headers=auth_headers(follower))

    assert anonymous.status_code == 401
    assert self_follow.status_code == 409
    assert created.status_code == 201
    assert duplicate.status_code == 201
    assert following.status_code == 200
    assert following.json()[0]["username"] == seller.username
    assert deleted.status_code == 204
    assert following_after_delete.json() == []


def test_public_review_listing_supports_pagination_and_sorting() -> None:
    cleanup_sprint7_data()
    seller = create_test_user("seller-reviews@auction-test.local")
    winner_one = create_test_user("winner-reviews-one@auction-test.local")
    winner_two = create_test_user("winner-reviews-two@auction-test.local")
    admin = create_test_user("admin-reviews@auction-test.local", role="admin")
    sold_one = create_sold_auction(seller, winner_one, admin)
    sold_two = create_sold_auction(seller, winner_two, admin)
    complete_auction_transaction(seller, winner_one)
    complete_auction_transaction(seller, winner_two)
    assert client.post(f"/api/auctions/{sold_one['id']}/reviews", json={"rating": 5, "comment": "Gyors atadas."}, headers=auth_headers(winner_one)).status_code == 201
    assert client.post(f"/api/auctions/{sold_two['id']}/reviews", json={"rating": 2, "comment": "Lassu kommunikacio."}, headers=auth_headers(winner_two)).status_code == 201

    response = client.get(f"/api/users/{seller.username}/reviews?sort=rating_low&limit=1")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert len(data["items"]) == 1
    assert data["items"][0]["rating"] == 2
    assert data["items"][0]["created_at"]


def test_auction_search_filters_and_sorting() -> None:
    cleanup_sprint7_data()
    seller = create_test_user("seller-search@auction-test.local")
    bidder = create_test_user("bidder-search@auction-test.local")
    pokemon = create_active_auction(seller, title="Pokemon villam", category="Pokemon", condition="fresh", starting_price="1000.00", buy_now_enabled=True, buy_now_price="5000.00")
    magic = create_active_auction(seller, title="Magic lap", category="Magic the Gathering", condition="played", starting_price="2000.00", buy_now_enabled=False, buy_now_price=None)
    assert client.post(f"/api/auctions/{pokemon['id']}/bids", json={"amount": "1200.00"}, headers=auth_headers(bidder)).status_code == 201
    assert client.post(f"/api/auctions/{magic['id']}/bids", json={"amount": "2200.00"}, headers=auth_headers(bidder)).status_code == 201

    filtered = client.get("/api/auctions?category=Pokemon&condition=fresh&buy_now=true&min_bids=1&sort=highest_price")
    sorted_by_bids = client.get("/api/auctions?sort=most_bids")

    assert filtered.status_code == 200
    filtered_data = filtered.json()
    assert filtered_data["total"] == 1
    assert filtered_data["items"][0]["title"] == "Pokemon villam"
    assert filtered_data["items"][0]["bid_count"] == 1
    assert sorted_by_bids.status_code == 200
    assert sorted_by_bids.json()["items"][0]["bid_count"] >= 1
