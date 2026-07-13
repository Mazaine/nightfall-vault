"""Create a rich, repeatable local auction dataset without touching real users."""

import os
import shutil
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

from PIL import Image, ImageDraw
from sqlalchemy import delete, or_, select

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.auction import Auction, AuctionImage, AuctionMessage, AuctionReview, Bid, WatchlistItem
from app.models.moderation import Report, UserBlock
from app.models.notification import Notification
from app.models.user import SavedSearch, SellerFollow, User
from app.scripts.seed_dev_admin import seed_dev_admin


DEMO_DOMAIN = "nightfall-demo.local"
DEMO_USERS = (
    ("seller-anna", "Anna Kártyabarlang", "seller.anna"),
    ("seller-balazs", "Balázs Retro Vault", "seller.balazs"),
    ("seller-csilla", "Csilla Collector", "seller.csilla"),
    ("collector-dani", "Dani Gyűjtő", "collector.dani"),
    ("collector-eszter", "Eszter Licitáló", "collector.eszter"),
    ("collector-feri", "Feri TCG", "collector.feri"),
    ("collector-greta", "Gréta Vault", "collector.greta"),
    ("collector-huba", "Huba Retro", "collector.huba"),
)


def _required_password() -> str:
    password = os.getenv("DEV_SEED_PASSWORD", "").strip()
    if len(password) < 12:
        raise RuntimeError("DEV_SEED_PASSWORD must be set and contain at least 12 characters.")
    return password


def _seed_admin_if_configured() -> None:
    if os.getenv("DEV_ADMIN_EMAIL", "").strip() and os.getenv("DEV_ADMIN_PASSWORD", "").strip():
        seed_dev_admin()


def _upsert_users(db, password: str) -> dict[str, User]:
    users: dict[str, User] = {}
    password_hash = hash_password(password)
    for username, full_name, email_prefix in DEMO_USERS:
        email = f"{email_prefix}@{DEMO_DOMAIN}"
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(email=email, username=username, full_name=full_name, password_hash=password_hash)
        user.username = username
        user.full_name = full_name
        user.password_hash = password_hash
        user.role = "user"
        user.is_active = True
        user.is_email_verified = True
        user.deleted_at = None
        db.add(user)
        users[username] = user
    db.flush()
    return users


def _clear_previous_demo_graph(db, users: dict[str, User]) -> None:
    user_ids = [user.id for user in users.values()]
    auction_ids = list(db.scalars(select(Auction.id).where(Auction.seller_id.in_(user_ids))))

    if auction_ids:
        storage_keys = list(db.scalars(select(AuctionImage.storage_key).where(AuctionImage.auction_id.in_(auction_ids))))
        db.execute(delete(Report).where(Report.auction_id.in_(auction_ids)))
        db.execute(delete(Notification).where(Notification.auction_id.in_(auction_ids)))
        db.query(Auction).filter(Auction.id.in_(auction_ids)).update({Auction.highest_bid_id: None}, synchronize_session=False)
        db.flush()
        db.execute(delete(Auction).where(Auction.id.in_(auction_ids)))
        upload_root = Path(settings.storage_upload_dir).resolve()
        for storage_key in storage_keys:
            candidate = (upload_root / storage_key).resolve()
            if upload_root in candidate.parents and candidate.parent.exists():
                shutil.rmtree(candidate.parent, ignore_errors=True)

    db.execute(delete(Report).where(or_(Report.reporter_id.in_(user_ids), Report.reported_user_id.in_(user_ids))))
    db.execute(delete(Notification).where(Notification.user_id.in_(user_ids)))
    db.execute(delete(SellerFollow).where(or_(SellerFollow.follower_id.in_(user_ids), SellerFollow.seller_id.in_(user_ids))))
    db.execute(delete(SavedSearch).where(SavedSearch.user_id.in_(user_ids)))
    db.execute(delete(UserBlock).where(or_(UserBlock.blocker_id.in_(user_ids), UserBlock.blocked_id.in_(user_ids))))
    db.flush()


def _auction_specs(now: datetime):
    return (
        ("Charizard Base Set holo", "Pokemon", "like_new", "active", 28000, 1000, -2, 2, True),
        ("Pikachu Illustrator reprint", "Pokemon", "fresh", "active", 12000, 500, -1, 4, False),
        ("Black Lotus art print", "Magic: The Gathering", "like_new", "active", 45000, 2500, -3, 1, True),
        ("One Piece Luffy alt art", "One Piece", "fresh", "active", 18000, 1000, -1, 3, True),
        ("Pokémon Neo Genesis csomag", "Pokemon", "fresh", "scheduled", 35000, 1000, 1, 5, False),
        ("MTG Commander gyűjtemény", "Magic: The Gathering", "played", "scheduled", 22000, 1000, 2, 7, True),
        ("Yu-Gi-Oh! Blue-Eyes White Dragon", "Yu-Gi-Oh!", "like_new", "draft", 15000, 500, 2, 8, True),
        ("Star Wars Unlimited starter", "Star Wars Unlimited", "fresh", "draft", 8000, 500, 3, 9, False),
        ("Umbreon VMAX prémium lap", "Pokemon", "like_new", "ended", 52000, 2000, -5, -1, False),
        ("Mox Sapphire proxy art", "Magic: The Gathering", "played", "ended", 16000, 1000, -4, -1, True),
        ("Gengar vintage holo", "Pokemon", "worn", "sold", 9000, 500, -8, -3, True),
        ("Digimon Omnimon alt art", "Digimon", "like_new", "sold", 14000, 1000, -7, -2, False),
        ("Flesh and Blood blitz deck", "Flesh and Blood", "played", "unsold", 6000, 500, -6, -2, True),
        ("Lorcana Elsa enchanted", "Disney Lorcana", "fresh", "unsold", 42000, 2000, -9, -4, False),
        ("Dragon Ball Goku SCR", "Dragon Ball", "damaged", "cancelled", 7000, 500, -5, 2, True),
        ("Naruto fan-made promo", "Naruto", "misprint", "suspended", 11000, 500, -2, 3, False),
    )


def _create_image_files(auction: Auction, index: int) -> dict[str, str | int]:
    palette = ((46, 20, 77), (13, 71, 89), (98, 44, 31), (28, 83, 58))
    color = palette[index % len(palette)]
    relative_dir = Path("auctions") / str(auction.id) / "development-seed"
    absolute_dir = Path(settings.storage_upload_dir) / relative_dir
    absolute_dir.mkdir(parents=True, exist_ok=True)
    variants = {"original": (960, 640), "detail": (960, 640), "list": (640, 426), "thumbnail": (320, 213)}
    paths: dict[str, str | int] = {}
    for name, size in variants.items():
        image = Image.new("RGB", size, color)
        draw = ImageDraw.Draw(image)
        draw.rectangle((20, 20, size[0] - 20, size[1] - 20), outline=(212, 175, 55), width=max(2, size[0] // 160))
        draw.text((size[0] // 14, size[1] // 2), auction.title, fill=(245, 238, 220))
        path = absolute_dir / f"{name}.png"
        image.save(path, format="PNG")
        paths[name] = str((relative_dir / path.name).as_posix())
        if name == "original":
            paths["file_size"] = path.stat().st_size
    return paths


def _create_auctions(db, users: dict[str, User], now: datetime) -> list[Auction]:
    sellers = [users["seller-anna"], users["seller-balazs"], users["seller-csilla"]]
    buyers = [users["collector-dani"], users["collector-eszter"], users["collector-feri"]]
    auctions: list[Auction] = []
    for index, spec in enumerate(_auction_specs(now)):
        title, category, condition, status, price, increment, start_delta, end_delta, buy_now = spec
        seller = sellers[index % len(sellers)]
        winner = buyers[index % len(buyers)] if status == "sold" else None
        auction = Auction(
            seller_id=seller.id,
            title=f"[DEMO] {title}",
            description=f"Fejlesztői mintaaukció: {title}. Részletes leírás, állapot és szállítási információk.",
            category=category,
            condition=condition,
            status=status,
            starting_price=Decimal(price),
            bid_increment=Decimal(increment),
            current_price=Decimal(price),
            buy_now_enabled=buy_now,
            buy_now_price=Decimal(price * 2) if buy_now else None,
            starts_at=now + timedelta(days=start_delta),
            ends_at=now + timedelta(days=end_delta),
            five_minute_rule_enabled=index % 2 == 0,
            winner_id=winner.id if winner else None,
            seller_declaration_accepted_at=now - timedelta(days=10),
            seller_declaration_version="2026-07-11",
            finalized_at=now + timedelta(days=end_delta) if status in {"sold", "unsold"} else None,
        )
        db.add(auction)
        db.flush()
        paths = _create_image_files(auction, index)
        db.add(AuctionImage(
            auction_id=auction.id,
            storage_key=paths["original"],
            original_filename="development-seed.png",
            content_type="image/png",
            file_size=paths["file_size"],
            width=960,
            height=640,
            thumbnail_storage_key=paths["thumbnail"],
            list_storage_key=paths["list"],
            detail_storage_key=paths["detail"],
            position=0,
            is_cover=True,
        ))
        auctions.append(auction)
    db.flush()
    return auctions


def _create_activity(db, users: dict[str, User], auctions: list[Auction], now: datetime) -> None:
    bidders = [users["collector-dani"], users["collector-eszter"], users["collector-feri"], users["collector-greta"]]
    for index in (0, 1, 2, 3, 8, 9, 10, 11):
        auction = auctions[index]
        bid1 = Bid(auction_id=auction.id, bidder_id=bidders[index % 4].id, amount=auction.starting_price + auction.bid_increment)
        bid2 = Bid(auction_id=auction.id, bidder_id=bidders[(index + 1) % 4].id, amount=auction.starting_price + auction.bid_increment * 2)
        db.add_all([bid1, bid2])
        db.flush()
        auction.current_price = bid2.amount
        auction.highest_bid_id = bid2.id

    db.add_all([
        WatchlistItem(user_id=users["collector-huba"].id, auction_id=auctions[0].id),
        WatchlistItem(user_id=users["collector-eszter"].id, auction_id=auctions[1].id),
        WatchlistItem(user_id=users["collector-greta"].id, auction_id=auctions[2].id),
        SellerFollow(follower_id=users["collector-dani"].id, seller_id=users["seller-anna"].id),
        SellerFollow(follower_id=users["collector-huba"].id, seller_id=users["seller-balazs"].id),
        SavedSearch(user_id=users["collector-eszter"].id, name="Aktív Pokémon", category="Pokemon", status="active", max_price=Decimal("60000")),
        SavedSearch(user_id=users["collector-feri"].id, name="Azonnal megvehető MTG", category="Magic: The Gathering", buy_now=True),
        UserBlock(blocker_id=users["collector-greta"].id, blocked_id=users["collector-huba"].id),
    ])

    for index in (10, 11):
        auction = auctions[index]
        winner = db.get(User, auction.winner_id)
        db.add_all([
            AuctionMessage(auction_id=auction.id, sender_id=auction.seller_id, message="Köszönöm a vásárlást, egyeztessük a szállítást!"),
            AuctionMessage(auction_id=auction.id, sender_id=winner.id, message="Rendben, csomagautomatát szeretnék."),
            AuctionReview(auction_id=auction.id, reviewer_id=winner.id, reviewed_user_id=auction.seller_id, rating=5, comment="Gyors és korrekt eladó."),
        ])

    db.add_all([
        Report(reporter_id=users["collector-dani"].id, target_type="auction", auction_id=auctions[15].id, reason="suspicious_item", details="A minta moderációs folyamat teszteléséhez.", status="open", priority="high"),
        Report(reporter_id=users["collector-eszter"].id, target_type="user", reported_user_id=users["collector-huba"].id, reason="harassment", details="Fejlesztői minta felhasználói jelentés.", status="under_review", priority="normal"),
        Notification(user_id=users["collector-dani"].id, auction_id=auctions[0].id, type="outbid", title="Túllicitáltak", message="Új ajánlat érkezett a figyelt aukcióra."),
        Notification(user_id=users["collector-eszter"].id, auction_id=auctions[10].id, type="auction_won", title="Megnyert aukció", message="Gratulálunk, te nyerted az aukciót!"),
        Notification(user_id=users["collector-feri"].id, auction_id=auctions[5].id, type="saved_search_match", title="Új találat", message="Új aukció felel meg a mentett keresésednek."),
        Notification(user_id=users["seller-anna"].id, auction_id=auctions[10].id, type="auction_sold", title="Eladott tétel", message="Az aukció sikeresen lezárult."),
    ])


def seed_development() -> None:
    if settings.environment.lower() == "production":
        raise RuntimeError("Refusing to seed development data in production.")
    password = _required_password()
    _seed_admin_if_configured()
    now = datetime.now(timezone.utc).replace(microsecond=0)

    with SessionLocal() as db:
        users = _upsert_users(db, password)
        _clear_previous_demo_graph(db, users)
        auctions = _create_auctions(db, users, now)
        _create_activity(db, users, auctions, now)
        db.commit()
        print(f"Development seed ready: {len(users)} users, {len(auctions)} auctions.")


if __name__ == "__main__":
    seed_development()
