from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models.auction import Auction, WatchlistItem
from app.models.notification import Notification, NotificationOutbox, NotificationPreference, WatchlistReminder
from app.models.user import User
from app.services.notification_dispatcher import dispatch_notification
from app.services.auction_scheduler import send_due_two_hour_reminders, send_due_watchlist_reminders
from app.services.notification_outbox import process_outbox_batch

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
    db.execute(delete(NotificationOutbox))
    db.execute(delete(Notification).where(Notification.user_id.in_(select(User.id).where(User.email.like("%@sprint16-test.local")))))
    db.execute(delete(NotificationPreference).where(NotificationPreference.user_id.in_(select(User.id).where(User.email.like("%@sprint16-test.local")))))
    db.execute(delete(Auction).where(Auction.title.like("Sprint 16 %")))
    db.execute(delete(User).where(User.email.like("%@sprint16-test.local")))
    db.commit(); db.close()


def test_dispatcher_respects_matrix_and_deduplicates(monkeypatch) -> None:
    cleanup(); user = create_user("dispatcher")
    published: list[tuple[int, str, dict]] = []
    monkeypatch.setattr("app.services.notification_outbox.publish_user_event", lambda user_id, event_type, payload: published.append((user_id, event_type, payload)) or "1-0")
    db = SessionLocal()
    db.add(NotificationPreference(user_id=user.id, category="auction_message", in_app=True, browser=True, email=False)); db.commit()
    first = dispatch_notification(db, user_id=user.id, notification_type="auction_message", title="Új üzenet", message="Teszt", event_key=f"chat:test:{user.id}")
    second = dispatch_notification(db, user_id=user.id, notification_type="auction_message", title="Duplikáció", message="Teszt", event_key=f"chat:test:{user.id}")
    db.commit()
    process_outbox_batch()
    assert first.id == second.id
    assert first.category == "chat" and first.browser_enabled is True and first.email_enabled is False
    assert len(published) == 1
    db.close(); cleanup()


def test_notification_matrix_roundtrip() -> None:
    cleanup(); user = create_user("preferences")
    initial = client.get("/api/notifications/preferences", headers=headers(user))
    assert initial.status_code == 200 and set(initial.json()["categories"]) == set(NotificationPreference.PREFERENCE_KEYS)
    assert initial.json()["push_defaults_eligible"] is True
    payload = {"categories": initial.json()["categories"]}
    for category in payload["categories"]:
        payload["categories"][category] = {
            "in_app": category != "system",
            "browser": True,
            "email": category in {"outbid", "auction_won", "transaction_updates", "moderation"},
            "push": False,
        }
    updated = client.put("/api/notifications/preferences", json=payload, headers=headers(user))
    reloaded = client.get("/api/notifications/preferences", headers=headers(user))
    assert updated.status_code == 200
    assert reloaded.status_code == 200
    expected = {**payload, "push_defaults_eligible": False}
    assert updated.json() == expected
    assert reloaded.json() == expected
    cleanup()


def test_all_notification_categories_respect_disabled_channels(monkeypatch) -> None:
    cleanup(); user = create_user("all-categories")
    published: list[tuple[int, str, dict]] = []
    emailed: list[int] = []
    monkeypatch.setattr("app.services.notification_outbox.publish_user_event", lambda user_id, event_type, payload: published.append((user_id, event_type, payload)) or "1-0")
    monkeypatch.setattr("app.services.notification_outbox.send_notification_email", lambda _user, notification: emailed.append(notification.id) or True)
    cases = {
        "outbid": ("outbid", "bids"),
        "auction_message": ("auction_message", "chat"),
        "seller_new_auction": ("seller_new_auction", "follows"),
        "transaction_opened": ("transaction_updates", "transactions"),
        "review_received": ("review_received", "reviews"),
        "moderation_action": ("moderation", "moderation"),
        "saved_search_match": ("system", "system"),
    }
    db = SessionLocal()
    for preference_key, _category in cases.values():
        db.add(NotificationPreference(user_id=user.id, category=preference_key, in_app=False, browser=False, email=False))
    db.commit()
    for notification_type, (preference_key, category) in cases.items():
        item = dispatch_notification(
            db,
            user_id=user.id,
            notification_type=notification_type,
            title=f"{category} teszt",
            message="Kikapcsolt csatornák tesztje.",
            event_key=f"preference:{preference_key}:{user.id}",
        )
        assert item.category == category
        assert item.in_app_enabled is False
        assert item.browser_enabled is False
        assert item.email_enabled is False
    db.commit()
    process_outbox_batch()
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
    monkeypatch.setattr("app.services.notification_outbox.publish_user_event", lambda _user_id, _event_type, payload: published.append(payload) or "1-0")
    monkeypatch.setattr("app.services.notification_outbox.should_email", lambda _user, _notification_type: True)
    monkeypatch.setattr("app.services.notification_outbox.send_notification_email", lambda _user, notification: emailed.append(notification.id) or True)
    monkeypatch.setattr("app.services.notification_outbox.settings.email_delivery_enabled", True)
    db = SessionLocal()
    db.add(NotificationPreference(user_id=user.id, category="outbid", in_app=True, browser=True, email=True)); db.commit()
    item = dispatch_notification(db, user_id=user.id, notification_type="outbid", title="Rád licitáltak", message="Teszt", event_key=f"enabled:bids:{user.id}")
    db.commit()
    process_outbox_batch()
    assert item.in_app_enabled is True and item.browser_enabled is True and item.email_enabled is True
    assert published[0]["in_app_enabled"] is True and published[0]["browser_enabled"] is True and published[0]["email_enabled"] is True
    assert emailed == [item.id]
    db.close(); cleanup()


def test_typing_and_presence_are_participant_only() -> None:
    cleanup(); seller, winner, outsider = create_user("seller"), create_user("winner"), create_user("outsider")
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    auction = Auction(seller_id=seller.id, winner_id=winner.id, title="Sprint 16 privát chat", description="Lezárt aukció privát realtime tesztje.", category="Pokemon", condition="NM", status="sold", starting_price=1000, bid_increment=100, current_price=1200, buy_now_enabled=False, starts_at=now-timedelta(days=2), ends_at=now-timedelta(days=1), seller_declaration_accepted_at=now-timedelta(days=2), seller_declaration_version="test", finalized_at=now-timedelta(days=1))
    db.add(auction); db.commit(); db.refresh(auction); auction_id = auction.id; db.close()
    assert client.get(f"/api/realtime/auctions/{auction_id}/presence", headers=headers(outsider)).status_code == 403
    assert client.post(f"/api/realtime/auctions/{auction_id}/typing", headers=headers(outsider)).status_code == 403
    assert client.get(f"/api/realtime/auctions/{auction_id}/presence", headers=headers(seller)).status_code == 200
    cleanup()


def test_watchlist_reminder_is_sent_once_at_due_threshold(monkeypatch) -> None:
    cleanup(); user = create_user("reminder"); now = datetime.now(timezone.utc)
    db = SessionLocal()
    stored_user = db.get(User, user.id)
    stored_user.vip_expires_at = now + timedelta(days=1)
    stored_user.vip_reminder_five_minutes = True
    auction = Auction(seller_id=user.id, title="Sprint 16 emlékeztető", description="Figyelőlista emlékeztető scheduler teszt.", category="Pokemon", condition="NM", status="active", starting_price=1000, bid_increment=100, current_price=1000, buy_now_enabled=False, starts_at=now-timedelta(days=1), ends_at=now+timedelta(minutes=5), seller_declaration_accepted_at=now-timedelta(days=1), seller_declaration_version="test")
    db.add(auction); db.flush()
    db.add(WatchlistReminder(user_id=user.id, auction_id=auction.id, minutes_before=5, created_at=now-timedelta(hours=1))); db.commit()
    sent: list[str] = []
    monkeypatch.setattr("app.services.auction_scheduler.dispatch_notification", lambda _db, **kwargs: sent.append(kwargs["event_key"]))
    assert send_due_watchlist_reminders(db) == 1
    db.commit()
    assert len(sent) == 1
    assert send_due_watchlist_reminders(db) == 0
    db.close(); cleanup()


def test_standard_two_hour_watchlist_reminder_is_current_and_idempotent() -> None:
    cleanup(); seller, watcher = create_user("two-hour-seller"), create_user("two-hour-watcher")
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    auction = Auction(seller_id=seller.id, title="Sprint 16 kétórás emlékeztető", description="Általános figyelőlista-emlékeztető teszt.", category="Pokemon", condition="NM", status="active", starting_price=1000, bid_increment=100, current_price=1000, buy_now_enabled=False, starts_at=now-timedelta(days=1), ends_at=now+timedelta(hours=2), seller_declaration_accepted_at=now-timedelta(days=1), seller_declaration_version="test")
    db.add(auction); db.flush()
    db.add(WatchlistItem(user_id=watcher.id, auction_id=auction.id, created_at=now-timedelta(hours=3)))
    db.add(NotificationPreference(user_id=watcher.id, category="watchlist_reminder", email=False, push=False))
    db.commit()

    assert send_due_two_hour_reminders(db) == 2
    db.commit()
    assert send_due_two_hour_reminders(db) == 0
    reminder = db.scalar(select(Notification).where(Notification.user_id == watcher.id, Notification.type == "watchlist_reminder"))
    assert reminder is not None and reminder.auction_id == auction.id and reminder.target_url == f"/auctions/{auction.id}"
    assert {task.task_type for task in db.scalars(select(NotificationOutbox).where(NotificationOutbox.notification_id == reminder.id))} == {"realtime"}
    assert db.scalar(select(Notification).where(Notification.user_id == seller.id, Notification.type == "seller_auction_reminder")) is not None
    db.close(); cleanup()


def test_standard_watchlist_reminder_skips_unwatched_and_cancelled_auctions() -> None:
    cleanup(); seller, watcher = create_user("skip-seller"), create_user("skip-watcher")
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    active = Auction(seller_id=seller.id, title="Sprint 16 levett figyelés", description="Már nem figyelt aukció teszt.", category="Pokemon", condition="NM", status="active", starting_price=1000, bid_increment=100, current_price=1000, buy_now_enabled=False, starts_at=now-timedelta(days=1), ends_at=now+timedelta(hours=2), seller_declaration_accepted_at=now-timedelta(days=1), seller_declaration_version="test")
    cancelled = Auction(seller_id=seller.id, title="Sprint 16 megszakított figyelés", description="Megszakított aukció teszt.", category="Pokemon", condition="NM", status="cancelled", starting_price=1000, bid_increment=100, current_price=1000, buy_now_enabled=False, starts_at=now-timedelta(days=1), ends_at=now+timedelta(hours=1), seller_declaration_accepted_at=now-timedelta(days=1), seller_declaration_version="test")
    db.add_all([active, cancelled]); db.flush()
    db.add(WatchlistItem(user_id=watcher.id, auction_id=cancelled.id, created_at=now-timedelta(hours=3)))
    db.commit()

    send_due_two_hour_reminders(db); db.commit()
    watched_notifications = list(db.scalars(select(Notification).where(Notification.user_id == watcher.id, Notification.type == "watchlist_reminder")))
    assert watched_notifications == []
    db.close(); cleanup()
