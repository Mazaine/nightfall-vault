import argparse
import csv
import sys

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.user import VipActivationCode
from app.services.membership import decrypt_vip_code, encrypt_vip_code, vip_code_digest


def main() -> None:
    parser = argparse.ArgumentParser(description="Korábbi VIP-kódok titkosított archívumának visszaállítása CSV-ből.")
    parser.add_argument("--apply", action="store_true", help="Az ellenőrzött egyezések mentése. Enélkül dry-run fut.")
    args = parser.parse_args()

    reader = csv.DictReader(sys.stdin, delimiter=";")
    required = {"kod", "idotartam_honap", "batch_azonosito"}
    if not reader.fieldnames or not required.issubset(reader.fieldnames):
        raise SystemExit("A CSV fejlécéből hiányzik egy kötelező oszlop.")

    stats = {"rows": 0, "matched": 0, "recoverable": 0, "already_archived": 0, "unknown": 0, "metadata_mismatch": 0}
    db = SessionLocal()
    try:
        for row in reader:
            stats["rows"] += 1
            code = "".join(character for character in row["kod"].upper() if character.isalnum())
            item = db.scalar(select(VipActivationCode).where(VipActivationCode.code_digest == vip_code_digest(code)))
            if item is None:
                stats["unknown"] += 1
                continue
            stats["matched"] += 1
            if item.batch_id != row["batch_azonosito"] or item.duration_months != int(row["idotartam_honap"]):
                stats["metadata_mismatch"] += 1
                continue
            archived = decrypt_vip_code(item.code_ciphertext)
            if archived is not None:
                if archived != code:
                    raise SystemExit("Titkosított kódütközés történt; a művelet megszakadt.")
                stats["already_archived"] += 1
                continue
            stats["recoverable"] += 1
            if args.apply:
                item.code_ciphertext = encrypt_vip_code(code)
                db.add(item)
        if stats["metadata_mismatch"] or stats["unknown"]:
            db.rollback()
            raise SystemExit(f"A CSV nem egyezik teljesen az adatbázissal: {stats}")
        if args.apply:
            db.commit()
        else:
            db.rollback()
        print({"mode": "apply" if args.apply else "dry-run", **stats})
    finally:
        db.close()


if __name__ == "__main__":
    main()
