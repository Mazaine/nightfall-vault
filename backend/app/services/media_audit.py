from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.auction import AuctionImage
from app.storage.base import StorageProvider


@dataclass(frozen=True)
class MediaAuditResult:
    orphan_files: tuple[str, ...]
    missing_files: tuple[str, ...]


def database_media_keys(db: Session) -> set[str]:
    rows = db.execute(select(
        AuctionImage.storage_key,
        AuctionImage.thumbnail_storage_key,
        AuctionImage.list_storage_key,
        AuctionImage.detail_storage_key,
    )).all()
    return {key for row in rows for key in row if key}


def audit_media(db: Session, provider: StorageProvider) -> MediaAuditResult:
    database_keys = database_media_keys(db)
    storage_keys = provider.iter_files("auctions") | provider.iter_files(".trash")
    return MediaAuditResult(
        orphan_files=tuple(sorted(storage_keys - database_keys)),
        missing_files=tuple(sorted(database_keys - storage_keys)),
    )
