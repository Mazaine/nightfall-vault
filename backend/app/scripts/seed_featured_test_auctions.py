from datetime import timedelta
from decimal import Decimal

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.auction import Auction
from app.models.user import User
from app.services.membership import utc_now


ADMIN_EMAIL = "mazaine89@gmail.com"
TITLE_PREFIX = "[KIEMELT TESZT]"


def main() -> None:
    db = SessionLocal()
    try:
        seller = db.scalar(select(User).where(User.email == ADMIN_EMAIL, User.role == "admin", User.deleted_at.is_(None)))
        if seller is None:
            raise RuntimeError(f"Nem található aktív adminfiók ezzel az e-mail-címmel: {ADMIN_EMAIL}")

        now = utc_now()
        categories = ("Pokemon", "Magic: The Gathering", "One Piece", "Yu-Gi-Oh!", "Disney Lorcana")
        created = 0
        for index in range(1, 11):
            title = f"{TITLE_PREFIX} Gyűjtői próbaaukció {index:02d}"
            auction = db.scalar(select(Auction).where(Auction.title == title, Auction.seller_id == seller.id))
            starting_price = Decimal(5000 + index * 1000)
            if auction is None:
                auction = Auction(
                    seller_id=seller.id,
                    title=title,
                    description="Kiemelt, villámáras fejlesztői tesztaukció a főoldali karusszel kézi ellenőrzéséhez.",
                    category=categories[(index - 1) % len(categories)],
                    condition="like_new",
                    status="active",
                    starting_price=starting_price,
                    bid_increment=Decimal("500"),
                    current_price=starting_price,
                    buy_now_enabled=True,
                    buy_now_price=starting_price + Decimal("10000"),
                    starts_at=now - timedelta(hours=1),
                    ends_at=now + timedelta(days=7, hours=index),
                    five_minute_rule_enabled=True,
                    seller_declaration_accepted_at=now,
                    seller_declaration_version="2026-07-11",
                )
                db.add(auction)
                created += 1
            else:
                auction.status = "active"
                auction.starts_at = now - timedelta(hours=1)
                auction.ends_at = now + timedelta(days=7, hours=index)
                auction.starting_price = starting_price
                auction.current_price = starting_price
                auction.bid_increment = Decimal("500")
                auction.buy_now_enabled = True
                auction.buy_now_price = starting_price + Decimal("10000")
                auction.deleted_at = None
                auction.winner_id = None
                auction.finalized_at = None
                db.add(auction)

        db.commit()
        print(f"Kiemelt tesztaukciók elkészítve: 10 (új: {created}, frissített: {10 - created}).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
