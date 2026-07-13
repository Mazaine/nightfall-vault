"""Initialize a fresh database or upgrade an already versioned database."""

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

import app.models  # noqa: F401
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine


def bootstrap_database() -> None:
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is required.")

    config = Config("alembic.ini")
    if inspect(engine).has_table("alembic_version"):
        command.upgrade(config, "head")
        print("Versioned database upgraded to Alembic head.")
        return

    Base.metadata.create_all(bind=engine)
    command.stamp(config, "head")
    print("Fresh database initialized from current metadata and stamped at Alembic head.")


if __name__ == "__main__":
    bootstrap_database()
