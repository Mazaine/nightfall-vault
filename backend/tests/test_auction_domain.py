import base64
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models.auction import Auction, AuctionImage, AuctionMessage, AuctionReview, Bid, WatchlistItem
from app.models.moderation import ModerationAction, Report, UserBlock, UserStrike
from app.models.notification import Notification
from app.models.security_log import AuditLog
from app.models.user import User


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
        db.query(Auction).update({Auction.highest_bid_id: None})
        db.commit()
        db.execute(delete(AuditLog))
        db.execute(delete(ModerationAction))
        db.execute(delete(UserStrike))
        db.execute(delete(Report))
        db.execute(delete(UserBlock))
        db.execute(delete(WatchlistItem))
        db.execute(delete(Notification))
        db.execute(delete(AuctionReview))
        db.execute(delete(AuctionMessage))
        db.execute(delete(Bid))
        db.execute(delete(AuctionImage))
        db.execute(delete(Auction))
        db.execute(delete(User).where(User.email.like("%@auction-test.%")))
        db.commit()
    finally:
        db.close()


def auction_payload(**overrides):
    now = datetime.now(timezone.utc)
    payload = {
        "title": "Teszt aukciĂł",
        "description": "RĂ©szletes, valĂłs teszt aukciĂł leĂ­rĂˇs.",
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


def upload_png(auction_id: int, user: User, name: str = "card.png", is_cover: bool | None = None):
    suffix = "" if is_cover is None else f"?is_cover={'true' if is_cover else 'false'}"
    return client.post(
        f"/api/auctions/{auction_id}/images{suffix}",
        headers=auth_headers(user),
        files={"image": (name, VALID_PNG, "image/png")},
    )


def create_expired_auction_with_image(seller: User) -> dict:
    now = datetime.now(timezone.utc)
    created = client.post(
        "/api/auctions",
        json=auction_payload(starts_at=(now - timedelta(days=2)).isoformat(), ends_at=(now + timedelta(minutes=5)).isoformat()),
        headers=auth_headers(seller),
    ).json()
    upload_png(created["id"], seller)
    client.post(f"/api/auctions/{created['id']}/activate", headers=auth_headers(seller))
    db = SessionLocal()
    try:
        auction = db.get(Auction, created["id"])
        assert auction is not None
        auction.status = "ended"
        auction.ends_at = now - timedelta(minutes=1)
        db.add(auction)
        db.commit()
    finally:
        db.close()
    return created


def create_sold_auction(seller: User, winner: User, admin: User) -> dict:
    created = create_expired_auction_with_image(seller)
    finalized = client.post(
        f"/api/auctions/{created['id']}/admin/finalize",
        json={"status": "sold", "winner_id": winner.id},
        headers=auth_headers(admin),
    )
    assert finalized.status_code == 200
    return finalized.json()


def complete_auction_transaction(seller: User, winner: User) -> dict:
    page = client.get("/api/transactions", headers=auth_headers(seller))
    assert page.status_code == 200
    transaction = next(item for item in page.json()["items"] if item["partner"]["username"] == winner.username)
    seller_confirmation = client.post(f"/api/transactions/{transaction['id']}/confirm-completion", headers=auth_headers(seller))
    winner_confirmation = client.post(f"/api/transactions/{transaction['id']}/confirm-completion", headers=auth_headers(winner))
    assert seller_confirmation.status_code == 200
    assert winner_confirmation.status_code == 200
    assert winner_confirmation.json()["status"] == "completed"
    return winner_confirmation.json()


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
        json={"description": "Idegen felhasznĂˇlĂł prĂłbĂˇlja mĂłdosĂ­tani."},
        headers=auth_headers(stranger),
    )
    owner_update = client.patch(
        f"/api/auctions/{created['id']}",
        json={"description": "SajĂˇt draft aukciĂł mĂłdosĂ­tott leĂ­rĂˇsa."},
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
        files={"image": ("card.png", VALID_PNG, "image/png")},
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


def test_active_auction_allows_safe_edits_and_images_but_locks_critical_fields() -> None:
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
        files={"image": ("card.png", VALID_PNG, "image/png")},
    )
    client.post(f"/api/auctions/{created['id']}/activate", headers=auth_headers(seller))

    safe_update = client.patch(
        f"/api/auctions/{created['id']}",
        json={"description": "Aktív aukció biztonságosan frissített részletes leírása.", "five_minute_rule_enabled": False, "buy_now_enabled": False},
        headers=auth_headers(seller),
    )
    added_image = upload_png(created["id"], seller, name="active-second.png", is_cover=False)
    critical_update = client.patch(f"/api/auctions/{created['id']}", json={"starting_price": "2000.00"}, headers=auth_headers(seller))

    assert safe_update.status_code == 200
    assert safe_update.json()["description"] == "Aktív aukció biztonságosan frissített részletes leírása."
    assert safe_update.json()["five_minute_rule_enabled"] is False
    assert safe_update.json()["buy_now_enabled"] is False
    assert added_image.status_code == 201
    assert critical_update.status_code == 409


def test_sold_auction_chat_and_review_are_participant_only() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-closed@auction-test.local")
    winner = create_test_user("winner-closed@auction-test.local")
    stranger = create_test_user("stranger-closed@auction-test.local")
    admin = create_test_user("admin-closed@auction-test.local", role="admin")
    finalized = create_sold_auction(seller, winner, admin)
    complete_auction_transaction(seller, winner)

    seller_message = client.post(f"/api/auctions/{finalized['id']}/messages", json={"message": "KapcsolatfelvĂ©tel."}, headers=auth_headers(seller))
    stranger_messages = client.get(f"/api/auctions/{finalized['id']}/messages", headers=auth_headers(stranger))
    winner_review = client.post(f"/api/auctions/{finalized['id']}/reviews", json={"rating": 5, "comment": "Korrekt eladĂł."}, headers=auth_headers(winner))
    duplicate_review = client.post(f"/api/auctions/{finalized['id']}/reviews", json={"rating": 4}, headers=auth_headers(winner))
    stranger_review = client.post(f"/api/auctions/{finalized['id']}/reviews", json={"rating": 5}, headers=auth_headers(stranger))

    assert finalized["status"] == "sold"
    assert seller_message.status_code == 201
    assert stranger_messages.status_code == 403
    assert winner_review.status_code == 201
    assert winner_review.json()["reviewed_user_id"] == seller.id
    assert duplicate_review.status_code == 409
    assert stranger_review.status_code == 403


def test_image_limit_cover_integrity_and_activation_without_cover() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-image-rules@auction-test.local")
    created = client.post("/api/auctions", json=auction_payload(), headers=auth_headers(seller)).json()

    uploads = [upload_png(created["id"], seller, name=f"card-{index}.png", is_cover=(index == 1)) for index in range(1, 6)]
    sixth_upload = upload_png(created["id"], seller, name="card-6.png")

    db = SessionLocal()
    try:
        images = db.query(AuctionImage).filter(AuctionImage.auction_id == created["id"]).all()
        cover_count = sum(1 for image in images if image.is_cover)
        for image in images:
            image.is_cover = False
            db.add(image)
        db.commit()
    finally:
        db.close()

    activation_without_cover = client.post(f"/api/auctions/{created['id']}/activate", headers=auth_headers(seller))

    assert [response.status_code for response in uploads] == [201, 201, 201, 201, 201]
    assert sixth_upload.status_code == 409
    assert cover_count == 1
    assert activation_without_cover.status_code == 422


def test_active_auction_last_image_delete_and_forbidden_status_transition() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-status-rules@auction-test.local")
    now = datetime.now(timezone.utc)
    created = client.post(
        "/api/auctions",
        json=auction_payload(starts_at=(now - timedelta(minutes=1)).isoformat(), ends_at=(now + timedelta(days=1)).isoformat()),
        headers=auth_headers(seller),
    ).json()
    image = upload_png(created["id"], seller).json()
    activated = client.post(f"/api/auctions/{created['id']}/activate", headers=auth_headers(seller))
    delete_last_image = client.delete(f"/api/auctions/{created['id']}/images/{image['id']}", headers=auth_headers(seller))
    cancelled = client.post(f"/api/auctions/{created['id']}/cancel", headers=auth_headers(seller))
    reactivate_cancelled = client.post(f"/api/auctions/{created['id']}/activate", headers=auth_headers(seller))

    assert activated.status_code == 200
    assert activated.json()["status"] == "active"
    assert delete_last_image.status_code == 409
    assert cancelled.status_code == 200
    assert reactivate_cancelled.status_code == 409


def test_finalize_rejects_sold_without_winner_and_unsold_with_winner() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-finalize-rules@auction-test.local")
    winner = create_test_user("winner-finalize-rules@auction-test.local")
    admin = create_test_user("admin-finalize-rules@auction-test.local", role="admin")

    sold_candidate = create_expired_auction_with_image(seller)
    unsold_candidate = create_expired_auction_with_image(seller)
    sold_without_winner = client.post(
        f"/api/auctions/{sold_candidate['id']}/admin/finalize",
        json={"status": "sold"},
        headers=auth_headers(admin),
    )
    unsold_with_winner = client.post(
        f"/api/auctions/{unsold_candidate['id']}/admin/finalize",
        json={"status": "unsold", "winner_id": winner.id},
        headers=auth_headers(admin),
    )

    assert sold_without_winner.status_code == 422
    assert unsold_with_winner.status_code == 422


def test_chat_between_seller_and_winner_and_review_rating_boundaries() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-chat-rules@auction-test.local")
    winner = create_test_user("winner-chat-rules@auction-test.local")
    admin = create_test_user("admin-chat-rules@auction-test.local", role="admin")
    sold = create_sold_auction(seller, winner, admin)
    complete_auction_transaction(seller, winner)

    seller_message = client.post(f"/api/auctions/{sold['id']}/messages", json={"message": "Sikeres aukciĂł utĂˇn."}, headers=auth_headers(seller))
    winner_reads = client.get(f"/api/auctions/{sold['id']}/messages", headers=auth_headers(winner))
    low_rating = client.post(f"/api/auctions/{sold['id']}/reviews", json={"rating": 0}, headers=auth_headers(winner))
    high_rating = client.post(f"/api/auctions/{sold['id']}/reviews", json={"rating": 6}, headers=auth_headers(winner))

    assert seller_message.status_code == 201
    assert winner_reads.status_code == 200
    assert winner_reads.json()[0]["message"] == "Sikeres aukciĂł utĂˇn."
    assert low_rating.status_code == 422
    assert high_rating.status_code == 422


def test_reviewed_user_spoofing_is_ignored_and_self_review_is_not_possible() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-review-spoof@auction-test.local")
    winner = create_test_user("winner-review-spoof@auction-test.local")
    admin = create_test_user("admin-review-spoof@auction-test.local", role="admin")
    sold = create_sold_auction(seller, winner, admin)

    complete_auction_transaction(seller, winner)

    spoofed_review = client.post(
        f"/api/auctions/{sold['id']}/reviews",
        json={"rating": 5, "reviewed_user_id": winner.id, "comment": "A reviewed user mezĹ‘t a backend figyelmen kĂ­vĂĽl hagyja."},
        headers=auth_headers(winner),
    )

    assert spoofed_review.status_code == 201
    assert spoofed_review.json()["reviewer_id"] == winner.id
    assert spoofed_review.json()["reviewed_user_id"] == seller.id
