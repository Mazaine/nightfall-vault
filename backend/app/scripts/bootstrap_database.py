"""Initialize a fresh database or upgrade an already versioned database."""

from alembic import command
from alembic.config import Config
from app.core.config import settings


def bootstrap_database() -> None:
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is required.")

    config = Config("alembic.ini")
    command.upgrade(config, "head")
    print("Database initialized or upgraded to Alembic head.")


if __name__ == "__main__":
    bootstrap_database()
