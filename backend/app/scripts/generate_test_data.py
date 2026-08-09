"""Deterministic, removable local load-data generator. Never available in production."""

import argparse
import os
import random
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.auction import Auction, AuctionBidExclusion, Bid, WatchlistItem
from app.models.notification import Notification
from app.models.transaction import AuctionTransaction
from app.models.user import User


def build_specs(seed: int, count: int) -> list[dict]:
    rng = random.Random(seed)
    categories = ["Pokemon", "One Piece", "Magic the Gathering", "Star Wars TCG", "Egyéb"]
    states = ["active", "active", "scheduled", "sold", "unsold"]
    return [{"number": index + 1, "category": rng.choice(categories), "status": states[index % len(states)], "price": rng.randrange(10, 500) * 100} for index in range(count)]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=200)
    parser.add_argument("--seed", type=int, default=20260806)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if settings.environment.strip().lower() == "production":
        raise SystemExit("A tesztadat-generátor production környezetben tiltott.")
    if not 1 <= args.count <= 2000:
        raise SystemExit("A darabszám 1 és 2000 között lehet.")
    specs = build_specs(args.seed, args.count)
    if args.dry_run:
        print({"seed": args.seed, "auctions": len(specs), "users": min(40, max(8, args.count // 5))})
        return
    password = os.getenv("DEV_SEED_PASSWORD")
    if not password:
        raise SystemExit("A DEV_SEED_PASSWORD megadása kötelező.")
    prefix = f"loadtest-{args.seed}"
    db = SessionLocal()
    try:
        if db.scalar(select(User.id).where(User.email == f"{prefix}-0@local.invalid")) is not None:
            print({"status": "unchanged", "reason": "A seed már létezik.", "seed": args.seed})
            return
        now = datetime.now(timezone.utc)
        user_count = min(40, max(8, args.count // 5))
        users = [User(email=f"{prefix}-{i}@local.invalid", username=f"{prefix}-{i}", full_name=f"Teszt Gyűjtő {i + 1}", password_hash=hash_password(password), is_active=True, is_email_verified=True) for i in range(user_count)]
        db.add_all(users)
        db.flush()
        created = {"users": len(users), "auctions": 0, "bids": 0, "watchlist": 0, "exclusions": 0, "transactions": 0, "notifications": 0}
        for index, spec in enumerate(specs):
            seller = users[index % user_count]
            bidder = users[(index + 1) % user_count]
            starts_at = now - timedelta(hours=2) if spec["status"] != "scheduled" else now + timedelta(hours=2)
            ends_at = now + timedelta(days=2 + index % 6)
            status = spec["status"]
            auction = Auction(
                seller_id=seller.id, creation_key=f"{prefix}-{index:04d}", title=f"[LOADTEST:{args.seed}] Gyűjtői tétel {index + 1}",
                description="Automatikusan generált, biztonságosan eltávolítható helyi tesztaukció.", category=spec["category"], condition="NM",
                status=status, starting_price=Decimal(spec["price"]), bid_increment=Decimal(500), current_price=Decimal(spec["price"]),
                buy_now_enabled=index % 3 == 0, buy_now_price=Decimal(spec["price"] + 10000) if index % 3 == 0 else None,
                starts_at=starts_at, ends_at=ends_at, five_minute_rule_enabled=True,
                seller_declaration_accepted_at=now, seller_declaration_version="2026-07-11",
            )
            db.add(auction); db.flush(); created["auctions"] += 1
            if status in {"active", "sold"}:
                bid = Bid(auction_id=auction.id, bidder_id=bidder.id, amount=Decimal(spec["price"] + 500))
                db.add(bid); db.flush(); created["bids"] += 1
                auction.highest_bid_id = bid.id; auction.current_price = bid.amount
                if status == "sold":
                    auction.winner_id = bidder.id; auction.finalized_at = now
                    db.add(AuctionTransaction(auction_id=auction.id, seller_id=seller.id, buyer_id=bidder.id, status="transaction_open", review_deadline=now + timedelta(days=30)))
                    created["transactions"] += 1
            watcher = users[(index + 2) % user_count]
            db.add(WatchlistItem(user_id=watcher.id, auction_id=auction.id)); created["watchlist"] += 1
            if status == "active" and index % 11 == 0 and auction.highest_bid_id:
                bid.status = "withdrawn"; bid.withdrawn_at = now; auction.highest_bid_id = None; auction.current_price = auction.starting_price
                db.add(AuctionBidExclusion(auction_id=auction.id, user_id=bidder.id, source_bid_id=bid.id)); created["exclusions"] += 1
            db.add(Notification(user_id=watcher.id, auction_id=auction.id, type="watchlist_reminder", category="system", title="Tesztértesítés", message=auction.title, event_key=f"{prefix}:notification:{index}")); created["notifications"] += 1
        db.commit()
        print({"status": "created", "seed": args.seed, **created, "removal_tag": f"[LOADTEST:{args.seed}]"})
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
