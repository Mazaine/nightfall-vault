from sqlalchemy import func, select

from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.db.session import SessionLocal
from app.models.auction import Auction, AuctionImage, AuctionMessage, AuctionReview, Bid, WatchlistItem
from app.models.moderation import Report, UserBlock
from app.models.notification import Notification
from app.models.user import SavedSearch, SellerFollow, User
from app.scripts.seed_development import DEMO_DOMAIN, _clear_previous_demo_graph, seed_development
from app.scripts.seed_dev_admin import seed_dev_admin
from app.storage import storage


def _count(db, model, *criteria) -> int:
    statement = select(func.count()).select_from(model)
    if criteria:
        statement = statement.where(*criteria)
    return db.scalar(statement) or 0


def _demo_counts(db) -> tuple[int, ...]:
    user_ids = select(User.id).where(User.email.like(f"%@{DEMO_DOMAIN}"))
    auction_ids = select(Auction.id).where(Auction.seller_id.in_(user_ids))
    return (
        _count(db, User, User.email.like(f"%@{DEMO_DOMAIN}")),
        _count(db, Auction, Auction.id.in_(auction_ids)),
        _count(db, AuctionImage, AuctionImage.auction_id.in_(auction_ids)),
        _count(db, Bid, Bid.auction_id.in_(auction_ids)),
        _count(db, AuctionReview, AuctionReview.auction_id.in_(auction_ids)),
        _count(db, AuctionMessage, AuctionMessage.auction_id.in_(auction_ids)),
        _count(db, WatchlistItem, WatchlistItem.auction_id.in_(auction_ids)),
        _count(db, Report, Report.reporter_id.in_(user_ids)),
        _count(db, Notification, Notification.user_id.in_(user_ids)),
        _count(db, SavedSearch, SavedSearch.user_id.in_(user_ids)),
        _count(db, SellerFollow, SellerFollow.follower_id.in_(user_ids)),
        _count(db, UserBlock, UserBlock.blocker_id.in_(user_ids)),
    )


def test_development_seed_is_idempotent_and_preserves_non_demo_user(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("DEV_SEED_PASSWORD", "DevelopmentSeed123!")
    monkeypatch.setattr(storage, "root", (tmp_path / "media").resolve())
    storage.root.mkdir(parents=True, exist_ok=True)

    with SessionLocal() as db:
        sentinel = db.scalar(select(User).where(User.email == "sentinel@preserve.local"))
        if sentinel is None:
            sentinel = User(
                email="sentinel@preserve.local",
                username="seed-preservation-sentinel",
                full_name="Preserved User",
                password_hash=hash_password("PreservedUser123!"),
                is_active=True,
                is_email_verified=True,
            )
            db.add(sentinel)
            db.commit()
        sentinel_id = sentinel.id

    try:
        seed_development()
        with SessionLocal() as db:
            first_counts = _demo_counts(db)
        seed_development()
        with SessionLocal() as db:
            second_counts = _demo_counts(db)
            preserved = db.get(User, sentinel_id)

        assert first_counts == (8, 16, 16, 16, 2, 4, 3, 2, 4, 2, 2, 1)
        assert second_counts == first_counts
        assert preserved is not None
        assert preserved.email == "sentinel@preserve.local"
    finally:
        with SessionLocal() as db:
            demo_users = list(db.scalars(select(User).where(User.email.like(f"%@{DEMO_DOMAIN}"))))
            _clear_previous_demo_graph(db, {user.username: user for user in demo_users})
            db.commit()


def test_development_seed_refuses_production(monkeypatch) -> None:
    monkeypatch.setattr(settings, "environment", "production")

    try:
        seed_development()
    except RuntimeError as error:
        assert "production" in str(error).lower()
    else:
        raise AssertionError("Development seed must refuse production environments.")


def test_admin_seed_reuses_existing_username_when_email_changes(monkeypatch) -> None:
    username = "seed-admin-reuse"
    old_email = "seed-admin-old@auction-test.local"
    new_email = "seed-admin-new@auction-test.local"
    password = "UpdatedDevelopmentAdmin123!"

    with SessionLocal() as db:
        db.query(User).filter(User.email.in_([old_email, new_email])).delete(synchronize_session=False)
        db.query(User).filter(User.username == username).delete(synchronize_session=False)
        existing = User(
            email=old_email,
            username=username,
            full_name="Old Admin",
            password_hash=hash_password("OldDevelopmentAdmin123!"),
            role="admin",
            is_active=True,
            is_email_verified=True,
        )
        db.add(existing)
        db.commit()
        existing_id = existing.id

    monkeypatch.setenv("DEV_ADMIN_EMAIL", new_email)
    monkeypatch.setenv("DEV_ADMIN_PASSWORD", password)
    monkeypatch.setenv("DEV_ADMIN_USERNAME", username)
    monkeypatch.setenv("DEV_ADMIN_FULL_NAME", "Updated Admin")

    try:
        seed_dev_admin()
        with SessionLocal() as db:
            updated = db.scalar(select(User).where(User.username == username))
            assert updated is not None
            assert updated.id == existing_id
            assert updated.email == new_email
            assert updated.full_name == "Updated Admin"
            assert updated.role == "admin"
            assert updated.is_active is True
            assert updated.is_email_verified is True
            assert verify_password(password, updated.password_hash)
    finally:
        with SessionLocal() as db:
            db.query(User).filter(User.username == username).delete(synchronize_session=False)
            db.commit()
