from __future__ import annotations

import secrets
import threading
from contextlib import contextmanager, nullcontext
from datetime import timedelta
from decimal import Decimal
from io import BytesIO
from uuid import uuid4

from fastapi import HTTPException
from PIL import Image, ImageDraw
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.images.processing import process_image
from app.models.auction import Auction, AuctionBidExclusion, AuctionImage, AuctionMessage, AuctionReview, Bid, WatchlistItem
from app.models.category import Category
from app.models.demo_auction import DemoAuctionBatch
from app.models.moderation import Report
from app.models.notification import Notification, WatchlistReminder
from app.models.transaction import AuctionTransaction
from app.models.user import User
from app.services.auction_lifecycle import now_utc
from app.services.security_audit import create_domain_audit_log
from app.storage import storage
from app.storage.paths import auction_image_keys


CREATE_CONFIRMATION = "DEMO AUKCIÓK LÉTREHOZÁSA"
RESET_CONFIRMATION = "DEMO AUKCIÓK ÚJRAGENERÁLÁSA"
CLEANUP_CONFIRMATION = "DEMO AUKCIÓK TÖRLÉSE"
LOCK_KEY = 581_020_026
_LOCAL_LOCK = threading.Lock()


class DemoAuctionService:
    def __init__(self, db: Session) -> None:
        self.db = db

    @contextmanager
    def operation_lock(self):
        dialect = self.db.bind.dialect.name if self.db.bind is not None else ""
        acquired = False
        lock_connection = None
        if dialect == "postgresql":
            lock_connection = self.db.bind.connect()
            acquired = bool(
                lock_connection.execute(
                    text("SELECT pg_try_advisory_lock(:key)"), {"key": LOCK_KEY}
                ).scalar()
            )
        else:
            acquired = _LOCAL_LOCK.acquire(blocking=False)
        if not acquired:
            if lock_connection is not None:
                lock_connection.close()
            raise HTTPException(status_code=409, detail="Már folyamatban van egy demóadat-művelet.")
        try:
            yield
        finally:
            if dialect == "postgresql":
                try:
                    lock_connection.execute(
                        text("SELECT pg_advisory_unlock(:key)"), {"key": LOCK_KEY}
                    )
                finally:
                    lock_connection.close()
            else:
                _LOCAL_LOCK.release()

    @staticmethod
    def validate_counts(regular_count: int, featured_count: int) -> None:
        total = regular_count + featured_count
        if regular_count < 0 or featured_count < 0 or total < 1 or total > 500:
            raise HTTPException(status_code=422, detail="Összesen 1 és 500 közötti demóaukció kérhető.")

    def categories(self) -> list[str]:
        rows = list(self.db.scalars(select(Category.name).where(Category.is_active.is_(True)).order_by(Category.sort_order, Category.id).limit(12)).all())
        return rows or ["Pokemon", "Magic: The Gathering", "One Piece", "Yu-Gi-Oh!", "Disney Lorcana"]

    def preview(self, regular_count: int = 80, featured_count: int = 20) -> dict:
        self.validate_counts(regular_count, featured_count)
        total = regular_count + featured_count
        now = now_utc()
        return {
            "regular_count": regular_count,
            "featured_count": featured_count,
            "total_auctions": total,
            "image_count": total,
            "media_variant_count": total * 4,
            "expected_bid_count": (total // 3) * 2,
            "categories": self.categories(),
            "earliest_end_at": now + timedelta(hours=6),
            "latest_end_at": now + timedelta(hours=6 + total * 3),
            "buy_now_count": total // 4,
            "five_minute_rule_count": total // 2,
            "demo_user_count": 5,
        }

    def latest_batch(self, batch_key: str | None = None) -> DemoAuctionBatch | None:
        statement = select(DemoAuctionBatch)
        if batch_key:
            statement = statement.where(DemoAuctionBatch.batch_key == batch_key)
        return self.db.scalar(statement.order_by(DemoAuctionBatch.created_at.desc(), DemoAuctionBatch.id.desc()).limit(1))

    def active_batch(self) -> DemoAuctionBatch | None:
        return self.db.scalar(select(DemoAuctionBatch).where(DemoAuctionBatch.status == "active").order_by(DemoAuctionBatch.id.desc()).limit(1))

    def status(self, batch_key: str | None = None) -> dict:
        batch = self.latest_batch(batch_key)
        if batch is None:
            return {"batch_key": None, "status": "none"}
        auction_ids = select(Auction.id).where(Auction.demo_batch_id == batch.id)
        return {
            "batch_key": batch.batch_key,
            "status": batch.status,
            "regular_count": batch.regular_count,
            "featured_count": batch.featured_count,
            "total_auctions": int(self.db.scalar(select(func.count()).select_from(Auction).where(Auction.demo_batch_id == batch.id)) or 0),
            "image_count": int(self.db.scalar(select(func.count()).select_from(AuctionImage).where(AuctionImage.auction_id.in_(auction_ids))) or 0),
            "media_variant_count": int(self.db.scalar(select(func.count()).select_from(AuctionImage).where(AuctionImage.auction_id.in_(auction_ids))) or 0) * 4,
            "bid_count": int(self.db.scalar(select(func.count()).select_from(Bid).where(Bid.auction_id.in_(auction_ids))) or 0),
            "demo_user_count": int(self.db.scalar(select(func.count()).select_from(User).where(User.demo_batch_id == batch.id)) or 0),
            "created_at": batch.created_at,
            "completed_at": batch.completed_at,
            "deleted_at": batch.deleted_at,
            "created_by_admin": batch.created_by_admin.full_name if batch.created_by_admin else None,
            "error_message": batch.error_message,
        }

    def _make_user(self, batch: DemoAuctionBatch, suffix: str, full_name: str, *, vip: bool = False) -> User:
        token = batch.batch_key.replace("-", "")[:12]
        user = User(
            email=f"demo-{token}-{suffix}@nightfall-demo.invalid",
            username=f"demo-{token}-{suffix}",
            full_name=full_name,
            password_hash=hash_password(secrets.token_urlsafe(48)),
            role="tester",
            demo_batch_id=batch.id,
            is_active=True,
            is_email_verified=True,
            vip_expires_at=now_utc() + timedelta(days=32) if vip else None,
        )
        self.db.add(user)
        self.db.flush()
        return user

    @staticmethod
    def _image_bytes(title: str, featured: bool, index: int) -> bytes:
        base = (40, 15, 65) if featured else (16 + index % 24, 28, 48 + index % 36)
        image = Image.new("RGB", (1200, 800), base)
        draw = ImageDraw.Draw(image)
        gold = (220, 183, 62)
        violet = (151, 70, 255)
        draw.rectangle((28, 28, 1172, 772), outline=gold if featured else violet, width=8)
        draw.rectangle((70, 70, 1130, 730), outline=(96, 57, 132), width=3)
        draw.text((95, 330), "NIGHTFALL VAULT", fill=gold)
        draw.text((95, 390), title, fill=(245, 238, 224))
        draw.text((95, 455), "TESZT AUKCIÓ", fill=gold if featured else violet)
        output = BytesIO()
        image.save(output, format="PNG")
        return output.getvalue()

    def _attach_image(self, auction: Auction, featured: bool, index: int, saved_keys: list[str]) -> None:
        processed = process_image(self._image_bytes(auction.title, featured, index), "image/png")
        keys = auction_image_keys(auction.id, auction.created_at, uuid4())
        storage.save_many_atomic({keys[name]: payload for name, payload in processed.variants.items()})
        saved_keys.extend(keys.values())
        self.db.add(AuctionImage(
            auction_id=auction.id, storage_key=keys["original"], original_filename="nightfall-demo.png",
            content_type="image/webp", file_size=len(processed.variants["original"]), width=1200, height=800,
            thumbnail_storage_key=keys["thumbnail"], list_storage_key=keys["list"], detail_storage_key=keys["detail"],
            position=0, is_cover=True,
        ))

    def create(self, regular_count: int, featured_count: int, admin: User | None, confirmation: str, *, cli: bool = False, locked: bool = False) -> dict:
        self.validate_counts(regular_count, featured_count)
        if confirmation != CREATE_CONFIRMATION:
            raise HTTPException(status_code=422, detail=f'A folytatáshoz pontosan ezt írd be: {CREATE_CONFIRMATION}')
        with (nullcontext() if locked else self.operation_lock()):
            if self.active_batch() is not None:
                raise HTTPException(status_code=409, detail="Már létezik aktív demóaukció-batch. Használd az újragenerálást.")
            batch = DemoAuctionBatch(batch_key=str(uuid4()), status="creating", regular_count=regular_count, featured_count=featured_count, created_by_admin_id=admin.id if admin else None)
            self.db.add(batch)
            self.db.commit()
            self.db.refresh(batch)
            saved_keys: list[str] = []
            try:
                normal_seller = self._make_user(batch, "seller", "Nightfall demó eladó")
                featured_seller = self._make_user(batch, "featured-seller", "Nightfall VIP demó eladó", vip=True)
                bidders = [self._make_user(batch, f"bidder-{i}", f"Nightfall demó licitáló {i}") for i in range(1, 4)]
                categories = self.categories()
                now = now_utc()
                all_auctions: list[Auction] = []
                specs = [(False, i, f"Teszt aukció {i:03d}") for i in range(1, regular_count + 1)] + [(True, i, f"Kiemelt teszt {i:03d}") for i in range(1, featured_count + 1)]
                for sequence, (featured, number, title) in enumerate(specs, start=1):
                    price = Decimal(1000 + (sequence % 24) * 500)
                    increment = Decimal((1 + sequence % 5) * 100)
                    buy_now = sequence % 4 == 0
                    auction = Auction(
                        seller_id=(featured_seller if featured else normal_seller).id,
                        demo_batch_id=batch.id,
                        creation_key=str(uuid4()), title=title,
                        description="Biztonságosan elkülönített Nightfall Vault demóaukció tesztelői ellenőrzéshez.",
                        category=categories[(sequence - 1) % len(categories)], condition=("fresh", "like_new", "played")[sequence % 3],
                        status="active", starting_price=price, bid_increment=increment, current_price=price,
                        buy_now_enabled=buy_now, buy_now_price=price + increment * 12 if buy_now else None,
                        starts_at=now - timedelta(hours=1), ends_at=now + timedelta(hours=6 + sequence * 3),
                        five_minute_rule_enabled=sequence % 2 == 0,
                        seller_declaration_accepted_at=now, seller_declaration_version="2026-07-11",
                    )
                    self.db.add(auction)
                    self.db.flush()
                    self._attach_image(auction, featured, sequence, saved_keys)
                    all_auctions.append(auction)
                self.db.flush()
                for sequence, auction in enumerate(all_auctions, start=1):
                    if sequence % 3 == 0:
                        first = Bid(auction_id=auction.id, bidder_id=bidders[sequence % 3].id, amount=auction.current_price + auction.bid_increment)
                        self.db.add(first); self.db.flush()
                        second = Bid(auction_id=auction.id, bidder_id=bidders[(sequence + 1) % 3].id, amount=first.amount + auction.bid_increment)
                        self.db.add(second); self.db.flush()
                        auction.current_price = second.amount; auction.highest_bid_id = second.id
                    if sequence % 5 == 0:
                        self.db.add(WatchlistItem(user_id=bidders[(sequence + 2) % 3].id, auction_id=auction.id))
                    self.db.add(auction)
                batch.status = "active"; batch.completed_at = now_utc(); batch.error_message = None
                create_domain_audit_log(self.db, action="demo_auction_batch_created", user_id=admin.id if admin else None, metadata={"batch_key": batch.batch_key, "regular_count": regular_count, "featured_count": featured_count, "source": "cli" if cli else "admin_api"})
                self.db.add(batch); self.db.commit()
                result = self.status(batch.batch_key)
                return {"action": "create", **result}
            except Exception as exc:
                self.db.rollback()
                for key in saved_keys:
                    storage.delete(key)
                failed = self.db.get(DemoAuctionBatch, batch.id)
                if failed is not None:
                    failed.status = "failed"; failed.error_message = "A demóadatok létrehozása nem sikerült."
                    self.db.add(failed); self.db.commit()
                raise exc

    def cleanup_preview(self, batch_key: str | None = None) -> dict:
        batch = self.latest_batch(batch_key) if batch_key else self.active_batch()
        if batch is None or batch.status == "deleted":
            raise HTTPException(status_code=404, detail="Nincs törölhető demóaukció-batch.")
        auction_ids = select(Auction.id).where(Auction.demo_batch_id == batch.id)
        images = list(self.db.scalars(select(AuctionImage).where(AuctionImage.auction_id.in_(auction_ids))).all())
        count = lambda model, criterion: int(self.db.scalar(select(func.count()).select_from(model).where(criterion)) or 0)
        return {
            "batch_key": batch.batch_key,
            "auctions": count(Auction, Auction.demo_batch_id == batch.id), "images": len(images),
            "media_files": sum(sum(bool(key) for key in (i.storage_key, i.thumbnail_storage_key, i.list_storage_key, i.detail_storage_key)) for i in images),
            "bids": count(Bid, Bid.auction_id.in_(auction_ids)), "watchlist_items": count(WatchlistItem, WatchlistItem.auction_id.in_(auction_ids)),
            "notifications": count(Notification, Notification.auction_id.in_(auction_ids)), "transactions": count(AuctionTransaction, AuctionTransaction.auction_id.in_(auction_ids)),
            "messages": count(AuctionMessage, AuctionMessage.auction_id.in_(auction_ids)), "reviews": count(AuctionReview, AuctionReview.auction_id.in_(auction_ids)),
            "bid_exclusions": count(AuctionBidExclusion, AuctionBidExclusion.auction_id.in_(auction_ids)), "reports": count(Report, Report.auction_id.in_(auction_ids)),
            "demo_users": count(User, User.demo_batch_id == batch.id),
        }

    def cleanup(self, admin: User | None, confirmation: str, batch_key: str | None = None, *, cli: bool = False, locked: bool = False) -> dict:
        if confirmation != CLEANUP_CONFIRMATION:
            raise HTTPException(status_code=422, detail=f'A folytatáshoz pontosan ezt írd be: {CLEANUP_CONFIRMATION}')
        with (nullcontext() if locked else self.operation_lock()):
            preview = self.cleanup_preview(batch_key)
            batch = self.latest_batch(preview["batch_key"])
            assert batch is not None
            auction_ids = list(self.db.scalars(select(Auction.id).where(Auction.demo_batch_id == batch.id)).all())
            user_ids = list(self.db.scalars(select(User.id).where(User.demo_batch_id == batch.id)).all())
            images = list(self.db.scalars(select(AuctionImage).where(AuctionImage.auction_id.in_(auction_ids))).all()) if auction_ids else []
            keys = [key for image in images for key in (image.storage_key, image.thumbnail_storage_key, image.list_storage_key, image.detail_storage_key) if key]
            staged = storage.stage_delete(keys)
            try:
                batch.status = "deleting"; self.db.add(batch); self.db.flush()
                if auction_ids:
                    self.db.execute(delete(Notification).where(Notification.auction_id.in_(auction_ids)))
                    self.db.execute(delete(WatchlistReminder).where(WatchlistReminder.auction_id.in_(auction_ids)))
                    self.db.execute(delete(Report).where(Report.auction_id.in_(auction_ids)))
                    self.db.execute(update(Auction).where(Auction.id.in_(auction_ids)).values(highest_bid_id=None))
                    self.db.flush()
                    self.db.execute(delete(Auction).where(Auction.id.in_(auction_ids)))
                if user_ids:
                    self.db.execute(delete(Notification).where(Notification.user_id.in_(user_ids)))
                    self.db.execute(delete(User).where(User.id.in_(user_ids)))
                batch.status = "deleted"; batch.deleted_at = now_utc(); batch.completed_at = batch.completed_at or now_utc()
                create_domain_audit_log(self.db, action="demo_auction_batch_deleted", user_id=admin.id if admin else None, metadata={"batch_key": batch.batch_key, "counts": preview, "source": "cli" if cli else "admin_api"})
                self.db.add(batch); self.db.commit()
            except Exception:
                self.db.rollback(); storage.rollback_delete(staged); raise
            storage.finalize_delete(staged)
            return {"action": "cleanup", "batch_key": batch.batch_key, "status": batch.status, "deleted_records": sum(value for key, value in preview.items() if key != "batch_key")}

    def reset(self, regular_count: int, featured_count: int, admin: User | None, confirmation: str, *, cli: bool = False) -> dict:
        if confirmation != RESET_CONFIRMATION:
            raise HTTPException(status_code=422, detail=f'A folytatáshoz pontosan ezt írd be: {RESET_CONFIRMATION}')
        self.validate_counts(regular_count, featured_count)
        with self.operation_lock():
            active = self.active_batch()
            if active is not None:
                self.cleanup(admin, CLEANUP_CONFIRMATION, active.batch_key, cli=cli, locked=True)
            result = self.create(regular_count, featured_count, admin, CREATE_CONFIRMATION, cli=cli, locked=True)
            create_domain_audit_log(self.db, action="demo_auction_batch_reset", user_id=admin.id if admin else None, metadata={"new_batch_key": result.get("batch_key"), "regular_count": regular_count, "featured_count": featured_count, "source": "cli" if cli else "admin_api"})
            self.db.commit()
            return {"action": "reset", **result}
