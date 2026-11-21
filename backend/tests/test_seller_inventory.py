"""Inventory imports use the existing listing/checkout, never a second stock ledger."""
import io
import csv
import zipfile
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from app.main import app
from app.db.session import SessionLocal
from app.models.auction import Auction, AuctionImage
from app.models.cart import InventoryReservation, Cart, CartItem
from datetime import datetime, timedelta, timezone
from app.models.seller_inventory import SellerStockSource as Source, SellerStockOperation as Operation, SellerStockLink as Link, SellerHkkCatalogCard as Catalog
from app.services import seller_inventory as service
from app.services.stock_csv import parse_upload, csv_cell
from tests.test_marketplace_cart import user, listing, headers

client = TestClient(app)


@pytest.fixture
def env():
    seller, buyer = user("inventory-seller"), user("inventory-buyer")
    with SessionLocal() as db:
        src = Source(user_id=seller.id, name="Gyűjtemény", mapping={})
        db.add(src); db.commit(); db.refresh(src)
        card_id = str(90000000 + seller.id)
        db.add(Catalog(card_id=card_id, data={"external_card_id": card_id, "card_name": "Teszt lap", "edition": "Kiadás 2026", "image_url": None}))
        db.commit(); db.refresh(src)
        source_id = src.id
    yield seller, buyer, source_id, card_id
    # This module can run inside the full suite without leaving FK-bound test data.
    with SessionLocal() as db:
        db.execute(text("DELETE FROM seller_stock_operations WHERE user_id=:id"), {"id": seller.id})
        db.execute(text("DELETE FROM seller_stock_links WHERE source_id IN (SELECT id FROM seller_stock_sources WHERE user_id=:id)"), {"id": seller.id})
        db.execute(text("DELETE FROM seller_stock_sources WHERE user_id=:id"), {"id": seller.id})
        db.execute(text("DELETE FROM seller_hkk_catalog_cards WHERE card_id=:id"), {"id": card_id})
        db.execute(text("DELETE FROM auction_transactions WHERE seller_id=:id"), {"id": seller.id})
        db.execute(text("DELETE FROM transaction_conversations WHERE seller_id=:id"), {"id": seller.id})
        db.execute(text("DELETE FROM carts WHERE user_id=:id"), {"id": buyer.id})
        db.execute(text("DELETE FROM auctions WHERE seller_id=:id"), {"id": seller.id})
        db.execute(text("DELETE FROM checkout_batches WHERE buyer_id=:id"), {"id": buyer.id})
        db.execute(text("DELETE FROM audit_logs WHERE user_id IN (:seller,:buyer)"), {"seller": seller.id, "buyer": buyer.id})
        db.execute(text("DELETE FROM users WHERE id IN (:seller,:buyer)"), {"seller": seller.id, "buyer": buyer.id})
        db.commit()


def data(card_id, quantity=20, price=150, name="Teszt lap"):
    return f"name;graphic_type;quantity;price;card_id\n{name};normal;{quantity};{price};{card_id}\n".encode()


def preview(env, content=None, **kwargs):
    seller, _, source_id, card_id = env
    with SessionLocal() as db:
        return service.create_preview(db, seller, source_id, content or data(card_id), "import.csv", **kwargs)


def apply(env, op, **kwargs):
    with SessionLocal() as db:
        return service.apply_operation(db, env[0], op["id"], kwargs.pop("selected", None), op["version"], True, **kwargs)


def test_parser_formats_quotes_bom_and_unit_price():
    parsed = parse_upload('\ufeffname;graphic_type;quantity;price;card_id\n"Ár;nyék";FOIL;150;100;12\n'.encode(), "a.csv")
    assert parsed["rows"][0]["values"]["name"] == "Ár;nyék"
    assert parsed["rows"][0]["values"]["quantity"] == 150
    for delimiter in (",", "\t"):
        p = parse_upload(f"name{delimiter}quantity{delimiter}price\nLap{delimiter}20{delimiter}500\n".encode(), "a.csv")
        assert p["rows"][0]["values"]["price"] == 500
    assert csv_cell("=1+1") == "'=1+1"
    assert parse_upload(b"name;quantity;price\n=WEBSERVICE();2;5\n", "a.csv")["rows"][0]["errors"]
    for value in ("NaN", "Infinity", "-1", "1.5", "2147483648"):
        assert parse_upload(f"name;quantity;price\nLap;{value};5\n".encode(), "a.csv")["rows"][0]["errors"]
    with pytest.raises(HTTPException): parse_upload(b"x" * 5_000_001, "a.csv")
    assert parse_upload(b"My name;Qty;HUF\nLap;1;50", "a.csv")["needs_mapping"]
    assert not parse_upload(b"My name;Qty;HUF\nLap;1;50", "a.csv", {"name": "My name", "quantity": "Qty", "price": "HUF"})["needs_mapping"]
    with pytest.raises(HTTPException):
        parse_upload(b"name;quantity;price\nLap;1;50\nLap2;1;50", "a.csv", max_rows=1)


def test_sample_excel_layout_fourth_row_and_mixed_year():
    sheet = '''<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
    <row r="4"><c r="D4" t="inlineStr"><is><t>Kartya neve</t></is></c><c r="E4" t="inlineStr"><is><t>Foil vagy több kiadas eseten kiadas eve</t></is></c><c r="F4" t="inlineStr"><is><t>Darabszam</t></is></c><c r="G4" t="inlineStr"><is><t>Ar per db (HUF)</t></is></c><c r="H4" t="inlineStr"><is><t>Darabszammal felszorzott ar</t></is></c></row>
    <row r="5"><c r="D5" t="inlineStr"><is><t>Őrült lap</t></is></c><c r="E5"><v>2023</v></c><c r="F5"><v>3</v></c><c r="G5"><v>1500</v></c><c r="H5"><f>F5*G5</f><v>4500</v></c></row></sheetData></worksheet>'''
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as z: z.writestr("xl/worksheets/sheet1.xml", sheet)
    parsed = parse_upload(buffer.getvalue(), "Gyujtemeny.xlsx")
    assert parsed["header_row"] == 4 and not parsed["needs_mapping"]
    row = parsed["rows"][0]
    assert row["values"]["price"] == 1500 and row["values"]["quantity"] == 3
    assert row["values"]["edition"] == "2023" and not row["errors"]


def test_upload_is_preview_only_and_repeat_after_sale_does_not_restock(env):
    op = preview(env)
    assert op["counts"]["new"] == 1
    with SessionLocal() as db:
        assert not list(db.scalars(select(Auction).where(Auction.seller_id == env[0].id)))
    applied = apply(env, op); listing_id = applied["rows"][0]["target_id"]
    assert apply(env, op, selected=[0])["counts"]["applied"] == 1
    assert client.post("/api/cart/items", json={"auction_id": listing_id, "quantity": 5}, headers=headers(env[1])).status_code == 201
    bought = client.post("/api/cart/checkout", json={"idempotency_key": uuid4().hex}, headers=headers(env[1]))
    assert bought.status_code == 200, bought.text
    repeated = preview(env)
    assert repeated["counts"]["unchanged"] == 1
    apply(env, repeated)
    with SessionLocal() as db:
        assert db.get(Auction, listing_id).vault_quantity == 15
        assert not service.undo_preview(db, env[0], applied["id"])["can_undo"]
    changed = preview(env, data(env[3], 18))
    assert changed["counts"]["conflict"] == 1
    with SessionLocal() as db:
        confirmed = service.edit_row(db, env[0], changed["id"], 0, {"confirm_stock": True})
    assert confirmed["counts"]["update"] == 1
    apply(env, confirmed)
    with SessionLocal() as db: assert db.get(Auction, listing_id).vault_quantity == 18


def test_large_quantity_partial_and_full_sale_stable_stock_id(env):
    applied = apply(env, preview(env, data(env[3], 150)))
    listing_id = applied["rows"][0]["target_id"]
    for quantity in (20, 130):
        added = client.post("/api/cart/items", json={"auction_id": listing_id, "quantity": quantity}, headers=headers(env[1]))
        assert added.status_code == 201, added.text
        result = client.post("/api/cart/checkout", json={"idempotency_key": uuid4().hex}, headers=headers(env[1]))
        assert result.status_code == 200, result.text
    with SessionLocal() as db:
        a = db.get(Auction, listing_id)
        assert a.vault_quantity == 0 and a.status == "draft"
        assert service.stock_read(db, env[0])["items"][0]["free"] == 0


def test_ambiguous_name_needs_explicit_edition_and_unknown_not_published(env):
    with SessionLocal() as db:
        db.add(Catalog(card_id=env[3]+"1", data={"external_card_id": env[3]+"1", "card_name": "Teszt lap (2025)", "edition": "Másik", "image_url": None})); db.commit()
    try:
        op = preview(env, data(""))
        assert op["counts"]["needs_card"] == 1 and len(op["rows"][0]["candidates"]) == 2
        with pytest.raises(HTTPException): apply(env, op, selected=[0])
        unknown = preview(env, data("", name="Nem létező név"))
        assert unknown["counts"]["needs_card"] == 1
    finally:
        with SessionLocal() as db: db.execute(text("DELETE FROM seller_hkk_catalog_cards WHERE card_id=:id"), {"id": env[3]+"1"}); db.commit()


def test_existing_manual_link_transfer_and_safe_undo(env):
    a = listing(env[0], "Teszt lap", 3)
    with SessionLocal() as db:
        item = db.get(Auction, a.id); item.vault_external_card_id = env[3]; db.commit()
    op = preview(env, data(env[3], 3))
    assert op["counts"]["conflict"] == 1
    with SessionLocal() as db: op = service.edit_row(db, env[0], op["id"], 0, {"target_id": a.id, "confirm_stock": True})
    done = apply(env, op)
    with SessionLocal() as db:
        check = service.undo_preview(db, env[0], done["id"]); assert check["can_undo"]
        service.undo(db, env[0], done["id"], check["token"], True)
        assert db.get(Link, a.id) is None
        assert db.get(Auction, a.id).buy_now_price == 1200


def test_bulk_rounding_export_version_and_stale_preview(env):
    created = apply(env, preview(env)); listing_id = created["rows"][0]["target_id"]
    with SessionLocal() as db:
        bulk = service.bulk_preview(db, env[0], [listing_id], {"price_mode": "percent_down", "price_value": 25, "retro": True})
    assert bulk["rows"][0]["values"]["price"] == 113
    apply(env, bulk)
    with SessionLocal() as db:
        exported = service.export_csv(db, env[0], source_id=env[2], include_inactive=True, include_empty=True)
        read = list(csv.DictReader(io.StringIO(exported.decode("utf-8-sig")), delimiter=";"))[0]
        assert read["price"] == "113" and read["retro"] == "true" and read["version"]
    op = preview(env, exported, full_source=True)
    assert op["context"]["full_allowed"]
    with SessionLocal() as db:
        a = db.get(Auction, listing_id); a.buy_now_price = 114; db.commit()
    stale = apply(env, op)
    assert stale["counts"]["conflict"] == 1


def test_idor_and_different_sources_do_not_duplicate(env):
    applied = apply(env, preview(env)); item_id = applied["rows"][0]["target_id"]
    other = user("inventory-other")
    assert client.get(f"/api/inventory/operations/{applied['id']}", headers=headers(other)).status_code == 404
    assert client.get(f"/api/inventory/export?source_id={env[2]}", headers=headers(other)).status_code == 404
    with SessionLocal() as db:
        src = Source(user_id=env[0].id, name="Másik forrás", mapping={}); db.add(src); db.commit(); db.refresh(src)
        op = service.create_preview(db, env[0], src.id, data(env[3]), "other.csv")
        assert op["counts"]["conflict"] == 1
        with pytest.raises(HTTPException): service.bulk_preview(db, other, [item_id], {})


def test_parallel_import_confirm_cannot_duplicate_stock(env):
    first, second = preview(env), preview(env)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda op: apply(env, op), [first, second]))
    assert sum(op["counts"]["applied"] for op in results) == 1
    assert sum(op["counts"]["conflict"] for op in results) == 1


def test_partial_valid_import_never_inactivates_missing_items(env):
    created = apply(env, preview(env)); item_id = created["rows"][0]["target_id"]
    broken = preview(env, data(env[3], 20) + b"Unknown;normal;-1;50;\n", full_source=True)
    apply(env, broken, selected=[0])
    with SessionLocal() as db:
        op = service.operation_read(service.own_operation(db, env[0], broken["id"]))
        with pytest.raises(HTTPException): service.apply_operation(db, env[0], op["id"], [], op["version"], True, True)
        assert db.get(Auction, item_id).status == "active"


def test_full_reconciliation_requires_explicit_second_confirmation(env):
    created = apply(env, preview(env)); missing_id = created["rows"][0]["target_id"]
    second = listing(env[0], "Másik lap", 2)
    with SessionLocal() as db:
        a = db.get(Auction, second.id); a.vault_external_card_id = env[3]+"2"
        db.add(Catalog(card_id=env[3]+"2", data={"external_card_id": env[3]+"2", "card_name": "Másik lap", "edition": "2026", "image_url": None}))
        db.commit()
    try:
        op = preview(env, data(env[3]+"2", 2, 1200, "Másik lap"), full_source=True)
        with SessionLocal() as db:
            op = service.edit_row(db, env[0], op["id"], 0, {"target_id": second.id})
        done = apply(env, op)
        assert len(done["context"]["missing"]) == 1
        with SessionLocal() as db: assert db.get(Auction, missing_id).status == "active"
        done = apply(env, done, selected=[], confirm_missing=True)
        assert done["context"]["reconciled"]
        with SessionLocal() as db:
            a = db.get(Auction, missing_id); assert a.status == "draft" and a.vault_quantity == 20
    finally:
        with SessionLocal() as db: db.execute(text("DELETE FROM seller_hkk_catalog_cards WHERE card_id=:id"), {"id": env[3]+"2"}); db.commit()


def test_reserved_stock_is_kept_and_prevents_unsafe_undo(env):
    done = apply(env, preview(env)); item_id = done["rows"][0]["target_id"]
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        cart = Cart(user_id=env[1].id); db.add(cart); db.flush()
        item = CartItem(cart_id=cart.id, auction_id=item_id, quantity=3, price_snapshot=150, status="active"); db.add(item); db.flush()
        db.add(InventoryReservation(cart_item_id=item.id, auction_id=item_id, user_id=env[1].id, quantity=3, status="active", starts_at=now, expires_at=now+timedelta(minutes=10)))
        db.commit()
        assert not service.undo_preview(db, env[0], done["id"])["can_undo"]
    changed = preview(env, data(env[3], 18))
    with SessionLocal() as db: changed = service.edit_row(db, env[0], changed["id"], 0, {"confirm_stock": True})
    apply(env, changed)
    with SessionLocal() as db:
        assert db.get(Auction, item_id).vault_quantity == 21
        state = service.stock_read(db, env[0])["items"][0]
        assert state["free"] == 18 and state["reserved"] == 3


def test_partial_export_cannot_be_full_reconciliation_and_variant_mismatch_is_rejected(env):
    done = apply(env, preview(env)); item_id = done["rows"][0]["target_id"]
    with SessionLocal() as db:
        partial = service.export_csv(db, env[0], source_id=env[2], ids=[item_id])
    op = preview(env, partial, full_source=True)
    assert not op["context"]["full_allowed"]
    with SessionLocal() as db:
        changed = service.edit_row(db, env[0], op["id"], 0, {"values": {"graphic_type": "foil"}, "target_id": item_id, "confirm_stock": True})
        assert changed["counts"]["conflict"] == 1


def test_source_transfer_is_explicit_and_new_undo_pauses_instead_of_deleting(env):
    done = apply(env, preview(env)); item_id = done["rows"][0]["target_id"]
    with SessionLocal() as db:
        other = Source(user_id=env[0].id, name="Áthelyezés", mapping={}); db.add(other); db.commit(); db.refresh(other); other_id = other.id
        op = service.create_preview(db, env[0], other_id, data(env[3]), "transfer.csv")
        op = service.edit_row(db, env[0], op["id"], 0, {"target_id": item_id})
        assert op["counts"]["conflict"] == 1
        op = service.edit_row(db, env[0], op["id"], 0, {"target_id": item_id, "confirm_source_transfer": True})
    transfer = apply(env, op)
    with SessionLocal() as db:
        assert db.get(Link, item_id).source_id == other_id
        check = service.undo_preview(db, env[0], transfer["id"])
        service.undo(db, env[0], transfer["id"], check["token"], True)
        assert db.get(Link, item_id).source_id == env[2]
    # The initial import was superseded, even if a later undo restored its values.
    with SessionLocal() as db:
        fresh = service.create_preview(db, env[0], other_id, data(env[3], name="Teszt lap"), "separate.csv")
        fresh = service.edit_row(db, env[0], fresh["id"], 0, {"mode": "separate", "values": {"physical_group": "második doboz"}, "confirm_separate": True})
    result = apply(env, fresh); new_id = result["rows"][0]["target_id"]
    with SessionLocal() as db:
        check = service.undo_preview(db, env[0], result["id"])
        assert check["can_undo"]
        service.undo(db, env[0], result["id"], check["token"], True)
        assert db.get(Auction, new_id).status == "draft"


def test_api_upload_source_mapping_and_explicit_apply(env):
    auth = headers(env[0])
    response = client.post("/api/inventory/preview", headers=auth, data={"source_id": env[2]}, files={"file": ("sample.csv", data(env[3]), "text/csv")})
    assert response.status_code == 200, response.text
    op = response.json()
    assert op["counts"]["new"] == 1
    bad = client.post(f"/api/inventory/operations/{op['id']}/apply", headers=auth, json={"version": op["version"], "confirmed": False})
    assert bad.status_code == 422
    result = client.post(f"/api/inventory/operations/{op['id']}/apply", headers=auth, json={"version": op["version"], "confirmed": True})
    assert result.status_code == 200 and result.json()["counts"]["applied"] == 1
    source_list = client.get("/api/inventory/sources", headers=auth).json()
    original_mapping = next(s["mapping"] for s in source_list if s["id"] == env[2])
    renamed = client.patch(f"/api/inventory/sources/{env[2]}", headers=auth, json={"name": "Átnevezve"})
    assert renamed.status_code == 200 and renamed.json()["mapping"] == original_mapping


def test_edited_complete_export_keeps_manifest_but_filtered_file_does_not(env):
    done = apply(env, preview(env))
    with SessionLocal() as db:
        exported = service.export_csv(db, env[0], source_id=env[2], include_inactive=True, include_empty=True)
    reader = list(csv.DictReader(io.StringIO(exported.decode("utf-8-sig")), delimiter=";"))
    fields = list(reader[0]); reader[0]["price"] = "500"
    buffer = io.StringIO(); writer = csv.DictWriter(buffer, fields, delimiter=";"); writer.writeheader(); writer.writerows(reader)
    edited = preview(env, buffer.getvalue().encode(), full_source=True)
    assert edited["context"]["full_allowed"] and edited["counts"]["update"] == 1
    with SessionLocal() as db:
        # A new member after export makes the old complete manifest stale.
        a = listing(env[0], "Utólag hozzáadott", 1)
        db.add(Link(listing_id=a.id, source_id=env[2], identity=uuid4().hex, last_row={})); db.commit()
    stale = preview(env, buffer.getvalue().encode(), full_source=True)
    assert not stale["context"]["full_allowed"]


def test_lookup_batches_advance_past_ambiguous_names(env, monkeypatch):
    content = b"name;quantity;price\nUnknown A;1;100\nUnknown B;1;100\n"
    op = preview(env, content)
    calls = []
    monkeypatch.setattr(service, "catalog_search", lambda db, query: calls.append(query) or [])
    with SessionLocal() as db:
        service.resolve_batch(db, env[0], op["id"], limit=1)
        service.resolve_batch(db, env[0], op["id"], limit=1)
    assert calls == ["Unknown A", "Unknown B"]


def test_purchase_racing_import_preserves_sold_quantity(env):
    done = apply(env, preview(env)); item_id = done["rows"][0]["target_id"]
    changed = preview(env, data(env[3], 18))
    with SessionLocal() as db:
        changed = service.edit_row(db, env[0], changed["id"], 0, {"confirm_stock": True})
    assert client.post("/api/cart/items", json={"auction_id": item_id, "quantity": 5}, headers=headers(env[1])).status_code == 201
    with ThreadPoolExecutor(max_workers=2) as pool:
        update = pool.submit(apply, env, changed)
        purchase = pool.submit(lambda: client.post("/api/cart/checkout", json={"idempotency_key": uuid4().hex}, headers=headers(env[1])))
        updated, bought = update.result(), purchase.result()
    assert bought.status_code == 200, bought.text
    with SessionLocal() as db:
        quantity = db.get(Auction, item_id).vault_quantity
        assert quantity == (13 if updated["counts"]["applied"] else 15)


def test_nightfall_complete_manifest_can_reconcile_intentionally_removed_rows(env):
    done = apply(env, preview(env)); item_id = done["rows"][0]["target_id"]
    a = listing(env[0], "Második készlet", 2)
    with SessionLocal() as db:
        db.add(Link(listing_id=a.id, source_id=env[2], identity=uuid4().hex, last_row={}))
        db.commit()
        exported = service.export_csv(db, env[0], source_id=env[2], include_inactive=True, include_empty=True)
    rows = list(csv.DictReader(io.StringIO(exported.decode("utf-8-sig")), delimiter=";"))
    kept = next(row for row in rows if row["stock_item_id"] == str(item_id))
    output = io.StringIO(); writer = csv.DictWriter(output, list(kept), delimiter=";"); writer.writeheader(); writer.writerow(kept)
    op = preview(env, output.getvalue().encode(), full_source=True)
    assert op["context"]["full_allowed"] and len(op["context"]["missing"]) == 1
    op = apply(env, op)
    op = apply(env, op, selected=[], confirm_missing=True)
    with SessionLocal() as db:
        assert db.get(Auction, a.id).status == "draft" and db.get(Auction, a.id).vault_quantity == 2


def test_inventory_never_edits_moderated_or_dicemagic_stock(env):
    done = apply(env, preview(env)); item_id = done["rows"][0]["target_id"]
    with SessionLocal() as db:
        a = db.get(Auction, item_id); a.status = "suspended"; db.commit()
        op = service.bulk_preview(db, env[0], [item_id], {"price_mode": "set", "price_value": 500})
    result = apply(env, op)
    assert result["counts"]["conflict"] == 1
    with SessionLocal() as db:
        a = db.get(Auction, item_id)
        assert a.status == "suspended" and a.buy_now_price == 150
        a.shop_source = "dicemagic"; db.commit()
        assert service.stock_read(db, env[0])["items"] == []
        with pytest.raises(HTTPException): service.bulk_preview(db, env[0], [item_id], {"quantity_mode": "set", "quantity_value": 100})


def test_sold_stock_keeps_independent_own_photo_after_source_photo_changes(env):
    from app.services.cart import _sold_snapshot
    from app.storage import storage
    a = listing(env[0], "Saját fotós készlet", 1)
    key = f"auctions/inventory-fixture/{uuid4().hex}.webp"
    storage.save_many_atomic({key: b"fixture-photo"})
    copied_key = None
    try:
        with SessionLocal() as db:
            item = db.get(Auction, a.id); item.stock_managed = True
            db.add(AuctionImage(auction_id=a.id, storage_key=key, original_filename="lap.webp", content_type="image/webp", file_size=13, position=0, is_cover=True)); db.commit()
            sold = _sold_snapshot(db, item, env[1].id, 1); db.commit()
            db.refresh(sold)
            assert len(sold.images) == 1
            copied_key = sold.images[0].storage_key
            assert copied_key != key and storage.read_bytes(copied_key) == b"fixture-photo"
            storage.delete(key)
            assert storage.read_bytes(copied_key) == b"fixture-photo"
    finally:
        storage.delete(key)
        if copied_key: storage.delete(copied_key)


def test_rolled_back_photo_snapshot_leaves_no_copied_media(env):
    from app.services.cart import _sold_snapshot
    from app.storage import storage
    a = listing(env[0], "Fotó rollback", 2)
    key = f"auctions/inventory-fixture/{uuid4().hex}.webp"
    storage.save_many_atomic({key: b"fixture-photo"})
    try:
        with SessionLocal() as db:
            db.add(AuctionImage(auction_id=a.id, storage_key=key, original_filename="lap.webp", content_type="image/webp", file_size=13, position=0, is_cover=True)); db.commit()
            sold = _sold_snapshot(db, db.get(Auction, a.id), env[1].id, 1)
            copy = db.scalar(select(AuctionImage).where(AuctionImage.auction_id == sold.id)).storage_key
            assert storage.exists(copy)
            # Dependency cleanup after a later checkout failure may close rather than commit.
        assert not storage.exists(copy) and storage.exists(key)
    finally:
        storage.delete(key)


def test_historical_sold_source_links_do_not_invalidate_complete_stock_export(env):
    apply(env, preview(env))
    old = listing(env[0], "Régi eladott forrástétel", 1)
    with SessionLocal() as db:
        sold = db.get(Auction, old.id); sold.status = "sold"; sold.winner_id = env[1].id
        db.add(Link(listing_id=old.id, source_id=env[2], identity=uuid4().hex, last_row={}))
        db.commit()
        exported = service.export_csv(db, env[0], source_id=env[2], include_inactive=True, include_empty=True)
    op = preview(env, exported, full_source=True)
    assert op["context"]["full_allowed"]
    assert str(old.id) not in {str(row["values"]["stock_item_id"]) for row in op["rows"]}


def test_partial_import_review_hides_only_applied_rows_and_preserves_original_indices(env):
    content = b"name;quantity;price;card_id\nUnknown first;1;100;\n" + f"Teszt lap;2;150;{env[3]}\n".encode() + b"Unknown last;1;100;\n"
    op = preview(env, content)
    assert op["counts"]["new"] == 1 and op["counts"]["needs_card"] == 2
    done = apply(env, op)
    assert done["counts"]["applied"] == 1
    response = client.get(f"/api/inventory/operations/{op['id']}?pending_only=true", headers=headers(env[0]))
    assert response.status_code == 200
    review = response.json()
    assert review["total"] == 3 and review["visible_total"] == 2
    assert [row["index"] for row in review["rows"]] == [0, 2]
    assert all(row["state"] == "needs_card" for row in review["rows"])
    assert review["version"] == done["version"]
    page = client.get(f"/api/inventory/operations/{op['id']}?pending_only=true&offset=1&limit=1", headers=headers(env[0])).json()
    assert page["rows"][0]["index"] == 2
    with SessionLocal() as db:
        edited = service.edit_row(db, env[0], op["id"], page["rows"][0]["index"], {"skip": True})
        assert edited["rows"][1]["state"] == "applied"
        assert edited["rows"][2]["state"] == "skipped"
    all_rows = client.get(f"/api/inventory/operations/{op['id']}", headers=headers(env[0])).json()
    assert all_rows["visible_total"] == 3 and len(all_rows["rows"]) == 3


def test_simple_upload_does_not_require_source_selection(env):
    response = client.post("/api/inventory/preview", headers=headers(env[0]), files={"file": ("lapok.csv", data(env[3]), "text/csv")})
    assert response.status_code == 200, response.text
    assert response.json()["source_id"] == env[2] and response.json()["counts"]["new"] == 1
    with SessionLocal() as db:
        assert not list(db.scalars(select(Auction).where(Auction.seller_id == env[0].id)))


def test_simple_first_upload_creates_and_reuses_its_source(env):
    with SessionLocal() as db:
        db.delete(db.get(Source, env[2])); db.commit()
    first = client.post("/api/inventory/preview", headers=headers(env[0]), files={"file": ("lapok.csv", data(env[3]), "text/csv")})
    assert first.status_code == 200, first.text
    second = client.post("/api/inventory/preview", headers=headers(env[0]), files={"file": ("uj_nev.csv", data(env[3]), "text/csv")})
    assert second.status_code == 200 and second.json()["source_id"] == first.json()["source_id"]
    with SessionLocal() as db:
        sources = list(db.scalars(select(Source).where(Source.user_id == env[0].id)))
        assert len(sources) == 1 and sources[0].name == "Fájlfeltöltés"


def test_automatic_source_respects_nightfall_source_and_owner(env):
    apply(env, preview(env))
    with SessionLocal() as db:
        exported = service.export_csv(db, env[0], source_id=env[2], include_inactive=True, include_empty=True)
        db.add(Source(user_id=env[0].id, name="Másik", mapping={})); db.commit()
    result = client.post("/api/inventory/preview", headers=headers(env[0]), files={"file": ("nightfall.csv", exported, "text/csv")})
    assert result.status_code == 200 and result.json()["source_id"] == env[2]
    denied = client.post("/api/inventory/preview", headers=headers(env[1]), files={"file": ("nightfall.csv", exported, "text/csv")})
    assert denied.status_code == 404


def test_unverified_names_have_resumable_lookup_progress(env, monkeypatch):
    op = preview(env, b"name;quantity;price\nUnknown A;1;100\nUnknown B;1;100\n")
    assert op["lookup_remaining"] == 2
    monkeypatch.setattr(service, "catalog_search", lambda db, query: [])
    with SessionLocal() as db:
        first = service.resolve_batch(db, env[0], op["id"], limit=1)
        assert first["lookup_remaining"] == 1 and first["counts"]["needs_card"] == 2
        last = service.resolve_batch(db, env[0], op["id"], limit=1)
        assert last["lookup_remaining"] == 0 and last["counts"]["needs_card"] == 2
