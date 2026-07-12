import base64
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models.auction import Auction, AuctionImage, AuctionMessage, AuctionReview, Bid, WatchlistItem
from app.models.notification import Notification
from app.models.security_log import AuditLog
from app.models.user import User
from app.services.auction_scheduler import close_expired_auctions


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
            full_name="Production Test User",
            password_hash=hash_password("ProductionTest123!"),
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
        db.execute(delete(User).where(User.email.like("%@production-test.local")))
        db.commit()
    finally:
        db.close()


def auction_payload(**overrides):
    now = datetime.now(timezone.utc)
    payload = {
        "title": "Production readiness aukcio",
        "description": "Sprint ot production readiness teszt aukcio leirasa.",
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
    return client.get(f"/api/auctions/{created['id']}", headers=auth_headers(seller)).json()


def test_notification_center_read_flow_and_idor() -> None:
    cleanup_test_data()
    owner = create_test_user("owner-notifications@production-test.local")
    stranger = create_test_user("stranger-notifications@production-test.local")
    db = SessionLocal()
    try:
        notification = Notification(user_id=owner.id, type="outbid", title="Teszt", message="Teszt uzenet")
        other_notification = Notification(user_id=stranger.id, type="auction_won", title="Masik", message="Masik uzenet")
        db.add_all([notification, other_notification])
        db.commit()
        db.refresh(notification)
        db.refresh(other_notification)
        notification_id = notification.id
        other_notification_id = other_notification.id
    finally:
        db.close()

    list_response = client.get("/api/notifications", headers=auth_headers(owner))
    unread_response = client.get("/api/notifications/unread-count", headers=auth_headers(owner))
    read_response = client.post(f"/api/notifications/{notification_id}/read", headers=auth_headers(owner))
    idor_response = client.post(f"/api/notifications/{other_notification_id}/read", headers=auth_headers(owner))
    mark_all_response = client.post("/api/notifications/mark-all-read", headers=auth_headers(owner))

    assert list_response.status_code == 200
    assert len(list_response.json()) == 1
    assert unread_response.json()["unread_count"] == 1
    assert read_response.status_code == 200
    assert read_response.json()["is_read"] is True
    assert idor_response.status_code == 404
    assert mark_all_response.status_code == 200


def test_watchlist_crud_and_private_auction_idor() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-watchlist@production-test.local")
    watcher = create_test_user("watcher-watchlist@production-test.local")
    active = create_active_auction(seller)
    draft = client.post("/api/auctions", json=auction_payload(title="Privat draft aukcio"), headers=auth_headers(seller)).json()

    add_response = client.post(f"/api/watchlist/{active['id']}", headers=auth_headers(watcher))
    duplicate_response = client.post(f"/api/watchlist/{active['id']}", headers=auth_headers(watcher))
    list_response = client.get("/api/watchlist", headers=auth_headers(watcher))
    private_response = client.post(f"/api/watchlist/{draft['id']}", headers=auth_headers(watcher))
    delete_response = client.delete(f"/api/watchlist/{active['id']}", headers=auth_headers(watcher))
    empty_response = client.get("/api/watchlist", headers=auth_headers(watcher))

    assert add_response.status_code == 201
    assert duplicate_response.status_code == 201
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1
    assert private_response.status_code == 404
    assert delete_response.status_code == 204
    assert empty_response.json() == []


def test_admin_moderation_suspend_restore_soft_delete_and_audit() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-moderation@production-test.local")
    admin = create_test_user("admin-moderation@production-test.local", role="admin")
    normal_user = create_test_user("normal-moderation@production-test.local")
    auction = create_active_auction(seller)

    forbidden = client.post(f"/api/admin/auctions/{auction['id']}/suspend", json={"reason": "Nem admin."}, headers=auth_headers(normal_user))
    suspend_response = client.post(f"/api/admin/auctions/{auction['id']}/suspend", json={"reason": "Moderacios ellenorzes."}, headers=auth_headers(admin))
    hidden_after_suspend = client.get(f"/api/auctions/{auction['id']}")
    restore_response = client.post(f"/api/admin/auctions/{auction['id']}/restore", json={"reason": "Rendben."}, headers=auth_headers(admin))
    delete_response = client.request("DELETE", f"/api/admin/auctions/{auction['id']}", json={"reason": "Soft delete teszt."}, headers=auth_headers(admin))
    hidden_after_delete = client.get(f"/api/auctions/{auction['id']}")

    db = SessionLocal()
    try:
        audit_actions = [row[0] for row in db.execute(select(AuditLog.action).where(AuditLog.auction_id == auction["id"]).order_by(AuditLog.id)).all()]
    finally:
        db.close()

    assert forbidden.status_code == 403
    assert suspend_response.status_code == 200
    assert suspend_response.json()["status"] == "suspended"
    assert hidden_after_suspend.status_code == 404
    assert restore_response.status_code == 200
    assert restore_response.json()["status"] == "active"
    assert delete_response.status_code == 200
    assert hidden_after_delete.status_code == 404
    assert "auction_moderated_suspend" in audit_actions
    assert "auction_moderated_restore" in audit_actions
    assert "auction_moderated_delete" in audit_actions


def test_scheduler_creates_close_notifications_and_audit_log() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-scheduler@production-test.local")
    bidder = create_test_user("bidder-scheduler@production-test.local")
    auction = create_active_auction(seller)
    client.post(f"/api/auctions/{auction['id']}/bids", json={"amount": "1100.00"}, headers=auth_headers(bidder))

    db = SessionLocal()
    try:
        auction_row = db.get(Auction, auction["id"])
        assert auction_row is not None
        auction_row.ends_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.add(auction_row)
        db.commit()
        assert close_expired_auctions(db) == 1
        notification_types = [row[0] for row in db.execute(select(Notification.type).where(Notification.auction_id == auction["id"])).all()]
        audit_exists = db.scalar(select(AuditLog).where(AuditLog.auction_id == auction["id"], AuditLog.action == "auction_status_changed")) is not None
    finally:
        db.close()

    assert "auction_won" in notification_types
    assert "auction_sold" in notification_types
    assert audit_exists is True


def test_lifespan_startup_health_check() -> None:
    with TestClient(app) as lifespan_client:
        response = lifespan_client.get("/api/health")

    assert response.status_code == 200
