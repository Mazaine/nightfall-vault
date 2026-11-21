"""Keep sold photos independent of a replenishable source listing's gallery."""
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy import event
from sqlalchemy.orm import Session
from app.models.auction import AuctionImage
from app.storage import storage
from app.storage.exceptions import StorageError
from app.storage.paths import auction_image_keys

PENDING = "seller_stock_photo_copies"


@event.listens_for(Session, "after_commit")
def _keep_committed_photos(session):
    if not session.in_nested_transaction():
        session.info.pop(PENDING, None)


@event.listens_for(Session, "after_transaction_end")
def _remove_uncommitted_photos(session, transaction):
    # Also covers Session.close() without an explicit rollback and flush failures.
    if transaction.parent is None:
        for key in session.info.pop(PENDING, []):
            storage.delete(key)


def copy_stock_photos(db, source, sold):
    if not source.images:
        return
    for image in source.images:
        keys = auction_image_keys(sold.id, sold.created_at, uuid4())
        files = {}
        attributes = {}
        try:
            for name, field in (("original", "storage_key"), ("thumbnail", "thumbnail_storage_key"), ("list", "list_storage_key"), ("detail", "detail_storage_key")):
                original = getattr(image, field)
                attributes[field] = keys[name] if original else None
                if original:
                    files[keys[name]] = storage.read_bytes(original)
            saved = storage.save_many_atomic(files)
        except (OSError, StorageError):
            raise HTTPException(503, "A saját fotó megőrzése nem sikerült. A vásárlás nem véglegesíthető; próbáld újra.") from None
        db.info.setdefault(PENDING, []).extend(saved)
        db.add(AuctionImage(auction_id=sold.id, original_filename=image.original_filename, content_type=image.content_type,
                            file_size=image.file_size, width=image.width, height=image.height,
                            position=image.position, is_cover=image.is_cover, **attributes))
    db.flush()
