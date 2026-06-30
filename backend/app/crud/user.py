from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User
from app.schemas.user import UserCreate


def normalize_email(email: str) -> str:
    return email.strip().lower()


def get_user_by_email(db: Session, email: str) -> User | None:
    statement = select(User).where(User.email == normalize_email(email), User.deleted_at.is_(None))
    return db.scalar(statement)


def get_user_by_username(db: Session, username: str) -> User | None:
    statement = select(User).where(User.username == username.strip(), User.deleted_at.is_(None))
    return db.scalar(statement)


def create_user(db: Session, user_create: UserCreate, password_hash: str) -> User:
    user = User(
        email=normalize_email(user_create.email),
        username=user_create.username.strip(),
        full_name=user_create.full_name.strip(),
        password_hash=password_hash,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
