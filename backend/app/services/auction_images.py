from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.models.auction import ALLOWED_AUCTION_IMAGE_TYPES, Auction, AuctionImage
from app.models.user import User
from app.services.auction_lifecycle import require_owner_or_admin, sync_auction_status
from app.services.image_processing import optimize_image_variants
from app.services.storage import storage

AUCTION_UPLOAD_DIR = Path("uploads/auctions")
MAX_AUCTION_IMAGES = 5
MAX_AUCTION_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_SUFFIXES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def _detect_image_content_type(content: bytes) -> str | None:
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"GIF87a") or content.startswith(b"GIF89a"):
        return "image/gif"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return None


def _assert_image_editable(auction: Auction) -> None:
    if auction.status not in {"draft", "scheduled"}:
        raise HTTPException(status_code=409, detail="Auction images cannot be changed in this status.")


def _next_position(auction: Auction) -> int:
    if not auction.images:
        return 0
    return max(image.position for image in auction.images) + 1


async def add_auction_image(db: Session, auction: Auction, upload: UploadFile, user: User, is_cover: bool = False) -> AuctionImage:
    sync_auction_status(db, auction)
    require_owner_or_admin(auction, user)
    _assert_image_editable(auction)
    if len(auction.images) >= MAX_AUCTION_IMAGES:
        raise HTTPException(status_code=409, detail="An auction can have at most 5 images.")
    if upload.content_type not in ALLOWED_AUCTION_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WEBP or GIF images are allowed.")

    content = await upload.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(content) > MAX_AUCTION_IMAGE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Auction image is too large.")
    detected_type = _detect_image_content_type(content)
    if detected_type != upload.content_type:
        raise HTTPException(status_code=400, detail="Image content does not match the declared MIME type.")

    suffix = ALLOWED_IMAGE_SUFFIXES[upload.content_type]
    base_key = uuid4().hex
    width, height, variants = optimize_image_variants(content, upload.content_type)
    storage_key = f"auctions/{auction.id}/{base_key}/original{suffix}"
    thumbnail_key = f"auctions/{auction.id}/{base_key}/thumbnail{suffix}"
    list_key = f"auctions/{auction.id}/{base_key}/list{suffix}"
    detail_key = f"auctions/{auction.id}/{base_key}/detail{suffix}"
    storage.save(storage_key, content)
    storage.save(thumbnail_key, variants["thumbnail"])
    storage.save(list_key, variants["list"])
    storage.save(detail_key, variants["detail"])

    should_be_cover = is_cover or len(auction.images) == 0
    if should_be_cover:
        for image in auction.images:
            image.is_cover = False
            db.add(image)

    image = AuctionImage(
        auction_id=auction.id,
        storage_key=storage_key,
        original_filename=Path(upload.filename or "auction-image").name[:255],
        content_type=upload.content_type,
        file_size=len(content),
        width=width,
        height=height,
        thumbnail_storage_key=thumbnail_key,
        list_storage_key=list_key,
        detail_storage_key=detail_key,
        position=_next_position(auction),
        is_cover=should_be_cover,
    )
    db.add(image)
    db.commit()
    db.refresh(image)
    return image


def set_cover_image(db: Session, auction: Auction, image_id: int, user: User) -> AuctionImage:
    sync_auction_status(db, auction)
    require_owner_or_admin(auction, user)
    _assert_image_editable(auction)
    target = next((image for image in auction.images if image.id == image_id), None)
    if target is None:
        raise HTTPException(status_code=404, detail="Auction image not found.")
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
        raise HTTPException(status_code=404, detail="Auction image not found.")
    if len(auction.images) == 1 and auction.status != "draft":
        raise HTTPException(status_code=409, detail="Cannot delete the last image from a non-draft auction.")
    response = image
    was_cover = image.is_cover
    keys_to_delete = [image.storage_key, image.thumbnail_storage_key, image.list_storage_key, image.detail_storage_key]
    db.delete(image)
    db.flush()
    remaining = [item for item in auction.images if item.id != image_id]
    if was_cover and remaining:
        replacement = sorted(remaining, key=lambda item: item.position)[0]
        replacement.is_cover = True
        db.add(replacement)
    for position, item in enumerate(sorted(remaining, key=lambda item: item.position)):
        item.position = position
        db.add(item)
    db.commit()
    for key in keys_to_delete:
        try:
            storage.delete(key)
        except OSError:
            pass
    return response
