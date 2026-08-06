from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.auction import Auction, Bid
from app.models.notification import Notification
from app.models.security_log import AuditLog
from app.models.user import User
from app.services.auction_scheduler import close_expired_auctions
from tests.test_bid_domain import (
    auth_headers,
    cleanup_test_data,
    client,
    create_active_auction,
    create_test_user,
    place_bid,
)


def withdraw(bid_id: int, user: User, *, reason_code: str = "accidental", reason_text: str | None = None):
    return client.post(
        f"/api/bids/{bid_id}/withdraw",
        headers=auth_headers(user),
        json={"reason_code": reason_code, "reason_text": reason_text},
    )


def set_times(auction_id: int, bid_id: int, *, now: datetime, bid_age_seconds: int, remaining_seconds: int) -> None:
    db = SessionLocal()
    try:
        auction = db.get(Auction, auction_id)
        bid = db.get(Bid, bid_id)
        assert auction is not None and bid is not None
        auction.ends_at = now + timedelta(seconds=remaining_seconds)
        bid.created_at = now - timedelta(seconds=bid_age_seconds)
        db.commit()
    finally:
        db.close()


def test_top_bid_withdrawal_preserves_history_and_restores_price(monkeypatch) -> None:
    cleanup_test_data()
    seller = create_test_user("seller-withdraw-success@bid-test.local")
    first = create_test_user("first-withdraw-success@bid-test.local")
    second = create_test_user("second-withdraw-success@bid-test.local")
    auction = create_active_auction(seller)
    first_bid = place_bid(auction["id"], first, "1100.00").json()
    top_bid = place_bid(auction["id"], second, "1200.00").json()

    response = withdraw(top_bid["id"], second)
    history = client.get(f"/api/auctions/{auction['id']}/bids", headers=auth_headers(second)).json()

    assert response.status_code == 200
    assert response.json()["current_price"] == "1100.00"
    assert response.json()["highest_bid_id"] == first_bid["id"]
    assert [(item["amount"], item["status"]) for item in history] == [("1200.00", "withdrawn"), ("1100.00", "active")]
    db = SessionLocal()
    try:
        audit = db.scalar(select(AuditLog).where(AuditLog.action == "auction_bid_withdrawn").order_by(AuditLog.id.desc()))
        assert audit is not None
        assert audit.metadata_json["bid_id"] == top_bid["id"]
    finally:
        db.close()


def test_stack_only_allows_current_top_and_successive_owner_withdrawals() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-withdraw-stack@bid-test.local")
    bidder_a = create_test_user("a-withdraw-stack@bid-test.local")
    bidder_b = create_test_user("b-withdraw-stack@bid-test.local")
    auction = create_active_auction(seller)
    bids = [
        place_bid(auction["id"], bidder_a, "1100.00").json(),
        place_bid(auction["id"], bidder_b, "1200.00").json(),
        place_bid(auction["id"], bidder_a, "1300.00").json(),
        place_bid(auction["id"], bidder_a, "1400.00").json(),
    ]

    assert withdraw(bids[2]["id"], bidder_a).status_code == 409
    first = withdraw(bids[3]["id"], bidder_a)
    second = withdraw(bids[2]["id"], bidder_a)

    assert first.status_code == 200 and first.json()["current_price"] == "1300.00"
    assert second.status_code == 200 and second.json()["current_price"] == "1200.00"
    assert second.json()["highest_bid_id"] == bids[1]["id"]


def test_withdrawal_rejects_other_user_and_duplicate_request() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-withdraw-auth@bid-test.local")
    bidder = create_test_user("bidder-withdraw-auth@bid-test.local")
    outsider = create_test_user("outsider-withdraw-auth@bid-test.local")
    auction = create_active_auction(seller)
    bid = place_bid(auction["id"], bidder, "1100.00").json()

    assert withdraw(bid["id"], outsider).status_code == 403
    assert withdraw(bid["id"], bidder).status_code == 200
    duplicate = withdraw(bid["id"], bidder)
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "Ez a licit már visszavonásra került."


def test_withdrawal_time_boundaries_are_explicit(monkeypatch) -> None:
    cleanup_test_data()
    fixed_now = datetime(2026, 8, 6, 12, 0, tzinfo=timezone.utc)
    seller = create_test_user("seller-withdraw-boundary@bid-test.local")
    bidder = create_test_user("bidder-withdraw-boundary@bid-test.local")
    auction = create_active_auction(seller)
    exact_bid = place_bid(auction["id"], bidder, "1100.00").json()
    set_times(auction["id"], exact_bid["id"], now=fixed_now, bid_age_seconds=60, remaining_seconds=300)
    monkeypatch.setattr("app.services.bidding.now_utc", lambda: fixed_now)
    assert withdraw(exact_bid["id"], bidder).status_code == 200

    newer = place_bid(auction["id"], bidder, "1200.00").json()
    set_times(auction["id"], newer["id"], now=fixed_now, bid_age_seconds=61, remaining_seconds=600)
    assert withdraw(newer["id"], bidder).status_code == 422

    latest = place_bid(auction["id"], bidder, "1300.00").json()
    set_times(auction["id"], latest["id"], now=fixed_now, bid_age_seconds=10, remaining_seconds=299)
    assert withdraw(latest["id"], bidder).status_code == 422


def test_withdrawal_restrictions_and_other_reason_validation() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-withdraw-restrict@bid-test.local")
    bidder = create_test_user("bidder-withdraw-restrict@bid-test.local")
    auction = create_active_auction(seller)
    bid = place_bid(auction["id"], bidder, "1100.00").json()

    invalid = withdraw(bid["id"], bidder, reason_code="other", reason_text="rövid")
    assert invalid.status_code == 422
    db = SessionLocal()
    try:
        row = db.get(User, bidder.id)
        assert row is not None
        row.bid_withdrawal_permanently_disabled = True
        db.commit()
    finally:
        db.close()
    blocked = withdraw(bid["id"], bidder)
    assert blocked.status_code == 403
    assert "korlátozva" in blocked.json()["detail"]


def test_fifth_withdrawal_emits_warning_only_once() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-withdraw-warning@bid-test.local")
    bidder = create_test_user("bidder-withdraw-warning@bid-test.local")
    db = SessionLocal()
    try:
        row = db.get(User, bidder.id)
        assert row is not None
        row.bid_withdrawal_count = 4
        db.commit()
    finally:
        db.close()
    auction = create_active_auction(seller)
    bid = place_bid(auction["id"], bidder, "1100.00").json()
    assert withdraw(bid["id"], bidder).status_code == 200

    db = SessionLocal()
    try:
        warnings = list(db.scalars(select(Notification).where(Notification.user_id == bidder.id, Notification.type == "bid_withdrawal_warning")).all())
        assert len(warnings) == 1
    finally:
        db.close()


def test_concurrent_duplicate_withdrawal_has_single_success() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-withdraw-concurrent@bid-test.local")
    bidder = create_test_user("bidder-withdraw-concurrent@bid-test.local")
    auction = create_active_auction(seller)
    bid = place_bid(auction["id"], bidder, "1100.00").json()

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda _: withdraw(bid["id"], bidder), range(2)))

    assert sorted(response.status_code for response in responses) == [200, 409]


def test_sold_auction_and_created_transaction_block_withdrawal() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-withdraw-sold@bid-test.local")
    bidder = create_test_user("bidder-withdraw-sold@bid-test.local")
    auction = create_active_auction(seller, buy_now_enabled=True, buy_now_price="1500.00")
    bid = place_bid(auction["id"], bidder, "1500.00").json()

    response = withdraw(bid["id"], bidder)
    assert response.status_code == 409
    assert "állapota" in response.json()["detail"]


def test_scheduler_ignores_withdrawn_bid_and_closes_without_winner() -> None:
    cleanup_test_data()
    seller = create_test_user("seller-withdraw-scheduler@bid-test.local")
    bidder = create_test_user("bidder-withdraw-scheduler@bid-test.local")
    auction = create_active_auction(seller)
    bid = place_bid(auction["id"], bidder, "1100.00").json()
    assert withdraw(bid["id"], bidder).status_code == 200

    db = SessionLocal()
    try:
        row = db.get(Auction, auction["id"])
        assert row is not None
        row.five_minute_rule_enabled = False
        row.ends_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
        assert close_expired_auctions(db) == 1
        db.refresh(row)
        assert row.status == "unsold"
        assert row.winner_id is None
    finally:
        db.close()
