from types import SimpleNamespace

import pytest

from app.scripts.create_production_admin import validate_admin_password
from app.scripts import send_production_email_smoke as email_smoke


def test_admin_password_policy() -> None:
    validate_admin_password("Erős-Admin-Jelszó-2026!")
    with pytest.raises(ValueError):
        validate_admin_password("gyengejelszo")


def test_email_smoke_requires_confirmation(monkeypatch) -> None:
    monkeypatch.setattr(email_smoke, "settings", SimpleNamespace(environment="production", email_delivery_enabled=True))
    with pytest.raises(RuntimeError, match="confirm-send"):
        email_smoke.send_smoke("operator@nightfall-vault.hu", confirmed=False)


def test_email_smoke_uses_only_explicit_recipient(monkeypatch) -> None:
    monkeypatch.setattr(email_smoke, "settings", SimpleNamespace(environment="production", email_delivery_enabled=True))
    sent = []
    monkeypatch.setattr(email_smoke, "send_test_email", lambda recipient, subject, html: sent.append((recipient, subject, html)) or True)
    assert email_smoke.send_smoke("operator@nightfall-vault.hu", confirmed=True) is True
    assert sent[0][0] == "operator@nightfall-vault.hu"
    assert "Production e-mail smoke" in sent[0][1]
