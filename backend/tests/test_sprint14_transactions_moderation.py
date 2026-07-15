from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select

from app.db.session import SessionLocal
from app.models.moderation import ModerationAction, UserStrike
from app.models.security_log import AuditLog
from app.models.transaction import AuctionTransaction
from test_auction_domain import auth_headers, auction_payload, cleanup_test_data, client, create_sold_auction, create_test_user
from test_bid_domain import create_active_auction, place_bid


def cleanup_sprint14() -> None:
    db = SessionLocal()
    try:
        db.execute(delete(UserStrike))
        db.execute(delete(ModerationAction))
        db.execute(delete(AuctionTransaction))
        db.commit()
    finally:
        db.close()
    cleanup_test_data()


def test_sold_auction_creates_one_private_transaction_and_mutual_completion() -> None:
    cleanup_sprint14()
    seller = create_test_user("seller-s14@auction-test.local")
    buyer = create_test_user("buyer-s14@auction-test.local")
    outsider = create_test_user("outsider-s14@auction-test.local")
    admin = create_test_user("admin-s14@auction-test.local", role="admin")
    sold = create_sold_auction(seller, buyer, admin)

    seller_page = client.get("/api/transactions", headers=auth_headers(seller))
    buyer_page = client.get("/api/transactions", headers=auth_headers(buyer))
    transaction = seller_page.json()["items"][0]
    assert seller_page.status_code == buyer_page.status_code == 200
    assert transaction["auction_id"] == sold["id"]
    assert transaction["status"] == "transaction_open"
    assert client.get(f"/api/transactions/{transaction['id']}", headers=auth_headers(outsider)).status_code == 404

    first = client.post(f"/api/transactions/{transaction['id']}/confirm-completion", headers=auth_headers(seller))
    assert first.status_code == 200
    assert first.json()["status"] == "transaction_open"
    assert client.post(f"/api/auctions/{sold['id']}/reviews", json={"rating": 5}, headers=auth_headers(seller)).status_code == 409
    second = client.post(f"/api/transactions/{transaction['id']}/confirm-completion", headers=auth_headers(buyer))
    repeated = client.post(f"/api/transactions/{transaction['id']}/confirm-completion", headers=auth_headers(buyer))
    assert second.status_code == repeated.status_code == 200
    assert second.json()["status"] == "completed"

    assert client.post(f"/api/auctions/{sold['id']}/reviews", json={"rating": 5}, headers=auth_headers(seller)).status_code == 201
    final_review = client.post(f"/api/auctions/{sold['id']}/reviews", json={"rating": 5}, headers=auth_headers(buyer))
    assert final_review.status_code == 201
    refreshed = client.get(f"/api/transactions/{transaction['id']}", headers=auth_headers(seller))
    assert refreshed.json()["status"] == "reviewed"

    db = SessionLocal()
    try:
        assert db.scalar(select(func.count()).select_from(AuctionTransaction).where(AuctionTransaction.auction_id == sold["id"])) == 1
    finally:
        db.close()
    cleanup_sprint14()


def test_moderation_actions_are_admin_only_enforced_and_revocable() -> None:
    cleanup_sprint14()


def test_partial_bans_block_only_the_protected_backend_operation() -> None:
    cleanup_sprint14()
    seller = create_test_user("seller-partial-s14@auction-test.local")
    bidder = create_test_user("bidder-partial-s14@auction-test.local")
    admin = create_test_user("admin-partial-s14@auction-test.local", role="admin")
    auction = create_active_auction(seller)
    expiry = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    created = client.post("/api/admin/moderation/actions", json={"target_user_id": bidder.id, "action_type": "bidding_ban", "reason": "Licitkorlátozás", "expires_at": expiry}, headers=auth_headers(admin))
    assert created.status_code == 201
    assert place_bid(auction["id"], bidder, "1200.00").status_code == 403
    assert client.post(f"/api/admin/moderation/actions/{created.json()['id']}/revoke", headers=auth_headers(admin)).status_code == 200
    assert place_bid(auction["id"], bidder, "1200.00").status_code == 201
    cleanup_sprint14()


def test_permanent_ban_blocks_login_and_existing_session_but_not_admin_targets() -> None:
    cleanup_sprint14()
    user = create_test_user("permanent-s14@auction-test.example.com")
    admin = create_test_user("admin-permanent-s14@auction-test.local", role="admin")
    other_admin = create_test_user("admin-target-s14@auction-test.local", role="admin")
    payload = {"target_user_id": user.id, "action_type": "permanent_ban", "reason": "Súlyos, kivizsgált szabálysértés"}
    applied = client.post("/api/admin/moderation/actions", json=payload, headers=auth_headers(admin))
    assert applied.status_code == 201
    assert client.get("/api/auth/me", headers=auth_headers(user)).status_code == 403
    assert client.post("/api/auth/login", json={"email": user.email, "password": "AuctionTest123!"}).status_code == 403
    protected_admin = client.post("/api/admin/moderation/actions", json={**payload, "target_user_id": other_admin.id}, headers=auth_headers(admin))
    assert protected_admin.status_code == 403
    cleanup_sprint14()
    user = create_test_user("moderated-s14@auction-test.local")
    admin = create_test_user("admin-moderation-s14@auction-test.local", role="admin")
    expiry = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    payload = {"target_user_id": user.id, "action_type": "auction_creation_ban", "reason": "Tesztelt korlátozás", "expires_at": expiry, "internal_note": "Nem publikus."}

    assert client.post("/api/admin/moderation/actions", json=payload, headers=auth_headers(user)).status_code == 403
    created = client.post("/api/admin/moderation/actions", json=payload, headers=auth_headers(admin))
    assert created.status_code == 201
    action = created.json()
    assert action["internal_note"] == "Nem publikus."
    assert client.post("/api/auctions", json=auction_payload(), headers=auth_headers(user)).status_code == 403

    strike = client.post("/api/admin/moderation/strikes", json={"target_user_id": user.id, "reason": "Teszt strike", "severity": "medium"}, headers=auth_headers(admin))
    assert strike.status_code == 201
    revoked_strike = client.post(f"/api/admin/moderation/strikes/{strike.json()['id']}/revoke", headers=auth_headers(admin))
    revoked_action = client.post(f"/api/admin/moderation/actions/{action['id']}/revoke", headers=auth_headers(admin))
    assert revoked_strike.status_code == revoked_action.status_code == 200
    assert revoked_strike.json()["revoked_at"] is not None
    assert revoked_action.json()["revoked_at"] is not None

    db = SessionLocal()
    try:
        actions = set(db.scalars(select(AuditLog.action).where(AuditLog.user_id == admin.id)).all())
        assert {"moderation_restriction_applied", "moderation_restriction_revoked", "moderation_strike_issued", "moderation_strike_revoked"}.issubset(actions)
    finally:
        db.close()
    cleanup_sprint14()
