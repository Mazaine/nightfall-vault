"""Disposable non-production DBs: data-preserving 0053->0055 and restore proof.

Invoked by scripts/test_release_restore.ps1; never accepts a database URL argument.
"""
import argparse
import os
import re
import subprocess
from sqlalchemy import create_engine, select, text, func
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
import app.models  # noqa: F401
from app.db.base import Base
from app.models.user import User
from app.models.dicemagic import DiceMagicOrder


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["setup", "verify", "cleanup"])
    parser.add_argument("prefix")
    args = parser.parse_args()
    if not re.fullmatch(r"nightfall_release_[a-f0-9]{12}", args.prefix):
        raise SystemExit("Unsafe disposable database name")
    base = make_url(os.environ["TEST_DATABASE_URL"])
    if not base.database.endswith("_test") or base.host != "postgres-test":
        raise SystemExit("Only the dedicated postgres-test service is permitted")
    names = [args.prefix+"_source_test", args.prefix+"_restore_test"]
    admin = create_engine(base.set(database="postgres"), isolation_level="AUTOCOMMIT", hide_parameters=True)
    if args.phase == "cleanup":
        with admin.connect() as connection:
            for name in names:
                connection.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        print("Disposable restore-proof databases removed")
        return
    if args.phase == "setup":
        with admin.connect() as connection:
            for name in names:
                connection.execute(text(f'CREATE DATABASE "{name}"'))
        url = base.set(database=names[0])
        engine = create_engine(url, hide_parameters=True)
        Base.metadata.create_all(engine)
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY)"))
            connection.execute(text("INSERT INTO alembic_version VALUES ('0055_dicemagic_checkout')"))
        with Session(engine) as db:
            db.add(User(email="restore-proof@example.invalid", username="restore-proof", full_name="Restore Proof", password_hash="!", role="admin", is_active=True, is_email_verified=True))
            db.commit()
        environment = {**os.environ, "DATABASE_URL": url.render_as_string(hide_password=False), "DICEMAGIC_ENABLED": "false", "DICEMAGIC_REAL_ORDER_ENABLED": "false"}
        for command in (["alembic", "downgrade", "0053_partner_conversations"], ["alembic", "upgrade", "head"]):
            result = subprocess.run(command, env=environment, capture_output=True, text=True)
            if result.returncode:
                raise SystemExit("Isolated migration proof failed; no production database was used")
        with Session(engine) as db:
            user = db.scalar(select(User).where(User.username == "restore-proof"))
            assert user is not None and user.full_name == "Restore Proof"
            db.add(DiceMagicOrder(buyer_id=user.id, idempotency_key="restore-proof-key", external_order_id="NV-restore-proof", status="queued", payload={"items": [{"outer_id": "fixture", "name": "Restore fixture", "quantity": 9, "unit_price_huf": 690, "line_total_huf": 6210}], "items_total_huf": 6210, "buyer": {"email": "fixture@example.invalid"}}, cart_item_ids=[], attempts=0))
            db.commit()
        engine.dispose()
        print("0053 -> 0055 upgrade preserved the existing user; synthetic order added for restore proof")
    else:
        snapshots = []
        for name in names:
            engine = create_engine(base.set(database=name), hide_parameters=True)
            with Session(engine) as db:
                order = db.scalar(select(DiceMagicOrder))
                assert order is not None and order.attempts == 0 and order.status == "queued"
                assert order.payload["items"][0]["quantity"] == 9 and order.payload["items_total_huf"] == 6210
                assert db.scalar(select(func.count(User.id))) == 1
                assert db.scalar(text("SELECT version_num FROM alembic_version")) == "0055_dicemagic_checkout"
                snapshots.append((order.external_order_id, order.payload, order.idempotency_key))
            engine.dispose()
        assert snapshots[0] == snapshots[1]
        print("Restore proof passed: schema head, user, order identity, payload, quantity and total preserved")
    admin.dispose()


if __name__ == "__main__":
    main()
