import json
import logging
from types import SimpleNamespace
from uuid import uuid4

import pytest
import requests
from pywebpush import WebPushException
from sqlalchemy import delete, select

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.notification import Notification, NotificationOutbox, NotificationPreference, WebPushSubscription
from app.models.user import User
from app.services.notification_dispatcher import dispatch_notification
from app.services.notification_outbox import claim_next_outbox_item, process_outbox_item
from app.services.web_push_delivery import WebPushDeliveryError, build_web_push_payload, send_web_push
from app.services.web_push_security import PushEndpointValidationError, validate_push_service_endpoint


PUBLIC_DNS = lambda *_args, **_kwargs: [(2, 1, 6, "", ("142.250.74.78", 443))]


def create_user() -> User:
    with SessionLocal() as db:
        suffix = uuid4().hex
        user = User(
            email=f"push-delivery-{suffix}@test.invalid",
            username=f"push-delivery-{suffix}",
            full_name="Push Delivery Test",
            password_hash=hash_password("PushDelivery123!"),
            is_active=True,
            is_email_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        db.expunge(user)
        return user


def add_subscription(db, user: User, suffix: str = "1") -> WebPushSubscription:
    subscription = WebPushSubscription(
        user_id=user.id,
        endpoint=f"https://updates.push.services.mozilla.com/wpush/v2/{uuid4().hex}-{suffix}",
        p256dh="A" * 88,
        auth="B" * 24,
    )
    db.add(subscription)
    db.flush()
    return subscription


@pytest.fixture(autouse=True)
def isolate(monkeypatch):
    monkeypatch.setattr(settings, "web_push_enabled", True)
    monkeypatch.setattr(settings, "vapid_public_key", "public-test-key")
    monkeypatch.setattr(settings, "vapid_private_key", "private-test-key")
    monkeypatch.setattr(settings, "vapid_subject", "mailto:push@test.invalid")
    monkeypatch.setattr(settings, "web_push_allowed_host_suffixes", ["fcm.googleapis.com", "updates.push.services.mozilla.com", "notify.windows.com"])
    yield
    with SessionLocal() as db:
        user_ids = select(User.id).where(User.email.like("push-delivery-%@test.invalid"))
        db.execute(delete(NotificationOutbox))
        db.execute(delete(Notification).where(Notification.user_id.in_(user_ids)))
        db.execute(delete(NotificationPreference).where(NotificationPreference.user_id.in_(user_ids)))
        db.execute(delete(WebPushSubscription).where(WebPushSubscription.user_id.in_(user_ids)))
        db.execute(delete(User).where(User.id.in_(user_ids)))
        db.commit()


def dispatch_with_push(user: User, event_key: str, device_count: int = 1) -> tuple[int, list[int]]:
    with SessionLocal() as db:
        db.add(NotificationPreference(user_id=user.id, category="outbid", in_app=True, browser=True, email=False, push=True))
        for index in range(device_count):
            add_subscription(db, user, str(index))
        db.flush()
        notification = dispatch_notification(
            db,
            user_id=user.id,
            notification_type="outbid",
            title="Érzékeny aukciócím",
            message="Személyes részlet nem kerülhet a lezárt képernyőre.",
            target_url="/auctions/42",
            event_key=event_key,
        )
        db.commit()
        push_ids = list(db.scalars(select(NotificationOutbox.id).where(
            NotificationOutbox.notification_id == notification.id,
            NotificationOutbox.task_type == "push",
        ).order_by(NotificationOutbox.id)))
        return notification.id, push_ids


def test_push_tasks_require_enabled_preference_and_active_subscription(monkeypatch) -> None:
    user = create_user()
    with SessionLocal() as db:
        subscription = add_subscription(db, user)
        db.commit()
        first = dispatch_notification(db, user_id=user.id, notification_type="outbid", title="T", message="M", event_key="push:pref-off")
        db.commit()
        assert db.scalar(select(NotificationOutbox).where(NotificationOutbox.notification_id == first.id, NotificationOutbox.task_type == "push")) is None
        db.add(NotificationPreference(user_id=user.id, category="outbid", push=True))
        subscription.revoked_at = first.created_at
        db.add(subscription)
        db.commit()
        second = dispatch_notification(db, user_id=user.id, notification_type="outbid", title="T", message="M", event_key="push:no-active")
        db.commit()
        assert db.scalar(select(NotificationOutbox).where(NotificationOutbox.notification_id == second.id, NotificationOutbox.task_type == "push")) is None
        subscription.revoked_at = None
        db.add(subscription)
        db.commit()
        monkeypatch.setattr(settings, "web_push_enabled", False)
        third = dispatch_notification(db, user_id=user.id, notification_type="outbid", title="T", message="M", event_key="push:disabled")
        db.commit()
        assert db.scalar(select(NotificationOutbox).where(NotificationOutbox.notification_id == third.id, NotificationOutbox.task_type == "push")) is None


def test_email_and_push_event_preferences_are_independent() -> None:
    user = create_user()
    with SessionLocal() as db:
        add_subscription(db, user)
        preference = NotificationPreference(user_id=user.id, category="outbid", email=False, push=True)
        db.add(preference)
        db.commit()
        push_only = dispatch_notification(db, user_id=user.id, notification_type="outbid", title="T", message="M", event_key="channels:push-only")
        db.commit()
        push_only_tasks = {task.task_type for task in db.scalars(select(NotificationOutbox).where(NotificationOutbox.notification_id == push_only.id))}
        assert "push" in push_only_tasks and "email" not in push_only_tasks

        preference.email = True
        preference.push = False
        db.add(preference)
        db.commit()
        email_only = dispatch_notification(db, user_id=user.id, notification_type="outbid", title="T", message="M", event_key="channels:email-only")
        db.commit()
        email_only_tasks = {task.task_type for task in db.scalars(select(NotificationOutbox).where(NotificationOutbox.notification_id == email_only.id))}
        assert "email" in email_only_tasks and "push" not in email_only_tasks


def test_multiple_devices_get_idempotent_separate_push_tasks() -> None:
    user = create_user()
    notification_id, push_ids = dispatch_with_push(user, "push:multi", device_count=2)
    with SessionLocal() as db:
        duplicate = dispatch_notification(db, user_id=user.id, notification_type="outbid", title="Más", message="Más", event_key="push:multi")
        db.commit()
        assert duplicate.id == notification_id
        tasks = list(db.scalars(select(NotificationOutbox).where(NotificationOutbox.notification_id == notification_id)))
        assert len(push_ids) == 2
        assert len([task for task in tasks if task.task_type == "push"]) == 2
        assert len({task.event_key for task in tasks}) == len(tasks)


def _mark_processing(item_id: int) -> None:
    with SessionLocal() as db:
        item = db.get(NotificationOutbox, item_id)
        item.status = "processing"
        item.attempts += 1
        db.add(item)
        db.commit()


def test_success_updates_last_success(monkeypatch) -> None:
    user = create_user()
    _, [push_id] = dispatch_with_push(user, "push:success")
    monkeypatch.setattr("app.services.notification_outbox.send_web_push", lambda *_args: None)
    _mark_processing(push_id)
    assert process_outbox_item(push_id) is True
    with SessionLocal() as db:
        item = db.get(NotificationOutbox, push_id)
        subscription = db.get(WebPushSubscription, item.web_push_subscription_id)
        assert item.status == "delivered"
        assert subscription.last_success_at is not None


@pytest.mark.parametrize("status", [404, 410])
def test_expired_subscription_is_revoked_without_retry(monkeypatch, status: int) -> None:
    user = create_user()
    _, [push_id] = dispatch_with_push(user, f"push:expired:{status}")
    error = WebPushDeliveryError("push_subscription_expired", transient=False, expired=True)
    monkeypatch.setattr("app.services.notification_outbox.send_web_push", lambda *_args: (_ for _ in ()).throw(error))
    _mark_processing(push_id)
    assert process_outbox_item(push_id) is True
    with SessionLocal() as db:
        item = db.get(NotificationOutbox, push_id)
        assert item.status == "delivered"
        assert db.get(WebPushSubscription, item.web_push_subscription_id).revoked_at is not None


@pytest.mark.parametrize("code", ["push_rate_limited", "push_service_unavailable", "push_network_error"])
def test_transient_push_failures_retry(monkeypatch, code: str) -> None:
    user = create_user()
    _, [push_id] = dispatch_with_push(user, f"push:retry:{code}")
    monkeypatch.setattr("app.services.notification_outbox.send_web_push", lambda *_args: (_ for _ in ()).throw(WebPushDeliveryError(code, transient=True)))
    _mark_processing(push_id)
    assert process_outbox_item(push_id) is False
    with SessionLocal() as db:
        item = db.get(NotificationOutbox, push_id)
        assert item.status == "retry" and item.last_error == code


def test_bad_payload_is_permanent_and_sensitive_values_are_not_logged(monkeypatch, caplog) -> None:
    user = create_user()
    notification_id, [push_id] = dispatch_with_push(user, "push:bad-payload")
    with SessionLocal() as db:
        notification = db.get(Notification, notification_id)
        notification.target_url = "https://evil.invalid/private"
        subscription = db.get(WebPushSubscription, db.get(NotificationOutbox, push_id).web_push_subscription_id)
        endpoint, key = subscription.endpoint, subscription.p256dh
        db.add(notification)
        db.commit()
    _mark_processing(push_id)
    with caplog.at_level(logging.WARNING):
        assert process_outbox_item(push_id) is False
    assert endpoint not in caplog.text and key not in caplog.text
    with SessionLocal() as db:
        item = db.get(NotificationOutbox, push_id)
        assert item.status == "failed" and item.last_error == "push_payload_invalid"


def test_one_device_failure_does_not_block_another(monkeypatch) -> None:
    user = create_user()
    _, push_ids = dispatch_with_push(user, "push:isolated", device_count=2)
    calls = 0
    def fake_send(*_args):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise WebPushDeliveryError("push_service_unavailable", transient=True)
    monkeypatch.setattr("app.services.notification_outbox.send_web_push", fake_send)
    for item_id in push_ids:
        _mark_processing(item_id)
        process_outbox_item(item_id)
    with SessionLocal() as db:
        statuses = [db.get(NotificationOutbox, item_id).status for item_id in push_ids]
        assert statuses == ["retry", "delivered"]


def test_payload_is_small_versioned_and_privacy_preserving() -> None:
    user = create_user()
    notification_id, _ = dispatch_with_push(user, "push:payload")
    with SessionLocal() as db:
        notification = db.get(Notification, notification_id)
        serialized = build_web_push_payload(notification)
    payload = json.loads(serialized)
    assert payload["schema_version"] == 1
    assert payload["tag"] == f"nightfall-notification-{notification_id}"
    assert payload["body"] == "Változás történt az egyik licitednél."
    assert "Érzékeny" not in serialized and "Személyes" not in serialized
    assert len(serialized.encode()) <= 3072


@pytest.mark.parametrize("endpoint", [
    "http://fcm.googleapis.com/fcm/send/x",
    "https://user:pass@fcm.googleapis.com/fcm/send/x",
    "https://fcm.googleapis.com:444/fcm/send/x",
    "https://127.0.0.1/push",
    "https://169.254.169.254/latest/meta-data",
    "https://evil.invalid/push",
    "https://fcm.googleapis.com.evil.invalid/push",
    "https://updates.push.services.mozilla.com/push#fragment",
])
def test_unsafe_push_endpoints_are_rejected(endpoint: str) -> None:
    with pytest.raises(PushEndpointValidationError):
        validate_push_service_endpoint(endpoint, resolve_dns=False)


def test_private_dns_answer_and_dns_failure_are_rejected() -> None:
    private = lambda *_args, **_kwargs: [(2, 1, 6, "", ("10.0.0.5", 443))]
    failing = lambda *_args, **_kwargs: (_ for _ in ()).throw(OSError("dns unavailable"))
    endpoint = "https://fcm.googleapis.com/fcm/send/test"
    with pytest.raises(PushEndpointValidationError, match="push_endpoint_unsafe_dns"):
        validate_push_service_endpoint(endpoint, resolve_dns=True, resolver=private)
    with pytest.raises(PushEndpointValidationError) as error:
        validate_push_service_endpoint(endpoint, resolve_dns=True, resolver=failing)
    assert error.value.transient is True


def test_sender_disables_redirects_and_maps_http_errors(monkeypatch) -> None:
    subscription = SimpleNamespace(id=1, endpoint="https://fcm.googleapis.com/fcm/send/test", p256dh="A" * 88, auth="B" * 24)
    captured = {}
    def success(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(status_code=201)
    send_web_push(subscription, "{}", send=success, resolver=PUBLIC_DNS)
    assert captured["requests_session"].trust_env is False
    assert captured["timeout"] == settings.web_push_request_timeout_seconds

    for status, expected, transient, expired in [
        (404, "push_subscription_expired", False, True),
        (410, "push_subscription_expired", False, True),
        (429, "push_rate_limited", True, False),
        (503, "push_service_unavailable", True, False),
        (401, "push_request_rejected", False, False),
    ]:
        def fail(**_kwargs):
            raise WebPushException("rejected", response=SimpleNamespace(status_code=status))
        with pytest.raises(WebPushDeliveryError) as error:
            send_web_push(subscription, "{}", send=fail, resolver=PUBLIC_DNS)
        assert (error.value.code, error.value.transient, error.value.expired) == (expected, transient, expired)

    for status, expected, transient, expired in [
        (404, "push_subscription_expired", False, True),
        (410, "push_subscription_expired", False, True),
        (429, "push_rate_limited", True, False),
        (503, "push_service_unavailable", True, False),
        (400, "push_request_rejected", False, False),
    ]:
        with pytest.raises(WebPushDeliveryError) as error:
            send_web_push(subscription, "{}", send=lambda **_kwargs: SimpleNamespace(status_code=status), resolver=PUBLIC_DNS)
        assert (error.value.code, error.value.transient, error.value.expired) == (expected, transient, expired)


def test_missing_vapid_configuration_is_permanent(monkeypatch) -> None:
    monkeypatch.setattr(settings, "vapid_private_key", None)
    subscription = SimpleNamespace(id=1, endpoint="https://fcm.googleapis.com/fcm/send/test", p256dh="A" * 88, auth="B" * 24)
    with pytest.raises(WebPushDeliveryError) as error:
        send_web_push(subscription, "{}", send=lambda **_kwargs: None, resolver=PUBLIC_DNS)
    assert error.value.code == "web_push_configuration_invalid" and error.value.transient is False
