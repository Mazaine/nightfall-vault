from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

from app.db.session import SessionLocal
from app.models.notification import Notification
from app.models.user import SavedSearch, SellerFollow
from test_auction_domain import auth_headers, auction_payload, cleanup_test_data, client, create_sold_auction, create_test_user, upload_png


def cleanup_sprint9_data() -> None:
    db = SessionLocal()
    try:
        db.execute(delete(SavedSearch))
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
    assert created.status_code == 201, created.text
    auction = created.json()
    assert upload_png(auction["id"], seller).status_code == 201
    activated = client.post(f"/api/auctions/{auction['id']}/activate", headers=auth_headers(seller))
    assert activated.status_code == 200, activated.text
    return client.get(f"/api/auctions/{auction['id']}").json()


def test_saved_search_crud_idor_and_in_app_notification() -> None:
    cleanup_sprint9_data()
    owner = create_test_user("saved-owner@auction-test.local")
    other = create_test_user("saved-other@auction-test.local")
    seller = create_test_user("saved-seller@auction-test.local")

    anonymous = client.post("/api/searches", json={"name": "Pokemon", "category": "Pokemon"})
    created = client.post("/api/searches", json={"name": "Pokemon", "category": "Pokemon", "buy_now": True}, headers=auth_headers(owner))
    assert anonymous.status_code == 401
    assert created.status_code == 201, created.text
    search_id = created.json()["id"]
    assert client.get("/api/searches", headers=auth_headers(owner)).json()[0]["id"] == search_id
    assert client.get("/api/searches", headers=auth_headers(other)).json() == []
    assert client.delete(f"/api/searches/{search_id}", headers=auth_headers(other)).status_code == 404

    auction = create_active_auction(seller, title="Ritka Pokemon kartya", description="Kulonleges gyujtoi Pokemon kartya leirasa.", category="Pokemon", buy_now_enabled=True, buy_now_price="5000.00")
    db = SessionLocal()
    try:
        matches = db.scalars(select(Notification).where(Notification.user_id == owner.id, Notification.auction_id == auction["id"], Notification.type == "saved_search_match")).all()
    finally:
        db.close()
    assert len(matches) == 1
    assert client.delete(f"/api/searches/{search_id}", headers=auth_headers(owner)).status_code == 204


def test_text_search_related_and_seller_lookup() -> None:
    cleanup_sprint9_data()
    seller = create_test_user("recommend-seller@auction-test.local")
    source = create_active_auction(seller, title="Pokemon Charizard premium", description="Ritka gyujtoi kartya tokeletes allapotban.", category="Pokemon", starting_price="1000.00")
    same_seller = create_active_auction(seller, title="Pokemon Pikachu", description="Masik ritka gyujtoi kartya eladotol.", category="Pokemon", starting_price="1200.00")
    other_seller = create_test_user("recommend-other@auction-test.local")
    similar = create_active_auction(other_seller, title="Charizard gyujtoi lap", description="Hasonlo premium kartya masik eladotol.", category="Pokemon", starting_price="1100.00")

    by_title = client.get("/api/auctions?title=Charizard")
    by_description = client.get("/api/auctions?description=tokeletes")
    by_seller = client.get(f"/api/auctions?seller={seller.username}")
    injection = client.get("/api/auctions?q=%27%20OR%201%3D1--")
    related = client.get(f"/api/auctions/{source['id']}/related")
    seller_items = client.get(f"/api/auctions/{source['id']}/seller-auctions")
    draft = client.post("/api/auctions", json=auction_payload(), headers=auth_headers(seller)).json()
    private_related = client.get(f"/api/auctions/{draft['id']}/related")

    assert {item["id"] for item in by_title.json()["items"]} == {source["id"], similar["id"]}
    assert [item["id"] for item in by_description.json()["items"]] == [source["id"]]
    assert {item["id"] for item in by_seller.json()["items"]} == {source["id"], same_seller["id"]}
    assert injection.status_code == 200 and injection.json()["total"] == 0
    assert related.status_code == 200
    assert source["id"] not in {item["id"] for item in related.json()}
    assert {same_seller["id"], similar["id"]}.issubset({item["id"] for item in related.json()})
    assert seller_items.status_code == 200
    assert len(seller_items.json()) <= 6
    assert [item["id"] for item in seller_items.json()] == [same_seller["id"]]
    assert private_related.status_code == 404


def test_profile_marketplace_stats_do_not_expose_moderation_counts() -> None:
    cleanup_sprint9_data()
    seller = create_test_user("stats-seller@auction-test.local")
    bidder = create_test_user("stats-bidder@auction-test.local")
    admin = create_test_user("stats-admin@auction-test.local", role="admin")
    sold = create_sold_auction(seller, bidder, admin)
    assert client.post("/api/follow", json={"username": seller.username}, headers=auth_headers(bidder)).status_code == 201

    seller_profile = client.get(f"/api/users/{seller.username}").json()
    bidder_profile = client.get(f"/api/users/{bidder.username}").json()
    assert seller_profile["stats"]["follower_count"] == 1
    assert seller_profile["stats"]["sold_auctions"] >= 1
    assert bidder_profile["stats"]["successful_bids"] >= 1
    assert bidder_profile["stats"]["success_rate"] == 100.0
    assert "report_count" not in seller_profile["stats"]
    assert "block_count" not in seller_profile["stats"]
    assert sold["id"]
