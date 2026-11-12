from datetime import timedelta
import importlib.util
import logging
from pathlib import Path
from types import SimpleNamespace
import jwt
import pytest
from sqlalchemy import select
from app.core.config import settings
from app.core.logging_config import JsonFormatter, RedactingFormatter
from app.core.redaction import redact_metadata
from app.db.session import SessionLocal, engine
from app.models.dicemagic import DiceMagicOrder, DiceMagicOrderHold
from app.models.security_log import AuditLog
from app.services.dicemagic import utcnow, order_read
from test_dicemagic_checkout import env, prepare_mixed, send  # noqa: F401


@pytest.mark.parametrize("formatter", [JsonFormatter(), RedactingFormatter("%(message)s")])
def test_redacts_output_and_exception_without_altering_original_record(formatter):
    value = 'password="fixture-password" Authorization: Bearer fixture-bearer email=fixture@example.com /callback?code=fixture-code'
    try:
        raise ValueError(value)
    except ValueError:
        import sys
        record = logging.LogRecord("fixture", logging.ERROR, __file__, 1, "%s", (value,), sys.exc_info())
    output = formatter.format(record)
    assert all(secret not in output for secret in ("fixture-password", "fixture-bearer", "fixture@example.com", "fixture-code"))
    assert record.getMessage() == value
    assert engine.hide_parameters is True
    assert redact_metadata({"buyer": {"full_name": "Fixture"}, "order_id": 3}) == {"buyer": "[REDACTED]", "order_id": 3}


def test_jwt_options_reuse_cannot_disable_later_claim_validation():
    key = "fixture-key-with-at-least-thirty-two-bytes"
    expired = jwt.encode({"sub": "1", "exp": utcnow()-timedelta(hours=1)}, key, algorithm="HS256")
    options = {"verify_signature": False}
    jwt.decode(expired, options=options)
    assert options == {"verify_signature": False}
    options["verify_signature"] = True
    with pytest.raises(jwt.ExpiredSignatureError):
        jwt.decode(expired, key, algorithms=["HS256"], options=options)


def close_rejected(db, order_id):
    order = db.get(DiceMagicOrder, order_id)
    order.status = "rejected"
    order.updated_at = utcnow()-timedelta(days=40)
    for hold in db.scalars(select(DiceMagicOrderHold).where(DiceMagicOrderHold.order_id == order_id)):
        hold.resolved_at = utcnow()-timedelta(days=40)
    db.commit()


def test_privacy_preview_and_apply_are_policy_gated_scoped_and_preserve_order(env, monkeypatch):
    result, _ = prepare_mixed(env, "privacy-fixture", private=False)
    oid = result["external_orders"][0]["id"]
    monkeypatch.setattr(settings, "dicemagic_order_retention_days", 30)
    monkeypatch.setattr(settings, "dicemagic_retention_policy_approved", False)
    base = "/api/admin/integrations/dicemagic/privacy"
    assert env.api.get(base+"/preview", headers=env.normal).status_code == 403
    assert env.api.get(base+"/preview", headers=env.headers).json()["items"] == []
    with SessionLocal() as db:
        close_rejected(db, oid)
    preview = env.api.get(base+"/preview", headers=env.headers).json()
    assert preview["policy_approved"] is False and len(preview["items"]) == 1
    assert "buyer" not in str(preview) and "fixture@example.com" not in str(preview)
    assert env.api.get(base+"/preview", headers=env.other).json()["items"] == []
    body = {"expected": {str(oid): preview["items"][0]["token"]}, "confirmed": True}
    assert env.api.post(base+"/anonymize", headers=env.headers, json={"expected": {str(oid): "árvíz"}, "confirmed": True}).status_code == 422
    assert env.api.post(base+"/anonymize", headers=env.headers, json=body).status_code == 409
    monkeypatch.setattr(settings, "dicemagic_retention_policy_approved", True)
    assert env.api.post(base+"/anonymize", headers=env.headers, json={**body, "confirmed": False}).status_code == 409
    assert env.api.post(base+"/anonymize", headers=env.other, json=body).status_code == 409
    with SessionLocal() as db:
        before = order_read(db.get(DiceMagicOrder, oid))
    assert env.api.post(base+"/anonymize", headers=env.headers, json=body).json() == {"anonymized_count": 1}
    with SessionLocal() as db:
        order = db.get(DiceMagicOrder, oid)
        assert not any(key in order.payload for key in ("buyer", "billing", "delivery", "note"))
        after = order_read(order)
        assert all(before[key] == after[key] for key in ("id", "external_order_id", "status", "items", "total", "transaction_id"))
        audit = db.scalar(select(AuditLog).where(AuditLog.action == "dicemagic_order_personal_data_removed", AuditLog.user_id == env.buyer_id))
        assert audit.metadata_json["order_id"] == oid
    assert env.api.get(base+"/preview", headers=env.headers).json()["items"] == []
    assert env.api.post(base+"/anonymize", headers=env.headers, json=body).status_code == 409
    assert env.calls == []


def test_stale_privacy_preview_and_unresolved_stock_cannot_erase_data(env, monkeypatch):
    result, _ = prepare_mixed(env, "privacy-stale-fixture", private=False)
    oid = result["external_orders"][0]["id"]
    monkeypatch.setattr(settings, "dicemagic_order_retention_days", 30)
    monkeypatch.setattr(settings, "dicemagic_retention_policy_approved", True)
    base = "/api/admin/integrations/dicemagic/privacy"
    with SessionLocal() as db:
        close_rejected(db, oid)
    token = env.api.get(base+"/preview", headers=env.headers).json()["items"][0]["token"]
    with SessionLocal() as db:
        order = db.get(DiceMagicOrder, oid)
        order.payload = {**order.payload, "note": "Changed fixture"}
        order.updated_at = utcnow()-timedelta(days=39)
        db.commit()
    assert env.api.post(base+"/anonymize", headers=env.headers, json={"expected": {str(oid): token}, "confirmed": True}).status_code == 409
    with SessionLocal() as db:
        assert "buyer" in db.get(DiceMagicOrder, oid).payload
        hold = db.scalar(select(DiceMagicOrderHold).where(DiceMagicOrderHold.order_id == oid))
        hold.resolved_at = utcnow()
        db.commit()
    assert env.api.get(base+"/preview", headers=env.headers).json()["items"] == []
    with SessionLocal() as db:
        hold = db.scalar(select(DiceMagicOrderHold).where(DiceMagicOrderHold.order_id == oid))
        hold.resolved_at = None
        db.commit()
    assert env.api.get(base+"/preview", headers=env.headers).json()["items"] == []


@pytest.mark.parametrize("revision", ["0054_dicemagic", "0055_dicemagic_checkout"])
def test_nonempty_downgrade_refused_before_any_ddl(env, monkeypatch, revision):
    prepare_mixed(env, "downgrade-protection-fixture", private=False)
    path = Path(__file__).resolve().parents[1]/"alembic"/"versions"/(revision+".py")
    spec = importlib.util.spec_from_file_location("fixture_revision", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with SessionLocal() as db:
        monkeypatch.setattr(module, "op", SimpleNamespace(get_bind=lambda: db.connection()))
        with pytest.raises(RuntimeError, match="Cannot downgrade"):
            module.downgrade()
