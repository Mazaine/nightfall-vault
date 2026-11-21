"""Bounded CSV/XLSX reader. No formula evaluation, no external references."""
import csv
import io
import re
import unicodedata
import zipfile
from decimal import Decimal, InvalidOperation
from xml.etree import ElementTree as ET
from fastapi import HTTPException

FIELDS = ("stock_item_id", "listing_id", "source_id", "card_id", "name", "edition", "graphic_type", "condition", "quantity", "price", "retro", "status", "version", "physical_group", "variant_edition", "export_id")


def normalize(value):
    return "".join(c for c in unicodedata.normalize("NFKD", str(value)).casefold() if not unicodedata.combining(c)).strip()


def column_key(value):
    return re.sub(r"[^a-z0-9]", "", normalize(value))


ALIASES = {column_key(field): field for field in FIELDS}
ALIASES.update({"kartyaneve": "name", "lapneve": "name", "darabszam": "quantity", "arperdbhuf": "price", "egysegar": "price", "kiegeszito": "edition", "allapot": "condition", "foil vagy tobb kiadas eseten kiadas eve".replace(" ", ""): "variant_edition", "valtozat": "graphic_type"})


def integer(value, *, minimum=0, maximum=2147483647):
    try:
        number = Decimal(str(value).strip().replace("\xa0", "").replace(" ", "").replace(",", "."))
        if not number.is_finite() or number != number.to_integral_value() or not minimum <= number <= maximum:
            raise ValueError()
        return int(number)
    except (InvalidOperation, ValueError):
        raise ValueError(f"Egész szám szükséges ({minimum}–{maximum}).") from None


def _xlsx_rows(data, max_rows=10000):
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if len(entries) > 200 or sum(entry.file_size for entry in entries) > 50_000_000 or any(entry.flag_bits & 1 for entry in entries):
                raise ValueError("Túl nagy vagy titkosított Excel-fájl.")
            def xml(name):
                raw = archive.read(name)
                if b"<!DOCTYPE" in raw or b"<!ENTITY" in raw:
                    raise ValueError("Tiltott XML-tartalom.")
                return ET.fromstring(raw)
            ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
            strings = ["".join(node.itertext()) for node in xml("xl/sharedStrings.xml").findall("s:si", ns)] if "xl/sharedStrings.xml" in archive.namelist() else []
            sheets = sorted(name for name in archive.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", name))
            if len(sheets) != 1:
                raise ValueError("Egy munkalapos fájlt tölts fel; a további lapokat külön forrásként kezeld.")
            rows = []
            for row in xml(sheets[0]).findall("s:sheetData/s:row", ns):
                index = int(row.get("r", len(rows)+1))
                if index > max_rows + 20:
                    raise ValueError(f"Legfeljebb {max_rows} adatsor engedélyezett.")
                while len(rows) < index:
                    rows.append([])
                for cell in row.findall("s:c", ns):
                    letters = re.sub(r"\d", "", cell.get("r", "A1"))
                    column = 0
                    for letter in letters:
                        column = column*26+ord(letter)-64
                    if not 1 <= column <= 128:
                        raise ValueError("Legfeljebb 128 oszlop engedélyezett.")
                    while len(rows[index-1]) < column:
                        rows[index-1].append("")
                    value = cell.find("s:v", ns)
                    text = value.text or "" if value is not None else ""
                    if cell.find("s:f", ns) is not None:
                        text = "=EXCEL_FORMULA"  # Never trust cached formula results for mapped inputs.
                    elif cell.get("t") == "s":
                        text = strings[int(text)]
                    elif cell.get("t") == "inlineStr":
                        text = "".join(cell.find("s:is", ns).itertext())
                    rows[index-1][column-1] = text
            return rows
    except (KeyError, IndexError, AttributeError, OverflowError, zipfile.BadZipFile, ET.ParseError) as exc:
        raise ValueError("Hibás Excel-fájl.") from exc


def parse_upload(data, filename, mapping=None, header_row=None, *, max_bytes=5_000_000, max_rows=10000):
    if not data or len(data) > max_bytes:
        raise HTTPException(413, f"A fájl legfeljebb {max_bytes} bájt lehet, és nem lehet üres.")
    try:
        if filename.lower().endswith(".xlsx"):
            rows = _xlsx_rows(data, max_rows)
            delimiter = "xlsx"
        else:
            text = data.decode("utf-8-sig", errors="strict")
            if "\0" in text:
                raise ValueError("Bináris tartalom nem CSV.")
            try:
                delimiter = csv.Sniffer().sniff(text[:16384], delimiters=";,\t").delimiter
            except csv.Error:
                delimiter = ";"
            rows = list(csv.reader(io.StringIO(text, newline=""), delimiter=delimiter, strict=True))
        if header_row is None:
            candidates = [(sum(column_key(cell) in ALIASES for cell in row), index) for index, row in enumerate(rows[:20])]
            header_index = max(candidates, default=(0, 0), key=lambda item: item[0])[1]
        else:
            header_index = integer(header_row, minimum=1, maximum=20)-1
        headers = [str(cell).strip() for cell in rows[header_index]]
        if len(headers) > 128 or not any(headers) or len([h for h in headers if h]) != len(set(h for h in headers if h)):
            raise ValueError("Hibás vagy ismétlődő fejléc.")
        if mapping:
            if any(field not in FIELDS or column not in headers for field, column in mapping.items()):
                raise ValueError("Ismeretlen oszlopmegfeleltetés.")
            selected = mapping
        else:
            selected = {ALIASES[column_key(header)]: header for header in headers if column_key(header) in ALIASES}
        if not {"name", "quantity", "price"}.issubset(selected):
            return {"headers": headers, "mapping": selected, "header_row": header_index+1, "rows": [], "needs_mapping": True, "format": delimiter}
        positions = {field: headers.index(column) for field, column in selected.items()}
        output = []
        for index, cells in enumerate(rows[header_index+1:], start=header_index+2):
            if not any(str(cell).strip() for cell in cells):
                continue
            if len(cells) > len(headers):
                raise ValueError(f"A(z) {index}. sor túl sok oszlopot tartalmaz.")
            if len(output) >= max_rows:
                raise ValueError(f"Legfeljebb {max_rows} adatsor engedélyezett.")
            values = {field: str(cells[pos]).strip() if pos < len(cells) else "" for field, pos in positions.items()}
            errors = []
            for field in ("name", "edition", "graphic_type", "variant_edition"):
                if values.get(field, "").lstrip().startswith(("=", "+", "@", "\t", "\r")):
                    errors.append(f"{field}: képlet vagy vezérlőkarakter nem importálható.")
            try:
                values["quantity"] = integer(values.get("quantity", ""))
                values["price"] = integer(values.get("price", ""), minimum=1, maximum=999999999)
            except ValueError as exc:
                errors.append(str(exc))
            mixed = normalize(values.get("variant_edition", ""))
            variant = normalize(values.get("graphic_type") or (mixed if mixed in ("foil", "fa", "gfa", "normal") else "normal"))
            if mixed and re.fullmatch(r"\d{4}", mixed) and not values.get("edition"):
                values["edition"] = mixed
            if mixed and not re.fullmatch(r"\d{4}", mixed) and mixed not in ("foil", "fa", "gfa", "normal"):
                errors.append("A vegyes kiadás/változat oszlopot javítani kell.")
            values["graphic_type"] = variant
            if variant not in ("normal", "foil", "fa", "gfa"):
                errors.append("Ismeretlen grafikai változat.")
            if not values.get("name") or len(values["name"]) > 180:
                errors.append("A lapnév kötelező, legfeljebb 180 karakter.")
            values.setdefault("condition", "NM")
            values["condition"] = values["condition"] or "NM"
            if values["condition"] not in ("M", "NM", "EX", "GD", "LP", "PL", "PO", "fresh", "like_new", "played", "damaged", "worn", "misprint"):
                errors.append("Ismeretlen állapot.")
            retro = normalize(values.get("retro", ""))
            if retro and retro not in ("1", "0", "true", "false", "igen", "nem", "retro"):
                errors.append("Hibás retró jelölés.")
            values["retro"] = retro in ("1", "true", "igen", "retro")
            status = normalize(values.get("status", "active")) or "active"
            if status not in ("active", "inactive", "draft"):
                errors.append("A státusz active vagy inactive legyen.")
            values["status"] = "active" if status == "active" else "inactive"
            for field in ("physical_group", "edition"):
                if len(values.get(field, "")) > 120:
                    errors.append(f"{field}: legfeljebb 120 karakter.")
            output.append({"line": index, "values": values, "errors": errors})
        return {"headers": headers, "mapping": selected, "header_row": header_index+1, "rows": output, "needs_mapping": False, "format": "nightfall-v1" if "stock_item_id" in selected else "hkk-piac" if {"graphic_type", "card_id"}.issubset(selected) else delimiter}
    except (UnicodeDecodeError, csv.Error, ValueError, IndexError) as exc:
        raise HTTPException(422, f"A fájl nem dolgozható fel: {exc}") from None


def csv_cell(value):
    text = str(value if value is not None else "")
    return "'"+text if text.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")) else text
