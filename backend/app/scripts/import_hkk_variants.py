"""Preview or import official HKK variant attestations for one concrete edition.

Examples:
  python -m app.scripts.import_hkk_variants 264 "Promóciós lapok (2026)"
  python -m app.scripts.import_hkk_variants 264 "Promóciós lapok (2026)" --apply

Dry-run is the default. Manual CSV attestations are never overwritten.
"""
from __future__ import annotations

import argparse
import json

from app.db.session import SessionLocal
from app.services.hkk_variants import apply_official_edition, official_edition_preview


def main() -> None:
    parser = argparse.ArgumentParser(description="HKK lapváltozatok hivatalos, kiadásonkénti hitelesítése")
    parser.add_argument("edition_id")
    parser.add_argument("edition_name")
    parser.add_argument("--apply", action="store_true", help="Az előnézet után adatbázisba ír")
    args = parser.parse_args()
    if not args.edition_id.isdigit() or int(args.edition_id) <= 0:
        parser.error("edition_id must be a positive numeric HKK edition ID")
    edition_id = str(int(args.edition_id))
    with SessionLocal() as db:
        result = apply_official_edition(db, edition_id, args.edition_name) if args.apply else official_edition_preview(db, edition_id)
        if args.apply:
            db.commit()
    print(json.dumps({"dry_run": not args.apply, **result}, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
