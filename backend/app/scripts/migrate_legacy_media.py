import argparse
import json
from uuid import uuid4

from sqlalchemy import select

from app.db.session import SessionLocal
from app.images.processing import process_image
from app.models.auction import AuctionImage
from app.storage import storage
from app.storage.local import LocalStorageProvider
from app.storage.paths import auction_image_keys


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate referenced legacy auction images into the Sprint 15 media layout.")
    parser.add_argument("--legacy-root", default="uploads")
    parser.add_argument("--apply", action="store_true", help="Write files and update database rows. Default is dry-run.")
    args = parser.parse_args()
    legacy = LocalStorageProvider(args.legacy_root)
    report: list[dict[str, object]] = []
    with SessionLocal() as db:
        images = list(db.scalars(select(AuctionImage).order_by(AuctionImage.id)))
        for image in images:
            if image.storage_key.endswith("/original.webp") and storage.exists(image.storage_key):
                report.append({"image_id": image.id, "status": "already-migrated"})
                continue
            if not legacy.exists(image.storage_key):
                report.append({"image_id": image.id, "status": "missing-source"})
                continue
            try:
                content = legacy.read_bytes(image.storage_key)
                processed = process_image(content, image.content_type)
                keys = auction_image_keys(image.auction_id, image.created_at, uuid4())
                if args.apply:
                    storage.save_many_atomic({keys[name]: payload for name, payload in processed.variants.items()})
                    old_values = (image.storage_key, image.thumbnail_storage_key, image.list_storage_key, image.detail_storage_key, image.content_type, image.file_size)
                    try:
                        image.storage_key = keys["original"]
                        image.thumbnail_storage_key = keys["thumbnail"]
                        image.list_storage_key = keys["list"]
                        image.detail_storage_key = keys["detail"]
                        image.content_type = "image/webp"
                        image.file_size = len(processed.variants["original"])
                        db.add(image)
                        db.commit()
                    except Exception:
                        db.rollback()
                        for key in keys.values():
                            storage.delete(key)
                        image.storage_key, image.thumbnail_storage_key, image.list_storage_key, image.detail_storage_key, image.content_type, image.file_size = old_values
                        raise
                report.append({"image_id": image.id, "status": "migrated" if args.apply else "would-migrate", "keys": keys})
            except Exception as exc:
                report.append({"image_id": image.id, "status": "error", "error": type(exc).__name__})
    print(json.dumps({"mode": "apply" if args.apply else "dry-run", "items": report}, ensure_ascii=False, indent=2))
    return 1 if any(item["status"] == "error" for item in report) else 0


if __name__ == "__main__":
    raise SystemExit(main())
