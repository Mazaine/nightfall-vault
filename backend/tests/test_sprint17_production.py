from types import SimpleNamespace

import pytest
from starlette.requests import Request

from app.core.config import Settings
from app.core.production import validate_production_settings
from app.core.rate_limit import get_client_ip
from app.main import developer_surface_enabled


def production_settings(**overrides) -> Settings:
    values = dict(
        environment="production", secret_key="x" * 48,
        database_url="postgresql+psycopg://app:secret@postgres:5432/nightfall",
        redis_url="redis://redis:6379/0", backend_cors_origins=["https://example.invalid"],
        app_frontend_url="https://example.invalid", app_backend_url="https://example.invalid",
        frontend_base_url="https://example.invalid", auction_scheduler_mode="external",
        trusted_proxy_cidrs=["172.16.0.0/12"], media_root="/data/media",
    )
    values.update(overrides)
    return Settings(**values)


def request(remote_ip: str, forwarded_for: str | None = None) -> Request:
    headers = [] if forwarded_for is None else [(b"x-forwarded-for", forwarded_for.encode())]
    return Request({"type": "http", "method": "GET", "path": "/", "headers": headers, "client": (remote_ip, 1234), "server": ("test", 80), "scheme": "http", "query_string": b""})


def test_valid_production_configuration() -> None:
    validate_production_settings(production_settings())


def test_developer_surface_is_disabled_in_production() -> None:
    assert developer_surface_enabled("production") is False
    assert developer_surface_enabled("development") is True


@pytest.mark.parametrize("override", [
    {"secret_key": "change-me"}, {"backend_cors_origins": ["*"]},
    {"app_frontend_url": "http://localhost:5173"}, {"development_admin_seed_enabled": True},
])
def test_unsafe_production_configuration_is_rejected(override) -> None:
    with pytest.raises(RuntimeError, match="Invalid production configuration"):
        validate_production_settings(production_settings(**override))


def test_forwarded_ip_is_ignored_from_untrusted_peer(monkeypatch) -> None:
    monkeypatch.setattr("app.core.rate_limit.settings", SimpleNamespace(trusted_proxy_cidrs=["172.16.0.0/12"]))
    assert get_client_ip(request("203.0.113.10", "198.51.100.20")) == "203.0.113.10"


def test_rightmost_untrusted_ip_is_used_from_trusted_proxy(monkeypatch) -> None:
    monkeypatch.setattr("app.core.rate_limit.settings", SimpleNamespace(trusted_proxy_cidrs=["172.16.0.0/12"]))
    assert get_client_ip(request("172.20.0.5", "192.0.2.99, 198.51.100.20")) == "198.51.100.20"
