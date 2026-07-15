import argparse
import json
import logging

from app.db.session import SessionLocal
from app.services.media_audit import audit_media
from app.storage import storage

logger = logging.getLogger(__name__)


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit Nightfall media files against auction image records.")
    parser.add_argument("--delete-orphans", action="store_true", help="Explicitly delete files that have no database reference.")
    parser.add_argument("--summary", action="store_true", help="Print counts instead of the complete path lists.")
    args = parser.parse_args()
    with SessionLocal() as db:
        result = audit_media(db, storage)
    deleted: list[str] = []
    if args.delete_orphans:
        for storage_key in result.orphan_files:
            storage.delete(storage_key)
            deleted.append(storage_key)
            logger.warning("Deleted orphan media file: %s", storage_key)
    payload = {
        "mode": "delete" if args.delete_orphans else "dry-run",
        "orphan_files": list(result.orphan_files),
        "missing_files": list(result.missing_files),
        "deleted_files": deleted,
    }
    if args.summary:
        payload = {
            "mode": payload["mode"],
            "orphan_file_count": len(result.orphan_files),
            "missing_file_count": len(result.missing_files),
            "deleted_file_count": len(deleted),
        }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 2 if result.missing_files else 0


if __name__ == "__main__":
    raise SystemExit(main())
