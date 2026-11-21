"""Seller-owned previews and audited changes over the existing Auction stock."""
import csv
import hashlib
import io
import json
import re
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import uuid4
from fastapi import HTTPException
from app.core.config import settings
from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert
from app.models.auction import Auction
from app.models.cart import InventoryReservation
from app.models.seller_inventory import SellerStockSource as Source, SellerStockLink as Link, SellerStockOperation as Operation, SellerHkkCatalogCard as Catalog
from app.models.transaction import AuctionTransaction, AuctionTransactionItem
from app.models.vault import HkkCardVariantAttestation
from app.services.hkk_variants import require_attested_variant
from app.services.moderation_actions import require_no_restriction
from app.services.security_audit import create_domain_audit_log
from app.services.stock_csv import FIELDS, csv_cell, integer, normalize, parse_upload

MAX_QUANTITY = 2147483647
EDIT_FIELDS = ("title", "buy_now_price", "current_price", "bid_increment", "vault_quantity", "hatalom_era", "condition", "status", "stock_managed", "vault_external_card_id", "vault_print_variant", "shop_edition")


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()


def seller(db, user, *, lock=False):
    if not user.is_active or user.deleted_at is not None:
        raise HTTPException(403, "Aktív eladói fiók szükséges.")
    require_no_restriction(db, user.id, "auction_creation_ban")
    if lock:
        db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": f"seller-inventory:{user.id}"})


def source(db, user, source_id):
    result = db.scalar(select(Source).where(Source.id == source_id, Source.user_id == user.id))
    if result is None:
        raise HTTPException(404, "A CSV-forrás nem található.")
    return result


def scope(user):
    return (Auction.seller_id == user.id, Auction.shop_source.is_(None), Auction.listing_type == "fixed", Auction.listing_format == "single", Auction.deleted_at.is_(None))


def owned_listing(db, user, listing_id, *, lock=False):
    query = select(Auction).where(*scope(user), Auction.id == listing_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    result = db.scalar(query)
    if result is None or result.status == "sold":
        raise HTTPException(404, "A saját, módosítható fix áras hirdetés nem található.")
    return result


def reserved_quantity(db, listing_id):
    return int(db.scalar(select(func.coalesce(func.sum(InventoryReservation.quantity), 0)).where(InventoryReservation.auction_id == listing_id, InventoryReservation.status == "active", InventoryReservation.expires_at > datetime.now(timezone.utc))) or 0)


def snapshots(db, auctions):
    ids = [a.id for a in auctions]
    if not ids:
        return {}
    links = {row.listing_id: row for row in db.scalars(select(Link).where(Link.listing_id.in_(ids)))}
    reserved = dict(db.execute(select(InventoryReservation.auction_id, func.sum(InventoryReservation.quantity)).where(InventoryReservation.auction_id.in_(ids), InventoryReservation.status == "active", InventoryReservation.expires_at > datetime.now(timezone.utc)).group_by(InventoryReservation.auction_id)).all())
    sales = {row[0]: list(row[1:]) for row in db.execute(select(AuctionTransactionItem.source_auction_id, func.count(AuctionTransactionItem.id), func.sum(AuctionTransactionItem.quantity), func.max(AuctionTransactionItem.id), func.max(AuctionTransaction.updated_at)).join(AuctionTransaction, AuctionTransaction.id == AuctionTransactionItem.transaction_id).where(AuctionTransactionItem.source_auction_id.in_(ids)).group_by(AuctionTransactionItem.source_auction_id))}
    pending = dict(db.execute(select(AuctionTransactionItem.source_auction_id, func.sum(AuctionTransactionItem.quantity)).join(AuctionTransaction, AuctionTransaction.id == AuctionTransactionItem.transaction_id).where(AuctionTransactionItem.source_auction_id.in_(ids), AuctionTransaction.status == "transaction_open").group_by(AuctionTransactionItem.source_auction_id)).all())
    result = {}
    for a in auctions:
        link = links.get(a.id)
        total = int(a.vault_quantity if a.vault_quantity is not None else 1)
        state = {field: getattr(a, field) for field in EDIT_FIELDS}
        state.update({"id": a.id, "card_id": a.vault_external_card_id, "graphic_type": a.vault_print_variant or "normal", "edition": a.shop_edition or "", "reserved": int(reserved.get(a.id, 0)), "pending": int(pending.get(a.id, 0)), "free": max(0, total-int(reserved.get(a.id, 0))), "sales": sales.get(a.id, []), "updated_at": a.updated_at, "link": {"source_id": link.source_id, "identity": link.identity, "last_row": link.last_row} if link else None})
        result[a.id] = json.loads(json.dumps(state, default=str))
    return result


def stock_read(db, user, *, query="", source_id=None, variant=None, condition=None, edition=None, status=None, retro=None, page=1, page_size=50):
    seller(db, user)
    statement = select(Auction).where(*scope(user), Auction.status != "sold")
    if query:
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        statement = statement.where(Auction.title.ilike(f"%{escaped}%", escape="\\") | (Auction.vault_external_card_id == query))
    if source_id is not None:
        source(db, user, source_id)
        statement = statement.join(Link, Link.listing_id == Auction.id).where(Link.source_id == source_id)
    for value, column in ((variant, Auction.vault_print_variant), (condition, Auction.condition), (edition, Auction.shop_edition)):
        if value:
            statement = statement.where(column == value)
    if status:
        statement = statement.where(Auction.status == ("active" if status == "active" else "draft"))
    if retro is not None:
        statement = statement.where(Auction.hatalom_era == "retro" if retro else (Auction.hatalom_era.is_(None) | (Auction.hatalom_era != "retro")))
    total = db.scalar(select(func.count()).select_from(statement.subquery()))
    auctions = list(db.scalars(statement.order_by(Auction.title, Auction.id).offset((page-1)*page_size).limit(page_size)))
    states = snapshots(db, auctions)
    return {"total": total, "page": page, "limits": {"max_bytes": settings.inventory_csv_max_bytes, "max_rows": settings.inventory_csv_max_rows}, "items": [{**state, "version": digest(state), "price": int(Decimal(state["buy_now_price"] or 0)), "name": state["title"], "retro": state["hatalom_era"] == "retro"} for state in states.values()]}


def catalog_cards(db):
    cards = {row.card_id: row.data for row in db.scalars(select(Catalog))}
    for row in db.scalars(select(HkkCardVariantAttestation)):
        if row.external_card_id.isdigit() and int(row.external_card_id) > 0:
            cards.setdefault(row.external_card_id, {"external_card_id": row.external_card_id, "card_name": row.card_name, "edition": row.edition_name, "image_url": None})
    return cards


def catalog_search(db, query):
    from app.services.vault import search_hkk_cards
    try:
        found = search_hkk_cards(query, 100)
    except HTTPException:
        if not any(normalize(query) in normalize(c["card_name"]) for c in catalog_cards(db).values()):
            raise
        found = []
    for card in found:
        statement = insert(Catalog).values(card_id=card["external_card_id"], data=card).on_conflict_do_update(index_elements=[Catalog.card_id], set_={"data": card})
        db.execute(statement)
    db.commit()
    existing = catalog_cards(db)
    candidates = {card["external_card_id"]: card for card in found}
    for card in existing.values():
        if normalize(query) in normalize(card["card_name"]):
            candidates.setdefault(card["external_card_id"], card)
    return list(candidates.values())[:100]


def base_name(value):
    return normalize(re.sub(r"\s*\(\d{4}\)\s*$", "", value))


def identify(values, cards, name_index=None):
    supplied = str(values.get("card_id") or "").strip()
    if supplied:
        return [cards[supplied]] if supplied in cards and supplied.isdigit() and int(supplied) > 0 else []
    matches = name_index.get(base_name(values["name"]), []) if name_index is not None else [card for card in cards.values() if base_name(card["card_name"]) == base_name(values["name"])]
    hint = values.get("edition", "")
    if hint:
        matches = [card for card in matches if normalize(hint) == normalize(card.get("edition", "")) or (re.fullmatch(r"\d{4}", str(hint)) and str(hint) in card["card_name"])]
    return matches


def row_identity(values):
    return digest([str(values.get("card_id") or normalize(values.get("name", ""))), values.get("graphic_type"), values.get("condition"), values.get("physical_group", "")])


def canonical(values):
    return {field: values.get(field, "") for field in ("card_id", "graphic_type", "condition", "quantity", "price", "retro", "status", "physical_group")}


def own_operation(db, user, operation_id, *, lock=False):
    query = select(Operation).where(Operation.id == operation_id, Operation.user_id == user.id)
    result = db.scalar(query.with_for_update().execution_options(populate_existing=True) if lock else query)
    if result is None:
        raise HTTPException(404, "Az import vagy művelet nem található.")
    return result


def plan_rows(db, user, op):
    auctions = list(db.scalars(select(Auction).where(*scope(user), Auction.status != "sold")))
    states = snapshots(db, auctions)
    cards = catalog_cards(db)
    name_index = {}
    for card in cards.values():
        name_index.setdefault(base_name(card["card_name"]), []).append(card)
    by_id = {a.id: a for a in auctions}
    by_identity = {}
    same_source_index = {}
    for a in auctions:
        key = digest([a.vault_external_card_id, a.vault_print_variant or "normal", a.condition, ""])
        by_identity.setdefault(key, []).append(a)
        link = states[a.id]["link"]
        if link and link["source_id"] == op.source_id:
            same_source_index.setdefault(link["identity"], []).append(a)
    rows = json.loads(json.dumps(op.rows))
    seen = {}
    for row in rows:
        if row.get("state") == "applied":
            continue
        row["issues"] = list(row.get("errors", []))
        row["state"] = "error" if row["issues"] else "valid"
        row.pop("before", None)
        row.pop("desired", None)
        if row.get("skip"):
            row["state"] = "skipped"
            continue
        values = row["values"]
        matches = identify(values, cards, name_index)
        manual_id = values.get("stock_item_id") or values.get("listing_id") or row.get("target_id")
        if not matches and not values.get("card_id") and manual_id:
            manual = by_id.get(int(manual_id)) if str(manual_id).isdigit() else None
            if manual and not manual.vault_external_card_id:
                matches = [{"external_card_id": None, "card_name": manual.title, "edition": manual.shop_edition or ""}]
        row["candidates"] = matches[:20]
        if len(matches) != 1:
            row["issues"].append("Válaszd ki a pontos lapkiadást a lapkeresőből.")
            row["state"] = "needs_card" if not row.get("errors") else "error"
            continue
        card = matches[0]
        values.update({"card_id": card["external_card_id"], "name": card["card_name"], "edition": card.get("edition", "")})
        try:
            if values.get("card_id"):
                require_attested_variant(db, values["card_id"], values["graphic_type"])
        except HTTPException as exc:
            row["issues"].append(str(exc.detail))
        key = row_identity(values)
        if key in seen:
            row["issues"].append("Ismétlődő közös készlet: külön fizikai csoport vagy kihagyás szükséges.")
            seen[key]["issues"].append("Ismétlődő közös készlet a fájlban.")
            seen[key]["state"] = "conflict"
        seen[key] = row
        same_source = same_source_index.get(key, [])
        candidates = by_identity.get(digest([values["card_id"], values["graphic_type"], values["condition"], ""]), [])
        row["existing"] = [{"id": a.id, "title": a.title, "price": states[a.id]["buy_now_price"], "free": states[a.id]["free"], "source_id": (states[a.id]["link"] or {}).get("source_id")} for a in candidates]
        explicit = values.get("stock_item_id") or values.get("listing_id") or row.get("target_id")
        target = None
        try:
            if explicit:
                target_id = integer(explicit, minimum=1)
                target = by_id.get(target_id)
                if target is None:
                    raise ValueError("A megadott saját hirdetés nem elérhető.")
                if target.vault_external_card_id and target.vault_external_card_id != values["card_id"]:
                    raise ValueError("A hirdetés másik HKK-laphoz tartozik.")
                if values.get("retro") and target.category != "Hatalom Kártyái Kártyajáték":
                    raise ValueError("Retró jelölés csak HKK-hirdetésen használható.")
                if (target.vault_print_variant or "normal") != values["graphic_type"] or target.condition != values["condition"]:
                    raise ValueError("A hirdetés eltérő változatot vagy állapotot képvisel; válassz megfelelő készletet.")
            elif len(same_source) == 1:
                target = same_source[0]
            elif candidates and row.get("mode") != "separate":
                raise ValueError("Meglévő hirdetés található: kapcsolás, kihagyás vagy elkülönített készlet szükséges.")
            if row.get("mode") == "separate" and (not values.get("physical_group") or not row.get("confirm_separate")):
                raise ValueError("Külön fizikai készlethez csoportnév és megerősítés szükséges.")
            if target and (target.vault_collection_card_id or target.vault_trade_card_id) and values["quantity"] != states[target.id]["free"]:
                raise ValueError("Vault-készletű hirdetés exportálható, de a mennyisége a Vaultban szerkeszthető.")
            if target:
                before = states[target.id]
                link = before["link"]
                if link and link["source_id"] != op.source_id and not row.get("confirm_source_transfer"):
                    raise ValueError("Másik CSV-forrás: a forrásáthelyezést külön erősítsd meg.")
                last = link["last_row"] if link and link["source_id"] == op.source_id else None
                unchanged = last is not None and canonical(values) == last
                if not unchanged and values.get("version") and values["version"] != digest(before) and not row.get("confirm_version"):
                    raise ValueError("Elavult Nightfall-export. Ellenőrizd és erősítsd meg az aktuális verziót.")
                desired_free = before["free"] if last and values["quantity"] == last.get("quantity") and not row.get("confirm_stock") else values["quantity"]
                if desired_free != before["free"] and not row.get("confirm_stock"):
                    raise ValueError("Készletütközés: erősítsd meg, hogy a CSV mennyisége az aktuális SZABAD készlet.")
                row["before"] = before
                row["target_id"] = target.id
                row["desired_free"] = desired_free
                row["action"] = "unchanged" if unchanged else "update"
            else:
                row["action"] = "new"
                row["desired_free"] = values["quantity"]
                row["target_id"] = None
        except ValueError as exc:
            row["issues"].append(str(exc))
        if row["issues"]:
            row["state"] = "conflict" if not row.get("errors") else "error"
    # Never allow two rows to edit the same physical listing through different IDs/keys.
    targets = {}
    for row in rows:
        target_id = row.get("target_id")
        if target_id and not row.get("skip"):
            if target_id in targets:
                for duplicate in (row, targets[target_id]):
                    if duplicate.get("state") != "applied":
                        duplicate["state"] = "conflict"
                        duplicate["issues"].append("Ugyanazt a hirdetést több sor módosítaná.")
            targets[target_id] = row
    op.rows = rows
    if op.context.get("full_source"):
        membership = list(db.scalars(select(Link.listing_id).join(Auction, Auction.id == Link.listing_id).where(Auction.seller_id == user.id, Link.source_id == op.source_id)))
        op.context = {**op.context, "missing": missing_rows(db, user, op), "source_membership": membership}


def operation_read(op, *, offset=0, limit=100, pending_only=False):
    counts = {key: 0 for key in ("new", "update", "unchanged", "error", "conflict", "needs_card", "skipped", "applied")}
    for row in op.rows:
        key = row.get("action", "error") if row.get("state") == "valid" else row.get("state", "error")
        counts[key] = counts.get(key, 0)+1
    visible = [{**row, "index": index} for index, row in enumerate(op.rows) if not pending_only or row.get("state") != "applied"]
    return {"id": op.id, "kind": op.kind, "status": op.status, "source_id": op.source_id, "created_at": op.created_at, "total": len(op.rows), "visible_total": len(visible), "counts": counts, "context": op.context, "rows": visible[offset:offset+limit], "changes_count": len(op.changes), "version": digest([op.rows, op.status, op.changes, op.context])}


def create_preview(db, user, source_id, data, filename, mapping=None, header_row=None, full_source=False):
    seller(db, user, lock=True)
    src = source(db, user, source_id)
    parsed = parse_upload(data, filename, mapping or None, header_row, max_bytes=settings.inventory_csv_max_bytes, max_rows=settings.inventory_csv_max_rows)
    if parsed["needs_mapping"] and not mapping and src.mapping and set(src.mapping.values()).issubset(set(parsed["headers"])):
        parsed = parse_upload(data, filename, src.mapping, header_row, max_bytes=settings.inventory_csv_max_bytes, max_rows=settings.inventory_csv_max_rows)
    if parsed["needs_mapping"]:
        return parsed
    if not parsed["rows"]:
        raise HTTPException(422, "Üres fájl nem egyeztethető teljes készletként.")
    for row in parsed["rows"]:
        claimed_source = row["values"].get("source_id")
        if claimed_source and str(source_id) != str(claimed_source):
            row["errors"].append("A Nightfall-sor másik CSV-forrást jelöl.")
    fingerprint = digest([row["values"] for row in parsed["rows"]])
    exported = list(db.scalars(select(Operation).where(Operation.user_id == user.id, Operation.kind == "export", Operation.fingerprint == fingerprint)))
    full_allowed = not any(not record.context.get("full_export") or record.source_id != source_id for record in exported)
    if parsed["format"] == "nightfall-v1":
        proofs = {str(row["values"].get("export_id") or "") for row in parsed["rows"]}
        proof = None
        if len(proofs) == 1 and next(iter(proofs)).isdigit():
            proof = db.scalar(select(Operation).where(Operation.id == int(next(iter(proofs))), Operation.user_id == user.id, Operation.kind == "export"))
        if proof is not None:
            file_ids = [str(row["values"].get("stock_item_id") or "") for row in parsed["rows"] if row["values"].get("stock_item_id")]
            manifest = {str(i) for i in proof.context.get("listing_ids", [])}
            current_ids = {str(i) for i in db.scalars(select(Link.listing_id).join(Auction, Auction.id == Link.listing_id).where(*scope(user), Link.source_id == source_id, Auction.status != "sold"))}
            # An edited COMPLETE export may intentionally omit retired rows. A
            # server-filtered export has a distinct, partial export_id and cannot.
            full_allowed = bool(proof.source_id == source_id and proof.context.get("full_export") and len(file_ids) == len(set(file_ids)) and set(file_ids).issubset(manifest) and manifest == current_ids)
        else:
            full_allowed = False  # Old/unverifiable Nightfall exports cannot inactivate missing stock.
    op = Operation(user_id=user.id, source_id=source_id, kind="import", status="preview", fingerprint=fingerprint,
                   rows=parsed["rows"], changes=[], context={"format": parsed["format"], "full_source": full_source, "full_allowed": full_allowed, "headers": parsed["headers"], "mapping": parsed["mapping"], "header_row": parsed["header_row"]})
    db.add(op)
    src.mapping = parsed["mapping"]
    plan_rows(db, user, op)
    db.commit()
    return operation_read(op)


def edit_row(db, user, operation_id, index, changes):
    seller(db, user, lock=True)
    op = own_operation(db, user, operation_id, lock=True)
    if op.kind != "import" or op.status == "undone" or not 0 <= index < len(op.rows):
        raise HTTPException(409, "Ez a sor nem szerkeszthető.")
    rows = json.loads(json.dumps(op.rows))
    row = rows[index]
    if row.get("state") == "applied":
        raise HTTPException(409, "Alkalmazott sor nem írható át.")
    row.update({key: value for key, value in changes.items() if key != "values"})
    values = {**row["values"], **changes.get("values", {})}
    if changes.get("mode") == "separate":
        values["stock_item_id"] = values["listing_id"] = ""
        row["target_id"] = None
    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")
    fields = [field for field in FIELDS if field != "variant_edition"]
    writer.writerow(fields)
    writer.writerow([str(values.get(field, "")).lower() if isinstance(values.get(field), bool) else values.get(field, "") for field in fields])
    checked = parse_upload(output.getvalue().encode(), "edit.csv")["rows"][0]
    row["values"], row["errors"] = checked["values"], checked["errors"]
    row["state"] = "valid"
    op.rows = rows
    plan_rows(db, user, op)
    db.commit()
    return operation_read(op, offset=(index//100)*100)


def resolve_batch(db, user, operation_id, limit=10):
    seller(db, user)
    op = own_operation(db, user, operation_id)
    completed = set(op.context.get("lookup_attempted", []))
    attempted = set()
    for row in op.rows:
        if row.get("state") != "needs_card":
            continue
        name = row["values"]["name"]
        if normalize(name) in completed or name in attempted:
            continue
        if len(attempted) >= limit:
            break
        attempted.add(name)
        catalog_search(db, name)
        completed.add(normalize(name))
    # The external lookup holds no listing locks. Re-read the operation afterwards.
    seller(db, user, lock=True)
    op = own_operation(db, user, operation_id, lock=True)
    op.context = {**op.context, "lookup_attempted": sorted(set(op.context.get("lookup_attempted", [])) | completed)}
    plan_rows(db, user, op)
    db.commit()
    return operation_read(op)


def missing_rows(db, user, op):
    if not op.source_id:
        return []
    represented = {row.get("target_id") for row in op.rows}
    auctions = list(db.scalars(select(Auction).join(Link, Link.listing_id == Auction.id).where(*scope(user), Link.source_id == op.source_id, Auction.status == "active")))
    states = snapshots(db, auctions)
    return [{"id": a.id, "name": a.title, "before": states[a.id]} for a in auctions if a.id not in represented]


def apply_operation(db, user, operation_id, selected, version, confirmed, confirm_missing=False):
    seller(db, user, lock=True)
    op = own_operation(db, user, operation_id, lock=True)
    if not confirmed:
        raise HTTPException(422, "A módosítást külön meg kell erősíteni.")
    if op.status == "undone":
        raise HTTPException(409, "Visszavont művelet nem alkalmazható újra.")
    if selected is None:
        selected = [i for i, row in enumerate(op.rows) if row.get("state") == "valid"][:200]
    selected = sorted(set(selected))
    if (not selected and not (confirm_missing and op.context.get("full_source"))) or len(selected) > 200 or any(i < 0 or i >= len(op.rows) for i in selected):
        raise HTTPException(422, "Válassz érvényes sorokat.")
    if selected and all(op.rows[i].get("state") == "applied" for i in selected) and not confirm_missing:
        return operation_read(op)  # Lost-response retry: no second listing/quantity addition.
    if version != operation_read(op)["version"]:
        raise HTTPException(409, "Az előnézet megváltozott. Töltsd újra.")
    if any(op.rows[i].get("state") not in {"valid", "applied"} for i in selected):
        raise HTTPException(409, "Hibás, kihagyott vagy konfliktusos sor nem alkalmazható.")
    reconcile = bool(op.context.get("full_source"))
    missing = op.context.get("missing", []) if reconcile and confirm_missing and not op.context.get("reconciled") else []
    if reconcile and confirm_missing and (not op.context.get("full_allowed") or any(row.get("state") != "applied" for row in op.rows)):
        raise HTTPException(409, "Teljes egyeztetéshez teljes, hibátlan, egyértelmű import és külön inaktiválási jóváhagyás kell. Részleges importhoz kapcsold ki a teljes egyeztetést.")
    target_ids = {op.rows[i].get("target_id") for i in selected} | {row["id"] for row in missing}
    locked = {a.id: a for a in db.scalars(select(Auction).where(*scope(user), Auction.id.in_([i for i in target_ids if i])).order_by(Auction.id).with_for_update().execution_options(populate_existing=True))}
    current = snapshots(db, list(locked.values()))
    rows = json.loads(json.dumps(op.rows))
    changes = list(op.changes)
    applied = 0
    for index in selected:
        row = rows[index]
        if row.get("state") == "applied":
            continue
        target_id = row.get("target_id")
        if target_id and (target_id not in current or digest(current[target_id]) != digest(row.get("before"))):
            # Keep a conflicting physical stock group unchanged; independent rows can proceed.
            row["state"] = "conflict"
            row["issues"] = ["A készlet vagy az ár az előnézet óta megváltozott."]
            continue
        values = row["values"]
        try:
            with db.begin_nested():
                if values.get("card_id"):
                    require_attested_variant(db, values["card_id"], values["graphic_type"])
                a = locked.get(target_id)
                if a is not None and a.status == "suspended":
                    raise HTTPException(409, "Moderált hirdetés a készletkezelőből nem módosítható.")
                if a is None:
                    if op.kind != "import":
                        raise HTTPException(409, "A hirdetés nem található.")
                    # Recheck identities under the seller advisory lock: another upload may have linked one.
                    conflicts = list(db.scalars(select(Link).join(Auction, Auction.id == Link.listing_id).where(Auction.seller_id == user.id, Link.identity == row_identity(values))))
                    if conflicts:
                        raise HTTPException(409, "Időközben létrejött azonos készlet; készíts új előnézetet.")
                    a = Auction(seller_id=user.id, creation_key=str(uuid4()), listing_type="fixed", listing_format="single", stock_managed=True,
                                title=values["name"], description="HKK-lap az eladó készletéből. Az állapot a hirdetésben jelölve.", category="Hatalom Kártyái Kártyajáték", condition=values["condition"],
                                status="draft", starting_price=0, bid_increment=values["price"], current_price=values["price"], buy_now_enabled=True, buy_now_price=values["price"],
                                starts_at=datetime.now(timezone.utc), ends_at=datetime(9999,12,31,23,59,59,tzinfo=timezone.utc), five_minute_rule_enabled=False,
                                vault_external_card_id=values["card_id"], vault_print_variant=values["graphic_type"], shop_edition=values.get("edition"),
                                seller_declaration_accepted_at=datetime.now(timezone.utc), seller_declaration_version="2026-07-11")
                    db.add(a)
                    db.flush()
                before = current.get(a.id)
                if row.get("action") != "unchanged":
                    free = row.get("desired_free", values["quantity"])
                    reserved = current.get(a.id, {}).get("reserved", 0)
                    if free+reserved > MAX_QUANTITY:
                        raise HTTPException(422, "A teljes készlet túllépi a technikai egészszám-tartományt.")
                    a.vault_quantity = free+reserved
                    a.buy_now_price = a.current_price = a.bid_increment = values["price"]
                    a.hatalom_era = "retro" if values["retro"] else None
                    if values["status"] != "active" and reserved:
                        raise HTTPException(409, "Foglalt készletű hirdetés nem inaktiválható.")
                    if not row.get("preserve_status") or free == 0:
                        a.status = "active" if values["status"] == "active" and free > 0 else "draft"
                    a.stock_managed = not (a.vault_collection_card_id or a.vault_trade_card_id)
                    if op.kind == "import":
                        if not a.vault_external_card_id and values.get("card_id"):
                            a.vault_external_card_id = values["card_id"]
                            a.vault_print_variant = values["graphic_type"]
                            a.shop_edition = values.get("edition")
                        link = db.get(Link, a.id)
                        if link and link.source_id != op.source_id and not row.get("confirm_source_transfer"):
                            raise HTTPException(409, "Forrásáthelyezési megerősítés hiányzik.")
                        if not link:
                            link = Link(listing_id=a.id, source_id=op.source_id, identity=row_identity(values), last_row=canonical(values))
                            db.add(link)
                        else:
                            link.source_id, link.identity, link.last_row = op.source_id, row_identity(values), canonical(values)
                    elif row.get("new_source_id") is not None:
                        source(db, user, row["new_source_id"])
                        link = db.get(Link, a.id)
                        if link:
                            link.source_id = row["new_source_id"]
                        else:
                            db.add(Link(listing_id=a.id, source_id=row["new_source_id"], identity=row_identity(values), last_row=canonical(values)))
                    db.flush()
                    db.refresh(a)
                    after = snapshots(db, [a])[a.id]
                    changes.append({"listing_id": a.id, "before": before, "after": after})
                row["state"], row["target_id"] = "applied", a.id
                applied += 1
        except HTTPException as exc:
            row["state"], row["issues"] = "conflict", [str(exc.detail)]
    # Missing items are never touched if a selected row failed its final checks.
    if reconcile and confirm_missing and all(row.get("state") == "applied" for row in rows):
        current_members = set(db.scalars(select(Link.listing_id).join(Auction, Auction.id == Link.listing_id).where(Auction.seller_id == user.id, Link.source_id == op.source_id)))
        expected_members = set(op.context.get("source_membership", [])) | {change["listing_id"] for change in changes}
        if current_members != expected_members:
            db.rollback()
            raise HTTPException(409, "A CSV-forrás tagsága megváltozott; új teljes előnézet szükséges.")
        for item in missing:
            a = locked.get(item["id"])
            if not a or digest(current[a.id]) != digest(item["before"]) or current[a.id]["reserved"]:
                db.rollback()
                raise HTTPException(409, "A hiányzó készlet az előnézet óta megváltozott; az egyeztetés visszagörgetve.")
            a.status = "draft"
            db.flush()
            db.refresh(a)
            changes.append({"listing_id": a.id, "before": current[a.id], "after": snapshots(db, [a])[a.id]})
        op.context = {**op.context, "reconciled": True}
    op.rows, op.changes = rows, changes
    op.status = "applied" if all(row.get("state") == "applied" for row in rows) else "partial"
    create_domain_audit_log(db, action="seller_inventory_applied", user_id=user.id, metadata={"operation_id": op.id, "source_id": op.source_id, "applied_rows": applied, "kind": op.kind})
    db.commit()
    return operation_read(op)


def bulk_preview(db, user, ids, options):
    seller(db, user, lock=True)
    auctions = [owned_listing(db, user, listing_id) for listing_id in sorted(set(ids))]
    states = snapshots(db, auctions)
    rows = []
    for a in auctions:
        state = states[a.id]
        price = Decimal(state["buy_now_price"] or 0)
        quantity = state["free"]
        errors = []
        if options.get("retro") and a.category != "Hatalom Kártyái Kártyajáték":
            errors.append("Retró jelölés csak HKK-hirdetésen használható.")
        mode = options.get("price_mode")
        amount = Decimal(str(options.get("price_value", 0)))
        if mode == "set": price = amount
        elif mode == "add": price += amount
        elif mode == "subtract": price -= amount
        elif mode == "percent_up": price *= 1+amount/100
        elif mode == "percent_down": price *= 1-amount/100
        price = int(price.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        stock_mode = options.get("quantity_mode")
        value = int(options.get("quantity_value", 0))
        if stock_mode == "set": quantity = value
        elif stock_mode == "add": quantity += value
        elif stock_mode == "subtract": quantity -= value
        if not 1 <= price <= 999999999 or not 0 <= quantity <= MAX_QUANTITY:
            errors.append("Az új ár vagy készlet kívül esik az engedélyezett tartományon.")
        if (a.vault_collection_card_id or a.vault_trade_card_id) and quantity != state["free"]:
            errors.append("Ehhez a tételhez a meglévő hirdetés-/Vault-szerkesztőt használd.")
        values = {"card_id": a.vault_external_card_id, "name": a.title, "edition": a.shop_edition or "", "graphic_type": a.vault_print_variant or "normal", "condition": a.condition,
                  "quantity": quantity, "price": price, "retro": options.get("retro") if options.get("retro") is not None else a.hatalom_era == "retro", "status": options.get("status") or ("active" if a.status == "active" else "inactive")}
        if options.get("source_id") is not None:
            source(db, user, options["source_id"])
        rows.append({"line": len(rows)+1, "values": values, "before": state, "desired_free": quantity, "target_id": a.id, "action": "update", "state": "error" if errors else "valid", "errors": errors, "issues": errors, "new_source_id": options.get("source_id"), "preserve_status": options.get("status") is None})
    op = Operation(user_id=user.id, kind="bulk", status="preview", fingerprint=digest([ids, options]), context={}, rows=rows, changes=[])
    db.add(op)
    db.commit()
    return operation_read(op)


def undo_preview(db, user, operation_id):
    op = own_operation(db, user, operation_id)
    ids = [change["listing_id"] for change in op.changes]
    auctions = list(db.scalars(select(Auction).where(*scope(user), Auction.id.in_(ids))))
    states = snapshots(db, auctions)
    conflicts = [change["listing_id"] for change in op.changes if change["listing_id"] not in states or digest(states[change["listing_id"]]) != digest(change["after"])]
    return {"operation_id": op.id, "can_undo": bool(op.changes) and op.status != "undone" and not conflicts, "conflicts": conflicts, "count": len(op.changes), "token": digest([op.status, op.changes, states])}


def undo(db, user, operation_id, token, confirmed):
    seller(db, user, lock=True)
    op = own_operation(db, user, operation_id, lock=True)
    ids = [change["listing_id"] for change in op.changes]
    auctions = {a.id: a for a in db.scalars(select(Auction).where(*scope(user), Auction.id.in_(ids)).order_by(Auction.id).with_for_update().execution_options(populate_existing=True))}
    preview = undo_preview(db, user, op.id)
    if not confirmed or not preview["can_undo"] or token != preview["token"]:
        raise HTTPException(409, "A visszavonás nem biztonságos, vagy az előnézet elavult.")
    for change in reversed(op.changes):
        a = auctions[change["listing_id"]]
        before = change["before"]
        if before is None:
            a.status = "draft"  # Keep history and stock; never delete an imported listing.
        else:
            for field in EDIT_FIELDS:
                setattr(a, field, before[field])
            link = db.get(Link, a.id)
            old_link = before["link"]
            if old_link:
                if link is None:
                    link = Link(listing_id=a.id)
                    db.add(link)
                link.source_id, link.identity, link.last_row = old_link["source_id"], old_link["identity"], old_link["last_row"]
            elif link:
                db.delete(link)
    op.status = "undone"
    create_domain_audit_log(db, action="seller_inventory_undone", user_id=user.id, metadata={"operation_id": op.id, "count": len(op.changes)})
    db.commit()
    return {"undone": len(op.changes)}


def export_csv(db, user, *, source_id=None, ids=None, format="nightfall", include_inactive=False, include_empty=False):
    seller(db, user)
    statement = select(Auction).where(*scope(user), Auction.status != "sold")
    if source_id is not None:
        source(db, user, source_id)
        statement = statement.join(Link, Link.listing_id == Auction.id).where(Link.source_id == source_id)
    if ids:
        statement = statement.where(Auction.id.in_(ids))
    if not include_inactive:
        statement = statement.where(Auction.status == "active")
    auctions = list(db.scalars(statement.order_by(Auction.id)))
    if ids and set(ids)-set(a.id for a in auctions):
        raise HTTPException(404, "Valamely kijelölt saját tétel nem exportálható a kért szűréssel.")
    states = snapshots(db, auctions)
    fields = ["name", "graphic_type", "quantity", "price", "card_id"] if format == "hkk" else ["stock_item_id", "listing_id", "source_id", "card_id", "name", "edition", "graphic_type", "condition", "quantity", "price", "retro", "status", "version", "physical_group", "export_id"]
    export_record = Operation(user_id=user.id, source_id=source_id, kind="export", status="applied", fingerprint=digest([]), rows=[], changes=[], context={"format": format, "full_export": bool(source_id and not ids and include_inactive and include_empty)})
    db.add(export_record)
    db.flush()
    output = io.StringIO(newline="")
    writer = csv.writer(output, delimiter=";", lineterminator="\r\n")
    writer.writerow(fields)
    values = []
    for a in auctions:
        state = states[a.id]
        if not include_empty and state["free"] == 0:
            continue
        row = {"stock_item_id": a.id, "listing_id": a.id, "source_id": state["link"]["source_id"] if state["link"] else "", "card_id": a.vault_external_card_id or "", "name": a.title, "edition": a.shop_edition or "", "graphic_type": a.vault_print_variant or "normal", "condition": a.condition, "quantity": state["free"], "price": int(a.buy_now_price or 0), "retro": a.hatalom_era == "retro", "status": "active" if a.status == "active" else "inactive", "version": digest(state), "physical_group": ""}
        row["physical_group"] = (state["link"] or {}).get("last_row", {}).get("physical_group", "")
        row["export_id"] = export_record.id
        writer.writerow([csv_cell(str(row[field]).lower() if isinstance(row[field], bool) else row[field]) for field in fields])
        values.append(row)
    data = output.getvalue().encode("utf-8-sig")
    if values:
        parsed = parse_upload(data, "export.csv")
        export_record.fingerprint = digest([row["values"] for row in parsed["rows"]])
    export_record.context = {**export_record.context, "count": len(values), "listing_ids": [row["stock_item_id"] for row in values]}
    db.commit()
    return data
