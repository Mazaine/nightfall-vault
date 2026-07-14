from urllib.parse import parse_qs, urlparse
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models.user import User


client = TestClient(app)


def unique_identity(prefix: str) -> tuple[str, str]:
    suffix = uuid4().hex[:10]
    return f"{prefix}-{suffix}@auth-test.example", f"{prefix}-{suffix}"


def token_from_url(url: str) -> str:
    return parse_qs(urlparse(url).query)["token"][0]


def create_verified_user(prefix: str, role: str = "user") -> User:
    email, username = unique_identity(prefix)
    db = SessionLocal()
    try:
        user = User(
            email=email,
            username=username,
            full_name="Sprint 13 tesztfelhasználó",
            password_hash=hash_password("OldPassword123!"),
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


def test_registration_activation_login_and_me(monkeypatch) -> None:
    sent_urls: list[str] = []
    monkeypatch.setattr("app.api.auth.send_email_verification_email", lambda _email, url: sent_urls.append(url) or True)
    email, username = unique_identity("registration")

    registered = client.post("/api/auth/register", json={
        "email": email,
        "username": username,
        "full_name": "Nightfall Teszt Elek",
        "password": "StrongPassword123!",
        "confirm_password": "StrongPassword123!",
        "accepted_terms": True,
        "accepted_privacy": True,
        "subscribed_newsletter": False,
    })
    assert registered.status_code == 201
    assert len(sent_urls) == 1

    blocked_login = client.post("/api/auth/login", json={"email": email, "password": "StrongPassword123!"})
    assert blocked_login.status_code == 403

    activation_token = token_from_url(sent_urls[0])
    activated = client.get("/api/auth/verify-email", params={"token": activation_token})
    reused = client.get("/api/auth/verify-email", params={"token": activation_token})
    assert activated.status_code == 200
    assert reused.status_code == 400

    logged_in = client.post("/api/auth/login", json={"email": email, "password": "StrongPassword123!"})
    assert logged_in.status_code == 200
    assert logged_in.json()["user"]["role"] == "user"
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {logged_in.json()['access_token']}"})
    assert me.status_code == 200
    assert me.json()["username"] == username


def test_registration_rejects_invalid_confirmation_and_required_consents(monkeypatch) -> None:
    monkeypatch.setattr("app.api.auth.send_email_verification_email", lambda *_args: True)
    email, username = unique_identity("invalid-registration")
    response = client.post("/api/auth/register", json={
        "email": email,
        "username": username,
        "full_name": "Hibás Regisztráció",
        "password": "StrongPassword123!",
        "confirm_password": "DifferentPassword123!",
        "accepted_terms": False,
        "accepted_privacy": False,
    })
    assert response.status_code == 422
    assert set(response.json()["errors"]) == {"confirm_password", "accepted_terms", "accepted_privacy"}


def test_resend_verification_invalidates_the_previous_link(monkeypatch) -> None:
    sent_urls: list[str] = []
    monkeypatch.setattr("app.api.auth.send_email_verification_email", lambda _email, url: sent_urls.append(url) or True)
    email, username = unique_identity("resend")
    payload = {
        "email": email,
        "username": username,
        "full_name": "Újraküldési Teszt",
        "password": "StrongPassword123!",
        "confirm_password": "StrongPassword123!",
        "accepted_terms": True,
        "accepted_privacy": True,
    }
    assert client.post("/api/auth/register", json=payload).status_code == 201
    assert client.post("/api/auth/resend-verification", json={"email": email}).status_code == 200
    assert len(sent_urls) == 2
    assert client.get("/api/auth/verify-email", params={"token": token_from_url(sent_urls[0])}).status_code == 400
    assert client.get("/api/auth/verify-email", params={"token": token_from_url(sent_urls[1])}).status_code == 200


def test_forgot_password_is_non_enumerating_and_reset_is_single_use(monkeypatch) -> None:
    user = create_verified_user("password-reset")
    sent_urls: list[str] = []
    monkeypatch.setattr("app.api.auth.send_password_reset_email", lambda _email, url: sent_urls.append(url) or True)

    existing = client.post("/api/auth/forgot-password", json={"email": user.email})
    missing_email, _ = unique_identity("missing")
    missing = client.post("/api/auth/forgot-password", json={"email": missing_email})
    assert existing.status_code == missing.status_code == 200
    assert existing.json() == missing.json()
    assert len(sent_urls) == 1

    reset_token = token_from_url(sent_urls[0])
    mismatch = client.post("/api/auth/reset-password", json={
        "token": reset_token,
        "new_password": "NewPassword123!",
        "confirm_password": "DifferentPassword123!",
    })
    assert mismatch.status_code == 422
    changed = client.post("/api/auth/reset-password", json={
        "token": reset_token,
        "new_password": "NewPassword123!",
        "confirm_password": "NewPassword123!",
    })
    reused = client.post("/api/auth/reset-password", json={
        "token": reset_token,
        "new_password": "AnotherPassword123!",
        "confirm_password": "AnotherPassword123!",
    })
    assert changed.status_code == 200
    assert reused.status_code == 400
    assert client.post("/api/auth/login", json={"email": user.email, "password": "NewPassword123!"}).status_code == 200


def test_admin_and_normal_user_are_separated_by_backend_guard() -> None:
    normal_user = create_verified_user("normal-role")
    admin_user = create_verified_user("admin-role", role="admin")
    normal_headers = {"Authorization": f"Bearer {create_access_token(normal_user.id)}"}
    admin_headers = {"Authorization": f"Bearer {create_access_token(admin_user.id)}"}
    assert client.get("/api/admin/me", headers=normal_headers).status_code == 403
    admin_response = client.get("/api/admin/me", headers=admin_headers)
    assert admin_response.status_code == 200
    assert admin_response.json()["role"] == "admin"
