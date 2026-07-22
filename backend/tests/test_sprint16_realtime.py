from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models.auction import Auction
from app.models.notification import Notification, NotificationPreference, WatchlistReminder
from app.models.user import User
from app.services.notification_dispatcher import dispatch_notification
from app.services.auction_scheduler import send_due_watchlist_reminders

client = TestClient(app)


def create_user(label: str) -> User:
    db = SessionLocal()
    db.execute(delete(WatchlistReminder).where(WatchlistReminder.user_id.in_(select(User.id).where(User.email.like("%@sprint16-test.local")))))
    user = User(email=f"{label}-{uuid4().hex[:8]}@sprint16-test.local", username=f"{label}-{uuid4().hex[:8]}", full_name=label, password_hash=hash_password("Sprint16Test!"), role="user", is_active=True, is_email_verified=True)
    db.add(user); db.commit(); db.refresh(user); db.close()
    return user


def headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(subject=user.id)}"}


def cleanup() -> None:
    db = SessionLocal()
    db.execute(delete(Notification).where(Notification.user_id.in_(select(User.id).where(User.email.like("%@sprint16-test.local")))))
    db.execute(delete(NotificationPreference).where(NotificationPreference.user_id.in_(select(User.id).where(User.email.like("%@sprint16-test.local")))))
    db.execute(delete(Auction).where(Auction.title.like("Sprint 16 %")))
    db.execute(delete(User).where(User.email.like("%@sprint16-test.local")))
    db.commit(); db.close()


def test_dispatcher_respects_matrix_and_deduplicates(monkeypatch) -> None:
    cleanup(); user = create_user("dispatcher")
    published: list[tuple[int, str, dict]] = []
    monkeypatch.setattr("app.services.notification_dispatcher.publish_user_event", lambda user_id, event_type, payload: published.append((user_id, event_type, payload)))
    db = SessionLocal()
    db.add(NotificationPreference(user_id=user.id, category="chat", in_app=True, browser=True, email=False)); db.commit()
    first = dispatch_notification(db, user_id=user.id, notification_type="auction_message", title="Új üzenet", message="Teszt", event_key=f"chat:test:{user.id}")
    second = dispatch_notification(db, user_id=user.id, notification_type="auction_message", title="Duplikáció", message="Teszt", event_key=f"chat:test:{user.id}")
    db.commit()
    assert first.id == second.id
    assert first.category == "chat" and first.browser_enabled is True and first.email_enabled is False
    assert len(published) == 1
    db.close(); cleanup()


def test_notification_matrix_roundtrip() -> None:
    cleanup(); user = create_user("preferences")
    initial = client.get("/api/notifications/preferences", headers=headers(user))
    assert initial.status_code == 200 and set(initial.json()["categories"]) == {"bids", "chat", "follows", "transactions", "reviews", "moderation", "system"}
    payload = initial.json()
    for category in payload["categories"]:
        payload["categories"][category] = {"in_app": category != "system", "browser": True, "email": category in {"bids", "transactions", "moderation"}}
    updated = client.put("/api/notifications/preferences", json=payload, headers=headers(user))
    reloaded = client.get("/api/notifications/preferences", headers=headers(user))
    assert updated.status_code == 200
    assert reloaded.status_code == 200
    assert updated.json() == payload
    assert reloaded.json() == payload
    cleanup()


def test_all_notification_categories_respect_disabled_channels(monkeypatch) -> None:
    cleanup(); user = create_user("all-categories")
    published: list[tuple[int, str, dict]] = []
    emailed: list[int] = []
    monkeypatch.setattr("app.services.notification_dispatcher.publish_user_event", lambda user_id, event_type, payload: published.append((user_id, event_type, payload)))
    monkeypatch.setattr("app.services.notification_dispatcher.send_notification_email", lambda _user, notification: emailed.append(notification.id))
    cases = {
        "outbid": "bids",
        "auction_message": "chat",
        "seller_new_auction": "follows",
        "transaction_opened": "transactions",
        "review_received": "reviews",
        "moderation_action": "moderation",
        "saved_search_match": "system",
    }
    db = SessionLocal()
    for category in cases.values():
        db.add(NotificationPreference(user_id=user.id, category=category, in_app=False, browser=False, email=False))
    db.commit()
    for notification_type, category in cases.items():
        item = dispatch_notification(
            db,
            user_id=user.id,
            notification_type=notification_type,
            title=f"{category} teszt",
            message="Kikapcsolt csatornák tesztje.",
            event_key=f"category:{category}:{user.id}",
        )
        assert item.category == category
        assert item.in_app_enabled is False
        assert item.browser_enabled is False
        assert item.email_enabled is False
    db.commit()
    assert len(published) == 7
    assert all(event_type == "notification" for _, event_type, _ in published)
    assert all(payload["in_app_enabled"] is False and payload["browser_enabled"] is False and payload["email_enabled"] is False for _, _, payload in published)
    assert emailed == []
    db.close()
    listed = client.get("/api/notifications", headers=headers(user))
    unread = client.get("/api/notifications/unread-count", headers=headers(user))
    assert listed.status_code == 200 and listed.json() == []
    assert unread.status_code == 200 and unread.json()["unread_count"] == 0
    cleanup()


def test_enabled_email_and_browser_channels_are_forwarded(monkeypatch) -> None:
    cleanup(); user = create_user("enabled-channels")
    published: list[dict] = []
    emailed: list[int] = []
    monkeypatch.setattr("app.services.notification_dispatcher.publish_user_event", lambda _user_id, _event_type, payload: published.append(payload))
    monkeypatch.setattr("app.services.notification_dispatcher.send_notification_email", lambda _user, notification: emailed.append(notification.id))
    db = SessionLocal()
    db.add(NotificationPreference(user_id=user.id, category="bids", in_app=True, browser=True, email=True)); db.commit()
    item = dispatch_notification(db, user_id=user.id, notification_type="outbid", title="Rád licitáltak", message="Teszt", event_key=f"enabled:bids:{user.id}")
    db.commit()
    assert item.in_app_enabled is True and item.browser_enabled is True and item.email_enabled is True
    assert published[0]["in_app_enabled"] is True and published[0]["browser_enabled"] is True and published[0]["email_enabled"] is True
    assert emailed == [item.id]
    db.close(); cleanup()


def test_typing_and_presence_are_participant_only() -> None:
    cleanup(); seller, winner, outsider = create_user("seller"), create_user("winner"), create_user("outsider")
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    auction = Auction(seller_id=seller.id, winner_id=winner.id, title="Sprint 16 privát chat", description="Lezárt aukció privát realtime tesztje.", category="Pokemon", condition="like_new", status="sold", starting_price=1000, bid_increment=100, current_price=1200, buy_now_enabled=False, starts_at=now-timedelta(days=2), ends_at=now-timedelta(days=1), seller_declaration_accepted_at=now-timedelta(days=2), seller_declaration_version="test", finalized_at=now-timedelta(days=1))
    db.add(auction); db.commit(); db.refresh(auction); auction_id = auction.id; db.close()
    assert client.get(f"/api/realtime/auctions/{auction_id}/presence", headers=headers(outsider)).status_code == 403
    assert client.post(f"/api/realtime/auctions/{auction_id}/typing", headers=headers(outsider)).status_code == 403
    assert client.get(f"/api/realtime/auctions/{auction_id}/presence", headers=headers(seller)).status_code == 200
    cleanup()


def test_watchlist_reminder_is_sent_once_at_due_threshold(monkeypatch) -> None:
    cleanup(); user = create_user("reminder"); now = datetime.now(timezone.utc)
    db = SessionLocal()
    auction = Auction(seller_id=user.id, title="Sprint 16 emlékeztető", description="Figyelőlista emlékeztető scheduler teszt.", category="Pokemon", condition="like_new", status="active", starting_price=1000, bid_increment=100, current_price=1000, buy_now_enabled=False, starts_at=now-timedelta(days=1), ends_at=now+timedelta(minutes=5), seller_declaration_accepted_at=now-timedelta(days=1), seller_declaration_version="test")
    db.add(auction); db.flush()
    db.add(WatchlistReminder(user_id=user.id, auction_id=auction.id, minutes_before=5, created_at=now-timedelta(hours=1))); db.commit()
    sent: list[str] = []
    monkeypatch.setattr("app.services.auction_scheduler.dispatch_notification", lambda _db, **kwargs: sent.append(kwargs["event_key"]))
    assert send_due_watchlist_reminders(db) == 1
    db.commit()
    assert len(sent) == 1
    assert send_due_watchlist_reminders(db) == 0
    db.close(); cleanup()
