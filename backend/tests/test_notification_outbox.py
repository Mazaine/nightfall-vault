from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import delete, select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.notification import Notification, NotificationOutbox, NotificationPreference
from app.models.user import User
from app.services.notification_dispatcher import dispatch_notification
from app.services.notification_outbox import DeliveryError, claim_next_outbox_item, process_outbox_item
from app.services.notification_targets import validate_notification_target_url


def create_user() -> User:
    db = SessionLocal()
    user = User(
        email=f"outbox-{uuid4().hex}@notification-outbox-test.local",
        username=f"outbox-{uuid4().hex[:12]}",
        full_name="Outbox Test",
        password_hash=hash_password("OutboxTest!"),
        role="user",
        is_active=True,
        is_email_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.expunge(user)
    db.close()
    return user


def cleanup() -> None:
    db = SessionLocal()
    user_ids = select(User.id).where(User.email.like("%@notification-outbox-test.local"))
    # Other notification tests intentionally do not run the worker, so their
    # pending rows must not influence which item this worker-focused suite claims.
    db.execute(delete(NotificationOutbox))
    db.execute(delete(Notification).where(Notification.user_id.in_(user_ids)))
    db.execute(delete(NotificationPreference).where(NotificationPreference.user_id.in_(user_ids)))
    db.execute(delete(User).where(User.email.like("%@notification-outbox-test.local")))
    db.commit()
    db.close()


@pytest.fixture(autouse=True)
def isolated_outbox_data():
    cleanup()
    yield
    cleanup()


def enqueue(user: User, event_key: str, *, email: bool = False) -> tuple[int, int]:
    db = SessionLocal()
    if email:
        db.add(NotificationPreference(user_id=user.id, category="bids", in_app=True, browser=False, email=True))
        db.commit()
    notification = dispatch_notification(
        db,
        user_id=user.id,
        notification_type="outbid",
        title="Teszt",
        message="Teszt értesítés",
        event_key=event_key,
    )
    db.commit()
    notification_id = notification.id
    outbox_id = db.scalar(select(NotificationOutbox.id).where(NotificationOutbox.notification_id == notification_id, NotificationOutbox.task_type == "realtime"))
    db.close()
    return notification_id, outbox_id


def test_rollback_removes_notification_and_outbox_without_side_effects(monkeypatch) -> None:
    user = create_user()
    published: list[int] = []
    emailed: list[int] = []
    monkeypatch.setattr("app.services.notification_outbox.publish_user_event", lambda *_args: published.append(1))
    monkeypatch.setattr("app.services.notification_outbox.send_notification_email", lambda *_args: emailed.append(1))
    db = SessionLocal()
    db.add(NotificationPreference(user_id=user.id, category="bids", in_app=True, browser=False, email=True))
    db.commit()
    dispatch_notification(db, user_id=user.id, notification_type="outbid", title="Teszt", message="Rollback", event_key="rollback:test")
    db.rollback()
    assert db.scalar(select(Notification).where(Notification.event_key == "rollback:test")) is None
    assert db.scalar(select(NotificationOutbox).where(NotificationOutbox.event_key == "rollback:test")) is None
    assert published == []
    assert emailed == []
    db.close()


def test_commit_creates_processable_deduplicated_outbox_item(monkeypatch) -> None:
    user = create_user()
    published: list[int] = []
    monkeypatch.setattr("app.services.notification_outbox.publish_user_event", lambda user_id, *_args: published.append(user_id) or "1-0")
    db = SessionLocal()
    first = dispatch_notification(db, user_id=user.id, notification_type="outbid", title="Első", message="Teszt", event_key="commit:test")
    second = dispatch_notification(db, user_id=user.id, notification_type="outbid", title="Második", message="Teszt", event_key="commit:test")
    db.commit()
    assert first.id == second.id
    items = list(db.scalars(select(NotificationOutbox).where(NotificationOutbox.event_key == "commit:test")).all())
    assert len(items) == 1 and items[0].status == "pending"
    item_id = claim_next_outbox_item(db)
    db.close()
    assert process_outbox_item(item_id) is True
    assert published == [user.id]


def test_worker_retries_transient_failure(monkeypatch) -> None:
    user = create_user()
    _, outbox_id = enqueue(user, "retry:test")
    monkeypatch.setattr("app.services.notification_outbox.publish_user_event", lambda *_args: None)
    db = SessionLocal()
    assert claim_next_outbox_item(db) == outbox_id
    db.close()
    assert process_outbox_item(outbox_id) is False
    db = SessionLocal()
    item = db.get(NotificationOutbox, outbox_id)
    assert item.status == "retry" and item.attempts == 1 and item.last_error == "realtime_unavailable"
    assert item.next_attempt_at > datetime.now(timezone.utc)
    db.close()


def test_worker_stops_retrying_permanent_failure(monkeypatch) -> None:
    user = create_user()
    _, outbox_id = enqueue(user, "permanent:test")
    monkeypatch.setattr("app.services.notification_outbox.deliver_outbox_item", lambda *_args: (_ for _ in ()).throw(DeliveryError("permanent_test_error", transient=False)))
    db = SessionLocal()
    assert claim_next_outbox_item(db) == outbox_id
    db.close()
    assert process_outbox_item(outbox_id) is False
    db = SessionLocal()
    item = db.get(NotificationOutbox, outbox_id)
    assert item.status == "failed" and item.processed_at is not None and item.last_error == "permanent_test_error"
    db.close()


def test_claim_prevents_second_worker_from_taking_same_item(monkeypatch) -> None:
    user = create_user()
    _, outbox_id = enqueue(user, "parallel:test")
    monkeypatch.setattr("app.services.notification_outbox.publish_user_event", lambda *_args: "1-0")
    first_db = SessionLocal()
    second_db = SessionLocal()
    assert claim_next_outbox_item(first_db) == outbox_id
    assert claim_next_outbox_item(second_db) is None
    first_db.close()
    second_db.close()
    assert process_outbox_item(outbox_id) is True


def test_delivery_failure_does_not_rollback_committed_domain_data(monkeypatch) -> None:
    user = create_user()
    notification_id, outbox_id = enqueue(user, "future-channel:test")
    monkeypatch.setattr("app.services.notification_outbox.deliver_outbox_item", lambda *_args: (_ for _ in ()).throw(DeliveryError("future_channel_unavailable", transient=True)))
    db = SessionLocal()
    assert claim_next_outbox_item(db) == outbox_id
    db.close()
    assert process_outbox_item(outbox_id) is False
    db = SessionLocal()
    assert db.get(Notification, notification_id) is not None
    assert db.get(NotificationOutbox, outbox_id).status == "retry"
    db.close()


@pytest.mark.parametrize("target", [
    "/auctions/1",
    "/account/transactions",
    "/account/notifications",
    "/account/messages",
    "/users/teszt-felhasznalo",
])
def test_valid_notification_targets_are_accepted(target: str) -> None:
    assert validate_notification_target_url(target) == target


@pytest.mark.parametrize("target", [
    "",
    "https://example.com",
    "http://example.com",
    "//example.com/path",
    "/auctions/",
    "/auctions/0",
    "/auctions/not-a-number",
    "/account/unknown",
    "/auctions/1\\evil",
    "/auctions/../admin",
    "/auctions/%2e%2e/admin",
    "/auctions/%2Fadmin",
])
def test_unsafe_notification_targets_are_rejected(target: str) -> None:
    with pytest.raises(ValueError):
        validate_notification_target_url(target)
