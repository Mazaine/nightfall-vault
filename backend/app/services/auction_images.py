from uuid import uuid4

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.images.processing import process_image
from app.images.validation import ALLOWED_INPUT_FORMATS, safe_original_filename
from app.models.auction import Auction, AuctionImage
from app.models.user import User
from app.services.auction_lifecycle import require_owner_or_admin, sync_auction_status
from app.storage import storage
from app.storage.paths import auction_image_keys

MAX_AUCTION_IMAGES = 5


def _assert_image_editable(auction: Auction) -> None:
    if auction.status not in {"draft", "scheduled", "active"}:
        raise HTTPException(status_code=409, detail="Ebben az aukcióállapotban a képek nem módosíthatók.")


def _next_position(auction: Auction) -> int:
    return max((image.position for image in auction.images), default=-1) + 1


async def add_auction_image(db: Session, auction: Auction, upload: UploadFile, user: User, is_cover: bool = False) -> AuctionImage:
    sync_auction_status(db, auction)
    require_owner_or_admin(auction, user)
    _assert_image_editable(auction)
    if len(auction.images) >= MAX_AUCTION_IMAGES:
        raise HTTPException(status_code=409, detail="Egy aukcióhoz legfeljebb 5 kép tölthető fel.")
    if upload.content_type not in ALLOWED_INPUT_FORMATS.values():
        raise HTTPException(status_code=400, detail="Csak JPEG, PNG vagy WEBP kép tölthető fel.")

    content = await upload.read()
    processed = process_image(content, upload.content_type)
    keys = auction_image_keys(auction.id, auction.created_at, uuid4())
    storage.save_many_atomic({keys[name]: payload for name, payload in processed.variants.items()})

    should_be_cover = is_cover or len(auction.images) == 0
    if should_be_cover:
        for current in auction.images:
            current.is_cover = False
            db.add(current)

    image = AuctionImage(
        auction_id=auction.id,
        storage_key=keys["original"],
        original_filename=safe_original_filename(upload.filename),
        content_type="image/webp",
        file_size=len(processed.variants["original"]),
        width=processed.source_width,
        height=processed.source_height,
        thumbnail_storage_key=keys["thumbnail"],
        list_storage_key=keys["list"],
        detail_storage_key=keys["detail"],
        position=_next_position(auction),
        is_cover=should_be_cover,
    )
    try:
        db.add(image)
        db.commit()
        db.refresh(image)
        return image
    except Exception:
        db.rollback()
        for key in keys.values():
            storage.delete(key)
        raise


def set_cover_image(db: Session, auction: Auction, image_id: int, user: User) -> AuctionImage:
    sync_auction_status(db, auction)
    require_owner_or_admin(auction, user)
    _assert_image_editable(auction)
    target = next((image for image in auction.images if image.id == image_id), None)
    if target is None:
        raise HTTPException(status_code=404, detail="Az aukciókép nem található.")
    for image in auction.images:
        image.is_cover = image.id == image_id
        db.add(image)
    db.commit()
    db.refresh(target)
    return target


def delete_auction_image(db: Session, auction: Auction, image_id: int, user: User) -> AuctionImage:
    sync_auction_status(db, auction)
    require_owner_or_admin(auction, user)
    _assert_image_editable(auction)
    image = next((item for item in auction.images if item.id == image_id), None)
    if image is None:
        raise HTTPException(status_code=404, detail="Az aukciókép nem található.")
    if len(auction.images) == 1 and auction.status != "draft":
        raise HTTPException(status_code=409, detail="Nem törölhető egy nem piszkozat aukció utolsó képe.")

    keys = [image.storage_key, image.thumbnail_storage_key, image.list_storage_key, image.detail_storage_key]
    staged = storage.stage_delete(keys)
    was_cover = image.is_cover
    remaining = [item for item in auction.images if item.id != image_id]
    try:
        db.delete(image)
        db.flush()
        if was_cover and remaining:
            replacement = sorted(remaining, key=lambda item: item.position)[0]
            replacement.is_cover = True
            db.add(replacement)
        for position, item in enumerate(sorted(remaining, key=lambda item: item.position)):
            item.position = position
            db.add(item)
        db.commit()
    except Exception:
        db.rollback()
        storage.rollback_delete(staged)
        raise
    storage.finalize_delete(staged)
    return image
