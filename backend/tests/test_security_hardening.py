from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.core.security import hash_password, verify_password
from app.main import app
from app.services import captcha_service

client = TestClient(app)


def build_request(remote_ip: str = "198.51.100.25") -> Request:
    return Request({
        "type": "http",
        "method": "POST",
        "path": "/api/auth/login",
        "headers": [],
        "client": (remote_ip, 1234),
        "server": ("vault.example", 443),
        "scheme": "https",
        "query_string": b"",
    })


def configure_turnstile(monkeypatch) -> None:
    monkeypatch.setattr(captcha_service.settings, "captcha_enabled", True)
    monkeypatch.setattr(captcha_service.settings, "captcha_provider", "turnstile")
    monkeypatch.setattr(captcha_service.settings, "turnstile_secret_key", "test-secret")
    monkeypatch.setattr(captcha_service.settings, "environment", "production")
    monkeypatch.setattr(captcha_service.settings, "app_frontend_url", "https://vault.example")


def test_turnstile_validates_action_hostname_and_remote_ip(monkeypatch) -> None:
    configure_turnstile(monkeypatch)
    captured: dict = {}

    def fake_post(url: str, *, data: dict, timeout: int):
        captured.update({"url": url, "data": data, "timeout": timeout})
        return SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {"success": True, "action": "login", "hostname": "vault.example"},
        )

    monkeypatch.setattr(captcha_service.httpx, "post", fake_post)
    captcha_service.verify_captcha("valid-token", action="login", request=build_request())

    assert captured["url"] == captcha_service.TURNSTILE_VERIFY_URL
    assert captured["data"]["remoteip"] == "198.51.100.25"
    assert captured["data"]["secret"] == "test-secret"
    assert captured["timeout"] == 8


@pytest.mark.parametrize(
    "result",
    [
        {"success": True, "action": "register", "hostname": "vault.example"},
        {"success": True, "action": "login", "hostname": "attacker.example"},
        {"success": False},
    ],
)
def test_turnstile_rejects_invalid_context(monkeypatch, result: dict) -> None:
    configure_turnstile(monkeypatch)
    monkeypatch.setattr(
        captcha_service.httpx,
        "post",
        lambda *_args, **_kwargs: SimpleNamespace(raise_for_status=lambda: None, json=lambda: result),
    )

    with pytest.raises(HTTPException) as exc_info:
        captcha_service.verify_captcha("invalid-token", action="login", request=build_request())
    assert exc_info.value.status_code == 400


def test_password_hashing_supports_long_passwords_without_bcrypt_truncation() -> None:
    password = "Árnyék-" + "x" * 100
    password_hash = hash_password(password)
    assert password_hash.startswith("$bcrypt-sha256$")
    assert verify_password(password, password_hash)
    assert not verify_password(password + "más", password_hash)


def test_turnstile_is_required_on_all_public_auth_entry_points(monkeypatch) -> None:
    monkeypatch.setattr(captcha_service.settings, "captcha_enabled", True)
    payloads = (
        ("/api/auth/register", {
            "email": "turnstile-register@test.example",
            "username": "turnstile-register",
            "full_name": "Turnstile Teszt",
            "password": "StrongPassword123!",
            "confirm_password": "StrongPassword123!",
            "accepted_terms": True,
            "accepted_privacy": True,
        }),
        ("/api/auth/login", {"email": "turnstile-login@test.example", "password": "StrongPassword123!"}),
        ("/api/auth/forgot-password", {"email": "turnstile-forgot@test.example"}),
        ("/api/auth/resend-verification", {"email": "turnstile-resend@test.example"}),
    )

    for path, payload in payloads:
        response = client.post(path, json=payload)
        assert response.status_code == 400
        assert "botvédelem" in response.json()["detail"].lower()
