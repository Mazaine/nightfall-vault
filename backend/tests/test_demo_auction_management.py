from uuid import uuid4

from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import func, select

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models.auction import Auction, AuctionImage, Bid
from app.models.demo_auction import DemoAuctionBatch
from app.models.security_log import AuditLog
from app.models.user import User
from app.services.demo_auctions import CLEANUP_CONFIRMATION, CREATE_CONFIRMATION, RESET_CONFIRMATION, DemoAuctionService
from app.storage import storage


client = TestClient(app)


def make_user(role: str) -> User:
    marker = uuid4().hex
    db = SessionLocal()
    try:
        user = User(email=f"{marker}@demo-management.test", username=f"u-{marker[:20]}", full_name=f"Teszt {role}", password_hash=hash_password(uuid4().hex), role=role, is_active=True, is_email_verified=True)
        db.add(user); db.commit(); db.refresh(user); db.expunge(user); return user
    finally: db.close()


def headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, session_version=user.auth_version)}"}


def test_admin_demo_batch_visibility_role_and_safe_cleanup():
    admin, normal, tester = make_user("admin"), make_user("user"), make_user("tester")
    db = SessionLocal()
    batch_key = None
    try:
        service = DemoAuctionService(db)
        before_users = int(db.scalar(select(func.count()).select_from(User).where(User.demo_batch_id.is_(None))) or 0)
        before_batches = int(db.scalar(select(func.count()).select_from(DemoAuctionBatch)) or 0)
        preview = service.preview(80, 20)
        assert preview["total_auctions"] == 100
        assert db.scalar(select(func.count()).select_from(DemoAuctionBatch)) == before_batches

        result = service.create(80, 20, admin, CREATE_CONFIRMATION)
        batch_key = result["batch_key"]
        batch = db.scalar(select(DemoAuctionBatch).where(DemoAuctionBatch.batch_key == batch_key))
        assert batch is not None and batch.status == "active"
        auctions = list(db.scalars(select(Auction).where(Auction.demo_batch_id == batch.id).order_by(Auction.id)).all())
        assert len(auctions) == 100
        assert [item.title for item in auctions[:80]] == [f"Teszt aukció {index:03d}" for index in range(1, 81)]
        assert [item.title for item in auctions[80:]] == [f"Kiemelt teszt {index:03d}" for index in range(1, 21)]
        auction_ids = [item.id for item in auctions]
        images = list(db.scalars(select(AuctionImage).where(AuctionImage.auction_id.in_(auction_ids))).all())
        assert len(images) == 100
        assert all(storage.exists(key) for image in images for key in (image.storage_key, image.thumbnail_storage_key, image.list_storage_key, image.detail_storage_key) if key)
        assert db.scalar(select(func.count()).select_from(Bid).where(Bid.auction_id.in_(auction_ids))) == 66
        assert sum(bool(item.seller and item.seller.vip_expires_at) for item in auctions) == 20
        assert db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.action == "demo_auction_batch_created", AuditLog.metadata_json["batch_key"].astext == batch_key)) == 1

        normal_list = client.get("/api/auctions?limit=100", headers=headers(normal)).json()
        tester_list = client.get("/api/auctions?limit=100", headers=headers(tester)).json()
        assert not any(item.get("is_demo") for item in normal_list["items"])
        assert sum(bool(item.get("is_demo")) for item in tester_list["items"]) == 100
        assert client.get(f"/api/auctions/{auctions[0].id}", headers=headers(normal)).status_code == 404
        assert client.get(f"/api/auctions/{auctions[0].id}", headers=headers(tester)).status_code == 200
        bid_amount = str(auctions[0].current_price + auctions[0].bid_increment)
        assert client.post(f"/api/auctions/{auctions[0].id}/bids", json={"amount": bid_amount}, headers=headers(tester)).status_code == 201
        assert client.get("/api/admin/demo-auctions/status", headers=headers(tester)).status_code == 403

        with pytest.raises(HTTPException) as duplicate:
            service.create(80, 20, admin, CREATE_CONFIRMATION)
        assert duplicate.value.status_code == 409

        old_batch_key = batch_key
        reset_result = service.reset(80, 20, admin, RESET_CONFIRMATION)
        batch_key = reset_result["batch_key"]
        assert batch_key != old_batch_key
        assert service.latest_batch(old_batch_key).status == "deleted"
        assert service.status(batch_key)["total_auctions"] == 100

        cleanup_preview = service.cleanup_preview(batch_key)
        assert cleanup_preview["auctions"] == 100 and cleanup_preview["media_files"] == 400
        service.cleanup(admin, CLEANUP_CONFIRMATION, batch_key)
        assert db.scalar(select(func.count()).select_from(Auction).where(Auction.demo_batch_id == batch.id)) == 0
        assert int(db.scalar(select(func.count()).select_from(User).where(User.demo_batch_id.is_(None))) or 0) == before_users
        batch_key = None
    finally:
        if batch_key:
            try: DemoAuctionService(db).cleanup(admin, CLEANUP_CONFIRMATION, batch_key)
            except Exception: db.rollback()
        db.close()


def test_tester_role_requires_admin_confirmation_and_invalidates_session():
    admin, target, outsider = make_user("admin"), make_user("user"), make_user("user")
    path = f"/api/admin/users/{target.id}/role"
    assert client.patch(path, json={"role": "tester", "confirmation": "hibás"}, headers=headers(admin)).status_code == 422
    assert client.patch(path, json={"role": "tester", "confirmation": "Biztosan tesztelői szerepkört adsz ennek a felhasználónak? A felhasználó látni és használni fogja a production rendszer demóaukcióit, de adminisztrátori jogosultságot nem kap."}, headers=headers(outsider)).status_code == 403
    response = client.patch(path, json={"role": "tester", "confirmation": "Biztosan tesztelői szerepkört adsz ennek a felhasználónak? A felhasználó látni és használni fogja a production rendszer demóaukcióit, de adminisztrátori jogosultságot nem kap."}, headers=headers(admin))
    assert response.status_code == 200 and response.json()["role"] == "tester"
    db = SessionLocal()
    try:
        changed = db.get(User, target.id)
        assert changed is not None and changed.auth_version == 1
        tester_session = headers(changed)
        assert db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.action == "tester_role_granted", AuditLog.metadata_json["target_user_id"].astext == str(target.id))) == 1
    finally: db.close()
    revoked = client.patch(path, json={"role": "user", "confirmation": "Biztosan visszavonod a tesztelői szerepkört? A felhasználó többé nem fogja látni a demóaukciókat."}, headers=headers(admin))
    assert revoked.status_code == 200 and revoked.json()["role"] == "user"
    assert client.get("/api/auth/me", headers=tester_session).status_code == 401
