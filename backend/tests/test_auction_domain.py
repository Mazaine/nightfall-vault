from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models.auction import Auction, AuctionImage, AuctionMessage, AuctionReview
from app.models.user import User


client = TestClient(app)


def auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(subject=user.id)}"}


def create_test_user(email: str, role: str = "user") -> User:
    db = SessionLocal()
    try:
        user = User(
            email=email,
            username=email.split("@", 1)[0].replace(".", "-"),
            full_name="Auction Test User",
            password_hash=hash_password("AuctionTest123!"),
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
        db.execute(delete(AuctionReview))
        db.execute(delete(AuctionMessage))
        db.execute(delete(AuctionImage))
        db.execute(delete(Auction))
        db.execute(delete(User).where(User.email.like("%@auction-test.local")))
        db.commit()
    finally:
        db.close()


def auction_payload(**overrides):
    now = datetime.now(timezone.utc)
    payload = {
        "title": "Teszt aukció",
        "description": "Részletes, valós teszt aukció leírás.",
        "category": "Pokemon",
        "condition": "like_new",
        "starting_price": "1000.00",
        "bid_increment": "100.00",
        "buy_now_enabled": True,
        "buy_now_price": "2500.00",
        "starts_at": (now + timedelta(minutes=1)).isoformat(),
        "ends_at": (now + timedelta(days=1)).isoformat(),
        "five_minute_rule_enabled": True,
        "seller_declaration_accepted": True,
    }
    payload.update(overrides)
    return payload


def test_authenticated_user_can_create_auction_and_seller_is_current_user() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-create@auction-test.local")

    response = client.post("/api/auctions", json={**auction_payload(), "seller_id": 9999}, headers=auth_headers(seller))

    assert response.status_code == 201
    data = response.json()
    assert data["seller_id"] == seller.id
    assert data["winner_id"] is None
    assert data["status"] == "draft"


def test_anonymous_user_cannot_create_auction() -> None:
    response = client.post("/api/auctions", json=auction_payload())

    assert response.status_code == 401


def test_price_and_time_validation_reject_invalid_payloads() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-validation@auction-test.local")
    now = datetime.now(timezone.utc)

    bad_price = client.post("/api/auctions", json=auction_payload(starting_price="0.00"), headers=auth_headers(seller))
    bad_time = client.post(
        "/api/auctions",
        json=auction_payload(starts_at=now.isoformat(), ends_at=now.isoformat()),
        headers=auth_headers(seller),
    )
    bad_buy_now = client.post(
        "/api/auctions",
        json=auction_payload(buy_now_enabled=True, buy_now_price="900.00"),
        headers=auth_headers(seller),
    )

    assert bad_price.status_code == 422
    assert bad_time.status_code == 422
    assert bad_buy_now.status_code == 422


def test_draft_visibility_and_ownership_update_rules() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-ownership@auction-test.local")
    stranger = create_test_user("stranger-ownership@auction-test.local")
    created = client.post("/api/auctions", json=auction_payload(), headers=auth_headers(seller)).json()

    public_response = client.get(f"/api/auctions/{created['id']}")
    stranger_update = client.patch(
        f"/api/auctions/{created['id']}",
        json={"description": "Idegen felhasználó próbálja módosítani."},
        headers=auth_headers(stranger),
    )
    owner_update = client.patch(
        f"/api/auctions/{created['id']}",
        json={"description": "Saját draft aukció módosított leírása."},
        headers=auth_headers(seller),
    )

    assert public_response.status_code == 404
    assert stranger_update.status_code == 403
    assert owner_update.status_code == 200


def test_image_upload_cover_and_activation_rules() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-image@auction-test.local")
    created = client.post("/api/auctions", json=auction_payload(), headers=auth_headers(seller)).json()

    activate_without_image = client.post(f"/api/auctions/{created['id']}/activate", headers=auth_headers(seller))
    image_response = client.post(
        f"/api/auctions/{created['id']}/images",
        headers=auth_headers(seller),
        files={"image": ("card.png", b"\x89PNG\r\n\x1a\nimage-bytes", "image/png")},
    )
    activate_with_image = client.post(f"/api/auctions/{created['id']}/activate", headers=auth_headers(seller))
    bad_file = client.post(
        f"/api/auctions/{created['id']}/images",
        headers=auth_headers(seller),
        files={"image": ("not-image.txt", b"not image", "text/plain")},
    )

    assert activate_without_image.status_code == 422
    assert image_response.status_code == 201
    assert image_response.json()["is_cover"] is True
    assert activate_with_image.status_code == 200
    assert activate_with_image.json()["status"] == "scheduled"
    assert bad_file.status_code == 400


def test_active_auction_locks_critical_fields() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-active@auction-test.local")
    now = datetime.now(timezone.utc)
    created = client.post(
        "/api/auctions",
        json=auction_payload(starts_at=(now - timedelta(minutes=1)).isoformat(), ends_at=(now + timedelta(days=1)).isoformat()),
        headers=auth_headers(seller),
    ).json()
    client.post(
        f"/api/auctions/{created['id']}/images",
        headers=auth_headers(seller),
        files={"image": ("card.png", b"\x89PNG\r\n\x1a\nimage-bytes", "image/png")},
    )
    client.post(f"/api/auctions/{created['id']}/activate", headers=auth_headers(seller))

    response = client.patch(f"/api/auctions/{created['id']}", json={"starting_price": "2000.00"}, headers=auth_headers(seller))

    assert response.status_code == 409


def test_sold_auction_chat_and_review_are_participant_only() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-closed@auction-test.local")
    winner = create_test_user("winner-closed@auction-test.local")
    stranger = create_test_user("stranger-closed@auction-test.local")
    admin = create_test_user("admin-closed@auction-test.local", role="admin")
    now = datetime.now(timezone.utc)
    created = client.post(
        "/api/auctions",
        json=auction_payload(starts_at=(now - timedelta(days=2)).isoformat(), ends_at=(now - timedelta(days=1)).isoformat()),
        headers=auth_headers(seller),
    ).json()
    client.post(
        f"/api/auctions/{created['id']}/images",
        headers=auth_headers(seller),
        files={"image": ("card.png", b"\x89PNG\r\n\x1a\nimage-bytes", "image/png")},
    )
    client.post(f"/api/auctions/{created['id']}/activate", headers=auth_headers(seller))
    finalized = client.post(
        f"/api/auctions/{created['id']}/admin/finalize",
        json={"status": "sold", "winner_id": winner.id},
        headers=auth_headers(admin),
    )

    seller_message = client.post(f"/api/auctions/{created['id']}/messages", json={"message": "Kapcsolatfelvétel."}, headers=auth_headers(seller))
    stranger_messages = client.get(f"/api/auctions/{created['id']}/messages", headers=auth_headers(stranger))
    winner_review = client.post(f"/api/auctions/{created['id']}/reviews", json={"rating": 5, "comment": "Korrekt eladó."}, headers=auth_headers(winner))
    duplicate_review = client.post(f"/api/auctions/{created['id']}/reviews", json={"rating": 4}, headers=auth_headers(winner))
    stranger_review = client.post(f"/api/auctions/{created['id']}/reviews", json={"rating": 5}, headers=auth_headers(stranger))

    assert finalized.status_code == 200
    assert finalized.json()["status"] == "sold"
    assert seller_message.status_code == 201
    assert stranger_messages.status_code == 403
    assert winner_review.status_code == 201
    assert winner_review.json()["reviewed_user_id"] == seller.id
    assert duplicate_review.status_code == 409
    assert stranger_review.status_code == 403
