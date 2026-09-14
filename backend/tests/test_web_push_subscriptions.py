from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.core.config import settings
from app.core.rate_limit import reset_rate_limiter_for_tests
from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models.notification import WebPushSubscription
from app.models.user import User
from app.services.web_push_delivery import WebPushDeliveryError


client = TestClient(app)


def create_user() -> User:
    suffix = uuid4().hex
    with SessionLocal() as db:
        user = User(
            email=f"push-{suffix}@test.invalid",
            username=f"push-{suffix}",
            full_name="Push Test User",
            password_hash=hash_password("PushTest123!"),
            is_active=True,
            is_email_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        db.expunge(user)
        return user


def headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(subject=user.id)}", "User-Agent": "Push test agent"}


def payload(endpoint: str | None = None, p256dh: str = "A" * 44, auth: str = "B" * 22) -> dict:
    return {
        "endpoint": endpoint or f"https://updates.push.services.mozilla.com/wpush/v2/{uuid4().hex}",
        "keys": {"p256dh": p256dh, "auth": auth},
    }


@pytest.fixture(autouse=True)
def configured_web_push(monkeypatch):
    monkeypatch.setattr(settings, "web_push_enabled", True)
    monkeypatch.setattr(settings, "vapid_public_key", "public-test-key")
    monkeypatch.setattr(settings, "vapid_private_key", "private-test-key")
    monkeypatch.setattr(settings, "vapid_subject", "mailto:push@test.invalid")
    monkeypatch.setattr(settings, "web_push_subscription_rate_limit_per_minute", 100)
    reset_rate_limiter_for_tests()
    yield
    with SessionLocal() as db:
        db.execute(delete(WebPushSubscription))
        db.execute(delete(User).where(User.email.like("push-%@test.invalid")))
        db.commit()
    reset_rate_limiter_for_tests()


@pytest.mark.parametrize("method,path,json", [
    ("get", "/api/notifications/push/public-key", None),
    ("post", "/api/notifications/push/subscriptions", payload()),
    ("post", "/api/notifications/push/subscriptions/status", {"endpoint": payload()["endpoint"]}),
    ("post", "/api/notifications/push/subscriptions/test", {"endpoint": payload()["endpoint"]}),
    ("delete", "/api/notifications/push/subscriptions", {"endpoint": payload()["endpoint"]}),
])
def test_push_endpoints_require_authentication(method: str, path: str, json: dict | None) -> None:
    response = client.request(method.upper(), path, json=json)
    assert response.status_code == 401


def test_public_key_response_never_exposes_private_key() -> None:
    user = create_user()
    response = client.get("/api/notifications/push/public-key", headers=headers(user))
    assert response.status_code == 200
    assert response.json() == {"enabled": True, "public_key": "public-test-key"}
    assert "private" not in response.text


def test_create_update_and_transfer_subscription() -> None:
    first, second = create_user(), create_user()
    data = payload()
    response = client.post("/api/notifications/push/subscriptions", headers=headers(first), json=data)
    assert response.status_code == 200
    assert response.json() == {"active": True, "state": "active", "last_success_at": None}

    changed = payload(data["endpoint"], p256dh="C" * 44, auth="D" * 22)
    assert client.post("/api/notifications/push/subscriptions", headers=headers(first), json=changed).status_code == 200
    assert client.post("/api/notifications/push/subscriptions", headers=headers(second), json=changed).status_code == 200

    with SessionLocal() as db:
        subscriptions = list(db.scalars(select(WebPushSubscription).where(WebPushSubscription.endpoint == data["endpoint"])))
        assert len(subscriptions) == 1
        assert subscriptions[0].user_id == second.id
        assert subscriptions[0].p256dh == "C" * 44
        assert subscriptions[0].auth == "D" * 22
        assert subscriptions[0].user_agent == "Push test agent"
        assert subscriptions[0].revoked_at is None


def test_only_owner_can_revoke_and_revoke_is_idempotent() -> None:
    owner, other = create_user(), create_user()
    data = payload()
    assert client.post("/api/notifications/push/subscriptions", headers=headers(owner), json=data).status_code == 200
    endpoint_body = {"endpoint": data["endpoint"]}

    assert client.post("/api/notifications/push/subscriptions/status", headers=headers(owner), json=endpoint_body).json() == {"active": True, "state": "active", "last_success_at": None}
    assert client.post("/api/notifications/push/subscriptions/status", headers=headers(other), json=endpoint_body).json() == {"active": False, "state": "unsubscribed", "last_success_at": None}

    denied = client.request("DELETE", "/api/notifications/push/subscriptions", headers=headers(other), json=endpoint_body)
    assert denied.status_code == 404
    assert data["endpoint"] not in denied.text

    removed = client.request("DELETE", "/api/notifications/push/subscriptions", headers=headers(owner), json=endpoint_body)
    repeated = client.request("DELETE", "/api/notifications/push/subscriptions", headers=headers(owner), json=endpoint_body)
    assert removed.status_code == repeated.status_code == 200
    assert removed.json() == {"active": False, "state": "unsubscribed", "last_success_at": None}
    status = client.post("/api/notifications/push/subscriptions/status", headers=headers(owner), json=endpoint_body).json()
    assert status["active"] is False and status["state"] == "needs_resubscribe"
    with SessionLocal() as db:
        assert db.scalar(select(WebPushSubscription.revoked_at).where(WebPushSubscription.endpoint == data["endpoint"])) is not None


@pytest.mark.parametrize("data", [
    payload(endpoint="http://push.example.invalid/subscription"),
    payload(endpoint="https://localhost/subscription"),
    payload(endpoint="https://127.0.0.1/subscription"),
    payload(endpoint="https://push.example.invalid/" + "x" * 2050),
    payload(p256dh="short"),
    {"endpoint": "https://push.example.invalid/subscription", "keys": {"p256dh": "A" * 44}},
])
def test_invalid_subscription_is_rejected(data: dict) -> None:
    user = create_user()
    assert client.post("/api/notifications/push/subscriptions", headers=headers(user), json=data).status_code == 422


def test_disabled_web_push_rejects_registration(monkeypatch) -> None:
    user = create_user()
    monkeypatch.setattr(settings, "web_push_enabled", False)
    key_response = client.get("/api/notifications/push/public-key", headers=headers(user))
    create_response = client.post("/api/notifications/push/subscriptions", headers=headers(user), json=payload())
    assert key_response.json() == {"enabled": False, "public_key": None}
    assert create_response.status_code == 503


def test_model_has_endpoint_uniqueness_and_active_user_index() -> None:
    constraint_names = {constraint.name for constraint in WebPushSubscription.__table__.constraints}
    index_names = {index.name for index in WebPushSubscription.__table__.indexes}
    assert "uq_web_push_subscriptions_endpoint" in constraint_names
    assert "ck_web_push_subscriptions_https_endpoint" in constraint_names
    assert "ix_web_push_subscriptions_user_active" in index_names


def test_push_test_is_owner_scoped_and_updates_success(monkeypatch) -> None:
    owner, other = create_user(), create_user()
    data = payload()
    assert client.post("/api/notifications/push/subscriptions", headers=headers(owner), json=data).status_code == 200
    sent: list[int] = []
    monkeypatch.setattr("app.api.notifications.send_web_push", lambda subscription, _payload: sent.append(subscription.id))

    denied = client.post("/api/notifications/push/subscriptions/test", headers=headers(other), json={"endpoint": data["endpoint"]})
    delivered = client.post("/api/notifications/push/subscriptions/test", headers=headers(owner), json={"endpoint": data["endpoint"]})

    assert denied.status_code == 404 and data["endpoint"] not in denied.text
    assert delivered.status_code == 200 and delivered.json()["success"] is True
    assert delivered.json()["last_success_at"] is not None and len(sent) == 1


@pytest.mark.parametrize("expired", [False, True])
def test_push_test_reports_failure_and_cleans_up_expired_subscription(monkeypatch, expired: bool) -> None:
    owner = create_user()
    data = payload()
    assert client.post("/api/notifications/push/subscriptions", headers=headers(owner), json=data).status_code == 200
    error = WebPushDeliveryError("push_subscription_expired" if expired else "push_service_unavailable", transient=not expired, expired=expired)
    monkeypatch.setattr("app.api.notifications.send_web_push", lambda *_args: (_ for _ in ()).throw(error))

    response = client.post("/api/notifications/push/subscriptions/test", headers=headers(owner), json={"endpoint": data["endpoint"]})

    assert response.status_code == (410 if expired else 503)
    with SessionLocal() as db:
        subscription = db.scalar(select(WebPushSubscription).where(WebPushSubscription.endpoint == data["endpoint"]))
        assert (subscription.revoked_at is not None) is expired
