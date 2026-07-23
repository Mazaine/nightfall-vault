from sqlalchemy import delete

from app.db.session import SessionLocal
from app.models.auction import Auction
from app.models.user import User, VipActivationCode
from test_auction_domain import auction_payload, auth_headers, cleanup_test_data, client, create_test_user, upload_png


def _create_and_activate(seller: User, title: str):
    created = client.post("/api/auctions", json=auction_payload(title=title), headers=auth_headers(seller))
    assert created.status_code == 201
    auction_id = created.json()["id"]
    assert upload_png(auction_id, seller, name=f"{auction_id}.png").status_code == 201
    return client.post(f"/api/auctions/{auction_id}/activate", headers=auth_headers(seller))


def _cleanup() -> None:
    db = SessionLocal()
    try:
        db.execute(delete(VipActivationCode))
        db.commit()
    finally:
        db.close()
    cleanup_test_data()
    db = SessionLocal()
    try:
        db.execute(delete(User).where(User.email.like("%@vip-test.local")))
        db.commit()
    finally:
        db.close()


def test_normal_member_has_three_own_live_auction_limit_and_vip_removes_it() -> None:
    _cleanup()
    seller = create_test_user("seller@vip-test.local")
    admin = create_test_user("admin@vip-test.local", role="admin")
    try:
        for index in range(3):
            assert _create_and_activate(seller, f"Normál aukció {index + 1}").status_code == 200
        fourth = _create_and_activate(seller, "Negyedik aukció")
        assert fourth.status_code == 409
        assert "legfeljebb 3" in fourth.json()["detail"]

        generated = client.post("/api/admin/vip-codes/generate", json={"quantity": 10, "duration_months": 1}, headers=auth_headers(admin))
        assert generated.status_code == 200
        codes = generated.json()["codes"]
        assert len(codes) == 10
        assert len({item["code"] for item in codes}) == 10
        allowed = set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        assert all(len(item["code"]) == 12 and set(item["code"]) <= allowed for item in codes)
        assert any(any(character.isalpha() for character in item["code"]) for item in codes)

        activated = client.post("/api/membership/activate", json={"code": codes[0]["code"]}, headers=auth_headers(seller))
        assert activated.status_code == 200
        assert activated.json()["is_vip"] is True
        assert activated.json()["active_auction_limit"] is None

        repeated = client.post("/api/membership/activate", json={"code": codes[0]["code"]}, headers=auth_headers(seller))
        assert repeated.status_code == 409
        assert "már beváltották" in repeated.json()["detail"]

        drafts = client.get("/api/auctions/me", headers=auth_headers(seller)).json()
        fourth_id = next(item["id"] for item in drafts if item["title"] == "Negyedik aukció")
        assert client.post(f"/api/auctions/{fourth_id}/activate", headers=auth_headers(seller)).status_code == 200

        public_items = client.get("/api/auctions", params={"sort": "newest"}).json()["items"]
        assert public_items[0]["is_featured"] is True
    finally:
        _cleanup()


def test_normal_user_cannot_generate_vip_codes_and_plain_codes_are_not_stored() -> None:
    _cleanup()
    user = create_test_user("member@vip-test.local")
    admin = create_test_user("generator@vip-test.local", role="admin")
    try:
        denied = client.post("/api/admin/vip-codes/generate", json={"quantity": 10, "duration_months": 3}, headers=auth_headers(user))
        assert denied.status_code == 403
        generated = client.post("/api/admin/vip-codes/generate", json={"quantity": 10, "duration_months": 3}, headers=auth_headers(admin))
        assert generated.status_code == 200
        raw_codes = {item["code"] for item in generated.json()["codes"]}
        archive = client.get("/api/admin/vip-codes", headers=auth_headers(admin))
        assert archive.status_code == 200
        assert raw_codes == {item["code"] for item in archive.json()}
        assert all(item["redeemed_at"] is None for item in archive.json())
        db = SessionLocal()
        try:
            stored = db.query(VipActivationCode).all()
            assert len(stored) == 10
            assert raw_codes.isdisjoint({item.code_digest for item in stored})
            assert all(len(item.code_digest) == 64 for item in stored)
            assert all(item.code_ciphertext and item.code_ciphertext not in raw_codes for item in stored)
        finally:
            db.close()
    finally:
        _cleanup()
