import argparse
import json
from pathlib import Path
from typing import Any

from sqlalchemy.dialects.postgresql import insert

from app.db.session import SessionLocal
from app.models.pickup_point import PickupPoint

DEFAULT_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
MOJIBAKE_MARKERS = ("\u00c3", "\u00c2", "\u00c5", "\u0139", "\u0102", "\ufffd")

FIELD_CANDIDATES = {
    "external_id": ("id", "external_id", "point_id", "place_id"),
    "name": ("name", "title", "label"),
    "zip": ("zip", "zipcode", "postal_code", "postcode", "keywords"),
    "postapont_zip": ("keywords", "zip", "zipcode", "postal_code", "postcode"),
    "city": ("city", "settlement", "town"),
    "address": ("addr", "address", "street"),
    "latitude": ("lat", "latitude"),
    "longitude": ("lon", "lng", "longitude"),
    "opening_hours": ("hours", "opening_hours", "open", "opening"),
    "comment": ("comment", "description", "note", "phone"),
}


def detect_carrier(path: Path) -> str:
    filename = path.name.lower()
    if "foxpost" in filename:
        return "foxpost"
    if "postapont" in filename or "posta" in filename:
        return "postapont"
    return path.stem.lower()


def first_existing(record: dict[str, Any], candidates: tuple[str, ...]) -> Any | None:
    normalized_keys = {key.lower(): key for key in record.keys()}
    for candidate in candidates:
        source_key = normalized_keys.get(candidate.lower())
        if source_key is not None:
            value = record.get(source_key)
            if value not in (None, ""):
                return value
    return None


def normalize_text(value: Any) -> str | None:
    if value is None:
        return None
    normalized_value = str(value).strip()
    return normalized_value or None


def normalize_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(str(value).replace(",", "."))
    except ValueError:
        return None


def normalize_opening_hours(value: Any) -> Any | None:
    if value in (None, ""):
        return None
    if isinstance(value, (dict, list)):
        return value
    return str(value).strip()


def contains_mojibake(value: Any) -> bool:
    if isinstance(value, str):
        return any(marker in value for marker in MOJIBAKE_MARKERS)
    if isinstance(value, dict):
        return any(contains_mojibake(item) for item in value.values())
    if isinstance(value, list):
        return any(contains_mojibake(item) for item in value)
    return False


def map_record(carrier: str, record: dict[str, Any], fallback_id: int) -> dict[str, Any]:
    external_id = normalize_text(first_existing(record, FIELD_CANDIDATES["external_id"]))
    name = normalize_text(first_existing(record, FIELD_CANDIDATES["name"]))

    if external_id is None:
        external_id = f"{carrier}-{fallback_id}"
    if name is None:
        name = external_id

    mapped_record = {
        "carrier": carrier,
        "external_id": external_id,
        "name": name,
        "zip": normalize_text(
            first_existing(
                record,
                FIELD_CANDIDATES["postapont_zip"] if carrier == "postapont" else FIELD_CANDIDATES["zip"],
            ),
        ),
        "city": normalize_text(first_existing(record, FIELD_CANDIDATES["city"])),
        "address": normalize_text(first_existing(record, FIELD_CANDIDATES["address"])),
        "latitude": normalize_float(first_existing(record, FIELD_CANDIDATES["latitude"])),
        "longitude": normalize_float(first_existing(record, FIELD_CANDIDATES["longitude"])),
        "opening_hours": normalize_opening_hours(first_existing(record, FIELD_CANDIDATES["opening_hours"])),
        "comment": normalize_text(first_existing(record, FIELD_CANDIDATES["comment"])),
    }

    if contains_mojibake(mapped_record):
        raise ValueError(
            f"Mojibake gyanús adat a(z) {carrier}/{external_id} pontnál. "
            "Ellenőrizd, hogy a JSON valóban UTF-8 kódolású-e.",
        )

    return mapped_record


def load_json_records(path: Path) -> list[dict[str, Any]]:
    raw_data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw_data, list):
        records = raw_data
    elif isinstance(raw_data, dict):
        list_value = next((value for value in raw_data.values() if isinstance(value, list)), None)
        records = list_value if list_value is not None else [raw_data]
    else:
        raise ValueError(f"Nem támogatott JSON gyökér típus: {path.name}")

    return [record for record in records if isinstance(record, dict)]


def import_file(path: Path) -> int:
    carrier = detect_carrier(path)
    records = load_json_records(path)
    mapped_records = [map_record(carrier, record, index) for index, record in enumerate(records, start=1)]

    if not mapped_records:
        return 0

    with SessionLocal() as db:
        statement = insert(PickupPoint).values(mapped_records)
        update_columns = {
            column.name: getattr(statement.excluded, column.name)
            for column in PickupPoint.__table__.columns
            if column.name not in {"id", "created_at"}
        }
        db.execute(
            statement.on_conflict_do_update(
                index_elements=["carrier", "external_id"],
                set_=update_columns,
            ),
        )
        db.commit()

    return len(mapped_records)


def main() -> None:
    parser = argparse.ArgumentParser(description="Foxpost és PostaPont átvételi pontok importálása.")
    parser.add_argument(
        "--data-dir",
        default=str(DEFAULT_DATA_DIR),
        help="A JSON fájlokat tartalmazó mappa.",
    )
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    json_files = sorted(data_dir.glob("*.json"))
    if not json_files:
        raise SystemExit(f"Nincs importálható JSON fájl ebben a mappában: {data_dir}")

    total_count = 0
    for json_file in json_files:
        imported_count = import_file(json_file)
        total_count += imported_count
        print(f"{json_file.name}: {imported_count} átvételi pont importálva.")

    print(f"Összesen {total_count} átvételi pont importálva.")


if __name__ == "__main__":
    main()
