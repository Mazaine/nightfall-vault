from datetime import datetime, timezone
from pathlib import PurePosixPath
from uuid import UUID

from app.core.config import settings
from app.storage.exceptions import InvalidStorageKey

IMAGE_VARIANT_NAMES = ("original", "detail", "list", "thumbnail")


def normalize_storage_key(storage_key: str) -> str:
    if not storage_key or "\x00" in storage_key or "\\" in storage_key:
        raise InvalidStorageKey("Invalid media storage key.")
    path = PurePosixPath(storage_key)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise InvalidStorageKey("Invalid media storage key.")
    return path.as_posix()


def auction_image_keys(auction_id: int, created_at: datetime | None, image_id: UUID) -> dict[str, str]:
    timestamp = created_at or datetime.now(timezone.utc)
    base = PurePosixPath("auctions", f"{timestamp.year:04d}", f"{timestamp.month:02d}", str(auction_id), str(image_id))
    return {name: (base / f"{name}.webp").as_posix() for name in IMAGE_VARIANT_NAMES}


def media_url(storage_key: str | None) -> str | None:
    if not storage_key:
        return None
    key = normalize_storage_key(storage_key)
    prefix = settings.media_url_prefix.rstrip("/")
    return f"{prefix}/{key}"
