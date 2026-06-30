from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.newsletter import NewsletterSubscriber
from app.models.user import User


def backfill() -> None:
    db = SessionLocal()
    created_count = 0
    try:
        users = db.scalars(select(User)).all()
        for user in users:
            existing = db.scalar(select(NewsletterSubscriber).where(NewsletterSubscriber.email == user.email))
            if existing is not None:
                continue
            db.add(
                NewsletterSubscriber(
                    email=user.email,
                    full_name=user.full_name,
                    user_id=user.id,
                    is_active=True,
                    source="import",
                ),
            )
            created_count += 1

        db.commit()
        print(f"Import hírlevél feliratkozók létrehozva: {created_count}")
    finally:
        db.close()


if __name__ == "__main__":
    backfill()
