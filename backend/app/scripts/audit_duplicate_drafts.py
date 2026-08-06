"""Read-only audit for legacy duplicate draft candidates.

The application now prevents retry duplicates with ``creation_key``. Historical
rows predate that key, so this command only reports exact domain-payload matches;
it never deletes or hides data automatically.
"""
from collections import defaultdict

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.auction import Auction


def signature(auction: Auction) -> tuple[object, ...]:
    return (
        auction.seller_id,
        " ".join(auction.title.casefold().split()),
        " ".join(auction.description.casefold().split()),
        auction.category,
        auction.condition,
        auction.starting_price,
        auction.bid_increment,
        auction.buy_now_enabled,
        auction.buy_now_price,
        auction.starts_at,
        auction.ends_at,
        auction.five_minute_rule_enabled,
    )


def main() -> int:
    db = SessionLocal()
    try:
        groups: dict[tuple[object, ...], list[Auction]] = defaultdict(list)
        drafts = db.scalars(select(Auction).where(Auction.status == "draft", Auction.deleted_at.is_(None)).order_by(Auction.id)).all()
        for draft in drafts:
            groups[signature(draft)].append(draft)
        candidates = [items for items in groups.values() if len(items) > 1]
        print(f"Piszkozatok: {len(drafts)}; pontos domain-egyezésű jelölt csoportok: {len(candidates)}")
        for items in candidates:
            print(f"seller_id={items[0].seller_id}; ids={','.join(str(item.id) for item in items)}; title={items[0].title!r}")
        print("DRY-RUN: adat nem módosult. A törlés minden esetben kézi felülvizsgálatot igényel.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
