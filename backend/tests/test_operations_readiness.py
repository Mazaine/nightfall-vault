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
            full_name="Ops Test User",
            password_hash=hash_password("OpsTest123!"),
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
        db.execute(delete(User).where(User.email.like("%@ops-test.local")))
        db.commit()
    finally:
        db.close()


def auction_payload(**overrides):
    now = datetime.now(timezone.utc)
    payload = {
        "title": "Ops readiness aukcio",
        "description": "Sprint hat operations readiness teszt aukcio leirasa.",
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


def test_health_endpoints_and_request_id() -> None:
    live = client.get("/health/live", headers={"X-Request-ID": "ops-test-request"})
    ready = client.get("/health/ready")
    health = client.get("/health")

    assert live.status_code == 200
    assert live.headers["X-Request-ID"] == "ops-test-request"
    assert ready.status_code == 200
    assert set(ready.json()["checks"]) == {"postgres", "alembic", "redis", "storage"}
    assert "database_url" not in str(ready.json()).lower()
    assert health.status_code == 200


def test_audit_log_admin_api_filters_and_blocks_normal_user() -> None:
    cleanup_test_data()
    admin = create_test_user("admin-audit@ops-test.local", role="admin")
    user = create_test_user("user-audit@ops-test.local")
    db = SessionLocal()
    try:
        auction = Auction(
            seller_id=admin.id,
            title="Audit log auction",
            description="Audit log FK target",
            category="Pokemon",
            condition="like_new",
            starting_price=1000,
            current_price=1000,
            bid_increment=100,
            starts_at=datetime.now(timezone.utc) - timedelta(minutes=1),
            ends_at=datetime.now(timezone.utc) + timedelta(hours=1),
            status="draft",
            seller_declaration_accepted_at=datetime.now(timezone.utc),
        )
        db.add(auction)
        db.flush()
        log = AuditLog(user_id=admin.id, action="auction_bid", path="domain", method="SYSTEM", auction_id=auction.id)
        db.add(log)
        db.commit()
    finally:
        db.close()

    forbidden = client.get("/api/admin/audit-logs", headers=auth_headers(user))
    filtered = client.get("/api/admin/audit-logs?action=auction_bid", headers=auth_headers(admin))

    assert forbidden.status_code == 403
    assert filtered.status_code == 200
    assert filtered.json()["items"][0]["action"] == "auction_bid"


def test_notification_preferences_are_self_scoped() -> None:
    cleanup_test_data()
    user = create_test_user("prefs@ops-test.local")

    before = client.get("/api/auth/me/notification-preferences", headers=auth_headers(user))
    update = client.put(
        "/api/auth/me/notification-preferences",
        headers=auth_headers(user),
        json={
            "notify_in_app": True,
            "notify_email_outbid": False,
            "notify_email_auction_result": True,
            "notify_email_moderation": False,
        },
    )

    assert before.status_code == 200
    assert update.status_code == 200
    assert update.json()["notify_email_outbid"] is False


def test_image_variants_are_created_and_corrupt_file_is_rejected() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-image@ops-test.local")
    created = client.post("/api/auctions", json=auction_payload(), headers=auth_headers(seller)).json()

    image = client.post(
        f"/api/auctions/{created['id']}/images",
        headers=auth_headers(seller),
        files={"image": ("card.png", VALID_PNG, "image/png")},
    )
    corrupt = client.post(
        f"/api/auctions/{created['id']}/images",
        headers=auth_headers(seller),
        files={"image": ("bad.png", b"\x89PNG\r\n\x1a\nnot-real", "image/png")},
    )

    assert image.status_code == 201
    assert image.json()["thumbnail_storage_key"]
    assert image.json()["list_storage_key"]
    assert image.json()["detail_storage_key"]
    assert image.json()["width"] == 1
    assert corrupt.status_code == 400
