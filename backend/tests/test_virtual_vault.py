from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import delete, or_, select

from app.db.session import SessionLocal
from app.models.user import User, VipActivationCode
from app.models.auction import Auction, AuctionBundleItem
from app.models.security_log import AuditLog
from app.models.moderation import UserBlock
from app.models.notification import Notification, NotificationOutbox, NotificationPreference
from app.models.vault import HkkCardVariantAttestation, VaultAccount, VaultCapacityGrant, VaultCardLoan, VaultCollectionCard, VaultDeck, VaultDeckCard, VaultFolder, VaultMatchState, VaultPointTransaction, VaultTrade, VaultTradeCard, VaultTradeMessage, VaultTradeReview
from app.services.membership import activate_code, generate_codes
from app.services.vault import grant_capacity, grant_points, sign_card_snapshot
from app.services import vault as vault_service
from app.services import hkk_variants as hkk_variant_service
from test_auction_domain import auction_payload, auth_headers, cleanup_test_data, client, create_test_user, upload_png


def cleanup() -> None:
    db = SessionLocal()
    try:
        test_users = or_(User.email.like("%@vault-test.local"), User.email == "mazaine89@gmail.com")
        user_ids = list(db.scalars(select(User.id).where(test_users)).all())
        for model in (VaultTradeReview, VaultTradeMessage, VaultTrade, VaultMatchState, VaultTradeCard, VaultCardLoan, VaultDeckCard, VaultDeck, VaultCollectionCard, VaultFolder, VaultCapacityGrant, VaultPointTransaction, VaultAccount, VipActivationCode, HkkCardVariantAttestation):
            db.execute(delete(model))
        if user_ids:
            notification_ids = select(Notification.id).where(Notification.user_id.in_(user_ids))
            db.execute(delete(NotificationOutbox).where(NotificationOutbox.notification_id.in_(notification_ids)))
            db.execute(delete(Notification).where(Notification.user_id.in_(user_ids)))
            db.execute(delete(UserBlock).where((UserBlock.blocker_id.in_(user_ids)) | (UserBlock.blocked_id.in_(user_ids))))
            db.execute(delete(AuditLog).where(AuditLog.user_id.in_(user_ids)))
        db.execute(delete(User).where(test_users))
        db.commit()
    finally:
        db.close()


def card_payload(card_id: str = "hkk-1", name: str = "Xenó lárva", quantity: int = 2, rarity: str | None = "rare") -> dict:
    payload = {"external_card_id": card_id, "card_name": name, "image_url": "https://example.test/card.jpg", "edition": "Teszt kiadás", "card_type": "Lény", "subtype": None, "color": None, "rarity": rarity}
    return {**payload, "source_token": sign_card_snapshot(payload), "quantity": quantity}


def edition_cards() -> tuple[dict[str, str], list[dict]]:
    cards = []
    for index in range(1, 4):
        snapshot = {"external_card_id": f"edition-{index}", "card_name": f"Kiegészítő lap {index}", "image_url": None, "edition": "Teszt kiegészítő", "card_type": "Lény", "subtype": None, "color": None, "rarity": "common"}
        cards.append({**snapshot, "source_token": sign_card_snapshot(snapshot)})
    return {"id": "220", "name": "Teszt kiegészítő"}, cards


def test_full_edition_import_quantities_missing_only_idempotence_and_zero_persistence(monkeypatch) -> None:
    cleanup(); user = create_test_user("edition@vault-test.local")
    monkeypatch.setattr(vault_service, "hkk_edition_cards", lambda edition_id: edition_cards())
    try:
        folder = client.post("/api/vault/folders", json={"name": "Kiegészítő", "capacity": 10}, headers=auth_headers(user)).json()
        imported = client.post("/api/vault/hkk/editions/import", json={"edition_id": "220", "folder_id": folder["id"], "quantity": 1, "missing_only": False}, headers=auth_headers(user))
        assert imported.status_code == 200 and imported.json()["added_cards"] == 3
        cards = client.get("/api/vault/cards", headers=auth_headers(user)).json()
        assert len(cards) == 3 and {card["quantity"] for card in cards} == {1}

        repeated = client.post("/api/vault/hkk/editions/import", json={"edition_id": "220", "folder_id": folder["id"], "quantity": 2, "missing_only": False}, headers=auth_headers(user))
        assert repeated.status_code == 200 and repeated.json()["added_cards"] == 0 and repeated.json()["updated_cards"] == 3
        cards = client.get("/api/vault/cards", headers=auth_headers(user)).json()
        assert len(cards) == 3 and {card["quantity"] for card in cards} == {2}

        assert client.patch(f"/api/vault/cards/{cards[0]['id']}", json={"quantity": 1}, headers=auth_headers(user)).status_code == 200
        assert client.patch(f"/api/vault/cards/{cards[1]['id']}", json={"quantity": 3}, headers=auth_headers(user)).status_code == 200
        zeroed = client.patch(f"/api/vault/cards/{cards[2]['id']}", json={"quantity": 0}, headers=auth_headers(user))
        assert zeroed.status_code == 200 and zeroed.json()["quantity"] == 0
        assert len(client.get("/api/vault/cards", headers=auth_headers(user)).json()) == 3
        missing = client.post("/api/vault/hkk/editions/import", json={"edition_id": "220", "folder_id": folder["id"], "quantity": 1, "missing_only": True}, headers=auth_headers(user))
        assert missing.status_code == 200 and missing.json()["added_cards"] == 0 and missing.json()["updated_cards"] == 1 and missing.json()["skipped_cards"] == 2
        quantities = {card["external_card_id"]: card["quantity"] for card in client.get("/api/vault/cards", headers=auth_headers(user)).json()}
        assert quantities == {"edition-1": 1, "edition-2": 3, "edition-3": 1}
    finally:
        cleanup()


def test_edition_import_is_atomic_on_capacity_shortage(monkeypatch) -> None:
    cleanup(); user = create_test_user("capacity@vault-test.local")
    monkeypatch.setattr(vault_service, "hkk_edition_cards", lambda edition_id: edition_cards())
    try:
        folder = client.post("/api/vault/folders", json={"name": "Kicsi", "capacity": 2}, headers=auth_headers(user)).json()
        response = client.post("/api/vault/hkk/editions/import", json={"edition_id": "220", "folder_id": folder["id"], "quantity": 2, "missing_only": False}, headers=auth_headers(user))
        assert response.status_code == 409
        assert response.json()["detail"] == "3 új zseb szükséges, 2 szabad."
        assert client.get("/api/vault/cards", headers=auth_headers(user)).json() == []
    finally:
        cleanup()


def test_edition_import_can_filter_by_rarity(monkeypatch) -> None:
    cleanup(); user = create_test_user("rarity-import@vault-test.local")
    edition, cards = edition_cards()
    rarities = ["common", "uncommun", "rare", "ultrarare"]
    filtered_cards = [{**card, "external_card_id": f"rarity-{index}", "rarity": rarity} for index, (card, rarity) in enumerate(zip([cards[0], cards[1], cards[2], cards[0]], rarities), start=1)]
    filtered_cards = [{**card, "source_token": sign_card_snapshot({key: value for key, value in card.items() if key != "source_token"})} for card in filtered_cards]
    monkeypatch.setattr(vault_service, "hkk_edition_cards", lambda edition_id: (edition, filtered_cards))
    try:
        folder = client.post("/api/vault/folders", json={"name": "UR lapok", "capacity": 2}, headers=auth_headers(user)).json()
        response = client.post("/api/vault/hkk/editions/import", json={"edition_id": "220", "folder_id": folder["id"], "quantity": 2, "missing_only": False, "rarities": ["ultrarare"]}, headers=auth_headers(user))
        assert response.status_code == 200
        assert response.json()["total_cards"] == 1 and response.json()["added_cards"] == 1
        imported = client.get("/api/vault/cards", headers=auth_headers(user)).json()
        assert len(imported) == 1 and imported[0]["rarity"] == "ultrarare" and imported[0]["quantity"] == 2
    finally:
        cleanup()


def test_edition_search_works_without_query_and_filters_with_query(monkeypatch) -> None:
    cleanup(); user = create_test_user("edition-search@vault-test.local")
    monkeypatch.setattr("app.api.vault.hkk_edition_cards", lambda edition_id: edition_cards())
    try:
        all_cards = client.get("/api/vault/hkk/search?edition_id=220", headers=auth_headers(user))
        assert all_cards.status_code == 200 and len(all_cards.json()) == 3
        filtered = client.get("/api/vault/hkk/search?edition_id=220&q=lap%202", headers=auth_headers(user))
        assert filtered.status_code == 200 and [card["external_card_id"] for card in filtered.json()] == ["edition-2"]
        assert client.get("/api/vault/hkk/search", headers=auth_headers(user)).status_code == 422
    finally:
        cleanup()


def test_search_result_can_be_wanted_without_an_owned_copy() -> None:
    cleanup(); user = create_test_user("wanted-zero@vault-test.local")
    try:
        folder = client.post("/api/vault/folders", json={"name": "Keresett lapok", "capacity": 3}, headers=auth_headers(user)).json()
        payload = card_payload("wanted-zero", "Orkling bűzisten", 1)
        payload.pop("quantity")

        created = client.post("/api/vault/cards/wanted", json={**payload, "folder_id": folder["id"]}, headers=auth_headers(user))
        assert created.status_code == 201
        assert created.json()["quantity"] == 0
        assert created.json()["wanted"] is True
        assert created.json()["wanted_quantity"] == 3

        repeated = client.post("/api/vault/cards/wanted", json={**payload, "folder_id": folder["id"]}, headers=auth_headers(user))
        assert repeated.status_code == 201 and repeated.json()["id"] == created.json()["id"]
        assert len(client.get("/api/vault/cards", headers=auth_headers(user)).json()) == 1

        trader = create_test_user("wanted-trader@vault-test.local")
        offered = client.post("/api/vault/trade", json={**payload, "quantity": 1}, headers=auth_headers(trader))
        assert offered.status_code == 201
        matches = client.get("/api/vault/matches", headers=auth_headers(user)).json()
        assert matches[0]["id"] == created.json()["id"] and matches[0]["offer_count"] == 1

        removed = client.put(f"/api/vault/cards/{created.json()['id']}/wanted", json={"wanted": False}, headers=auth_headers(user))
        assert removed.status_code == 204
        assert client.get("/api/vault/cards", headers=auth_headers(user)).json() == []

        owned = client.post("/api/vault/cards", json={**card_payload("wanted-owned", "Meglévő lap", 1), "folder_id": folder["id"]}, headers=auth_headers(user)).json()
        owned_payload = card_payload("wanted-owned", "Meglévő lap", 1)
        owned_payload.pop("quantity")
        marked = client.post("/api/vault/cards/wanted", json={**owned_payload, "folder_id": folder["id"]}, headers=auth_headers(user))
        assert marked.status_code == 201 and marked.json()["id"] == owned["id"]
        assert marked.json()["quantity"] == 1 and marked.json()["wanted_quantity"] == 2

        full = client.post("/api/vault/cards", json={**card_payload("wanted-full", "Teljes playset", 3), "folder_id": folder["id"]}, headers=auth_headers(user)).json()
        full_payload = card_payload("wanted-full", "Teljes playset", 1)
        full_payload.pop("quantity")
        denied = client.post("/api/vault/cards/wanted", json={**full_payload, "folder_id": folder["id"]}, headers=auth_headers(user))
        assert denied.status_code == 409
        assert full["quantity"] == 3
    finally:
        cleanup()


def test_explicit_owner_entitlement_is_unlimited_but_other_admin_is_not(monkeypatch) -> None:
    cleanup(); owner = create_test_user("mazaine89@gmail.com"); admin = create_test_user("other-admin@vault-test.local", role="admin")
    monkeypatch.setattr(vault_service, "hkk_edition_cards", lambda edition_id: edition_cards())
    db = SessionLocal()
    try:
        owner_account = VaultAccount(user_id=owner.id, base_collection_capacity=1000, trade_capacity=0, vault_unlimited=True)
        db.add(owner_account); db.commit()
        assert grant_capacity(db, owner.id, 100, "VIP_ACTIVATION", "owner-vip") is True
        db.commit()
        owner_folder = client.post("/api/vault/folders", json={"name": "Korlátlan", "capacity": 0}, headers=auth_headers(owner)).json()
        imported = client.post("/api/vault/hkk/editions/import", json={"edition_id": "220", "folder_id": owner_folder["id"], "quantity": 3, "missing_only": False}, headers=auth_headers(owner))
        assert imported.status_code == 200 and imported.json()["added_cards"] == 3
        owner_summary = client.get("/api/vault/summary", headers=auth_headers(owner)).json()
        assert owner_summary["vault_unlimited"] is True
        assert owner_summary["total_collection_capacity"] == 1100
        assert client.post("/api/vault/points/buy-capacity", headers=auth_headers(owner)).status_code == 409
        assert client.post("/api/vault/trade", json=card_payload("owner-trade", "Owner cserelap", 1), headers=auth_headers(owner)).status_code == 201

        admin_folder = client.post("/api/vault/folders", json={"name": "Admin", "capacity": 0}, headers=auth_headers(admin)).json()
        denied = client.post("/api/vault/hkk/editions/import", json={"edition_id": "220", "folder_id": admin_folder["id"], "quantity": 1, "missing_only": False}, headers=auth_headers(admin))
        assert denied.status_code == 409
        admin_summary = client.get("/api/vault/summary", headers=auth_headers(admin)).json()
        assert admin_summary["vault_unlimited"] is False
        assert admin_summary["total_collection_capacity"] == 1000 and admin_summary["trade_capacity"] == 200
    finally:
        db.close(); cleanup()


def test_base_capacities_folder_limits_playset_move_and_idor() -> None:
    cleanup(); owner = create_test_user("owner@vault-test.local"); stranger = create_test_user("stranger@vault-test.local")
    try:
        summary = client.get("/api/vault/summary", headers=auth_headers(owner))
        assert summary.status_code == 200
        assert summary.json()["total_collection_capacity"] == 1000
        assert summary.json()["trade_capacity"] == 200
        xen = client.post("/api/vault/folders", json={"name": "Xenó", "capacity": 2}, headers=auth_headers(owner)).json()
        other = client.post("/api/vault/folders", json={"name": "Paklialapok", "capacity": 10}, headers=auth_headers(owner)).json()
        too_much = client.post("/api/vault/folders", json={"name": "Túl nagy", "capacity": 989}, headers=auth_headers(owner))
        assert too_much.status_code == 409
        created = client.post("/api/vault/cards", json={**card_payload(), "folder_id": xen["id"]}, headers=auth_headers(owner))
        assert created.status_code == 201 and created.json()["quantity"] == 2 and created.json()["print_variant"] == "normal"
        duplicate = client.post("/api/vault/cards", json={**card_payload(quantity=3), "folder_id": xen["id"]}, headers=auth_headers(owner))
        assert duplicate.status_code == 201 and duplicate.json()["id"] == created.json()["id"] and duplicate.json()["quantity"] == 5
        nine = client.post("/api/vault/cards", json={**card_payload(quantity=4), "folder_id": xen["id"]}, headers=auth_headers(owner))
        assert nine.status_code == 201 and nine.json()["quantity"] == 9
        overflow = client.post("/api/vault/cards", json={**card_payload(quantity=1), "folder_id": xen["id"]}, headers=auth_headers(owner))
        assert overflow.status_code == 409
        assert client.post("/api/vault/cards", json={**card_payload("bad", "Hibás", 10), "folder_id": xen["id"]}, headers=auth_headers(owner)).status_code == 422
        moved = client.patch(f"/api/vault/cards/{created.json()['id']}", json={"folder_id": other["id"], "quantity": 2}, headers=auth_headers(owner))
        assert moved.status_code == 200 and moved.json()["folder_id"] == other["id"]
        foil = client.patch(f"/api/vault/cards/{created.json()['id']}", json={"print_variant": "foil"}, headers=auth_headers(owner))
        assert foil.status_code == 200 and foil.json()["print_variant"] == "foil"
        assert client.patch(f"/api/vault/cards/{created.json()['id']}", json={"print_variant": "etched"}, headers=auth_headers(owner)).status_code == 422
        wanted = client.put(f"/api/vault/cards/{created.json()['id']}/wanted", json={"wanted": True, "quantity": 1}, headers=auth_headers(owner))
        assert wanted.status_code == 200 and wanted.json()["wanted_quantity"] == 1
        zeroed = client.patch(f"/api/vault/cards/{created.json()['id']}", json={"quantity": 0}, headers=auth_headers(owner))
        assert zeroed.status_code == 200 and zeroed.json()["folder_id"] == other["id"] and zeroed.json()["quantity"] == 0
        assert client.patch(f"/api/vault/cards/{created.json()['id']}", json={"quantity": 1}, headers=auth_headers(stranger)).status_code == 404
        assert client.patch(f"/api/vault/folders/{other['id']}", json={"capacity": 20}, headers=auth_headers(stranger)).status_code == 404
        own_summary = client.get("/api/vault/summary", headers=auth_headers(stranger)).json()
        assert own_summary["folders"] == []
        assert client.patch(f"/api/vault/folders/{other['id']}", json={"capacity": 0}, headers=auth_headers(owner)).status_code == 409
        assert client.delete(f"/api/vault/folders/{other['id']}", headers=auth_headers(owner)).status_code == 409
        destination = client.post("/api/vault/folders", json={"name": "Archívum", "capacity": 5}, headers=auth_headers(owner)).json()
        assert client.delete(f"/api/vault/folders/{xen['id']}", headers=auth_headers(owner)).status_code == 204
        moved_delete = client.delete(f"/api/vault/folders/{other['id']}?move_to_folder_id={destination['id']}", headers=auth_headers(owner))
        assert moved_delete.status_code == 204
        remaining = client.get("/api/vault/cards", headers=auth_headers(owner)).json()
        assert len(remaining) == 1 and remaining[0]["folder_id"] == destination["id"] and remaining[0]["quantity"] == 0
        destination_after = next(folder for folder in client.get("/api/vault/summary", headers=auth_headers(owner)).json()["folders"] if folder["id"] == destination["id"])
        assert destination_after["capacity"] == 15 and destination_after["used_slots"] == 1
    finally:
        cleanup()


def test_variants_share_one_nine_copy_pocket_and_one_folder_slot() -> None:
    cleanup(); user = create_test_user("variant-pocket@vault-test.local")
    try:
        folder = client.post("/api/vault/folders", json={"name": "Egy zseb", "capacity": 1}, headers=auth_headers(user)).json()
        normal = client.post("/api/vault/cards", json={**card_payload("shared-pocket", "Közös zseb", 6), "folder_id": folder["id"]}, headers=auth_headers(user))
        assert normal.status_code == 201
        foil = client.post(
            f"/api/vault/cards/{normal.json()['id']}/variants",
            json={"print_variant": "foil", "quantity": 3},
            headers=auth_headers(user),
        )
        assert foil.status_code == 201
        summary = client.get("/api/vault/summary", headers=auth_headers(user)).json()
        assert summary["folders"][0]["used_slots"] == 1
        rejected = client.post(
            f"/api/vault/cards/{normal.json()['id']}/variants",
            json={"print_variant": "fa", "quantity": 1},
            headers=auth_headers(user),
        )
        assert rejected.status_code == 409
        assert "együtt legfeljebb 9" in rejected.json()["detail"]
        assert len(client.get("/api/vault/cards", headers=auth_headers(user)).json()) == 2
    finally:
        cleanup()


def test_individual_add_increments_existing_variant_while_edit_sets_absolute_quantity() -> None:
    cleanup(); user = create_test_user("increment-variant@vault-test.local")
    try:
        headers = auth_headers(user)
        folder = client.post("/api/vault/folders", json={"name": "Hagarr", "capacity": 2}, headers=headers).json()
        first = client.post("/api/vault/cards", json={**card_payload("hagarr", "Hagarr", 1), "folder_id": folder["id"], "print_variant": "normal"}, headers=headers)
        assert first.status_code == 201 and first.json()["quantity"] == 1
        second_normal = client.post("/api/vault/cards", json={**card_payload("hagarr", "Hagarr", 1), "folder_id": folder["id"], "print_variant": "normal"}, headers=headers)
        foil = client.post("/api/vault/cards", json={**card_payload("hagarr", "Hagarr", 1), "folder_id": folder["id"], "print_variant": "foil"}, headers=headers)
        assert second_normal.status_code == 201 and second_normal.json()["quantity"] == 2
        assert foil.status_code == 201 and foil.json()["quantity"] == 1

        edited = client.patch(f"/api/vault/cards/{first.json()['id']}", json={"quantity": 1}, headers=headers)
        assert edited.status_code == 200 and edited.json()["quantity"] == 1
        quantities = {(item["print_variant"], item["quantity"]) for item in client.get("/api/vault/cards", headers=headers).json()}
        assert quantities == {("normal", 1), ("foil", 1)}
    finally:
        cleanup()


def test_fixed_price_vault_listing_reserves_and_deducts_only_after_completion() -> None:
    cleanup_test_data(); cleanup()
    seller = create_test_user("listing-seller@vault-test.local")
    buyer = create_test_user("listing-buyer@vault-test.local")
    try:
        folder = client.post("/api/vault/folders", json={"name": "Eladó", "capacity": 2}, headers=auth_headers(seller)).json()
        card = client.post("/api/vault/cards", json={**card_payload("sale-card", "Eladó lap", 2), "folder_id": folder["id"]}, headers=auth_headers(seller)).json()
        payload = auction_payload(
            title="Eladó lap",
            description="Vaultból indított fix áras teszthirdetés.",
            category="Hatalom Kártyái Kártyajáték",
            listing_type="fixed",
            vault_collection_card_id=card["id"],
            vault_quantity=1,
            starting_price="0",
            bid_increment="1000",
            buy_now_enabled=True,
            buy_now_price="1000",
            five_minute_rule_enabled=False,
            starts_at=(datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat(),
        )
        created = client.post("/api/auctions", json=payload, headers=auth_headers(seller))
        assert created.status_code == 201 and created.json()["listing_type"] == "fixed"
        blocked = client.patch(f"/api/vault/cards/{card['id']}", json={"quantity": 0}, headers=auth_headers(seller))
        assert blocked.status_code == 409
        activated = client.post(f"/api/auctions/{created.json()['id']}/activate", headers=auth_headers(seller))
        assert activated.status_code == 200, activated.text
        listed_card = client.get("/api/vault/cards", headers=auth_headers(seller)).json()[0]
        assert listed_card["quantity"] == 2
        assert listed_card["listed_quantity"] == 1
        assert listed_card["loaned_quantity"] == 0
        assert listed_card["available_listing_quantity"] == 1
        fixed_market = client.get("/api/auctions?listing_type=fixed&q=sale-card").json()
        auction_market = client.get("/api/auctions?listing_type=auction&q=sale-card").json()
        assert fixed_market["total"] == 1 and fixed_market["items"][0]["id"] == created.json()["id"]
        assert auction_market["total"] == 0
        bought = client.post(f"/api/auctions/{created.json()['id']}/bids", json={"amount": "1000"}, headers=auth_headers(buyer))
        assert bought.status_code == 201 and bought.json()["reaches_buy_now"] is True
        transaction = client.get("/api/transactions", headers=auth_headers(seller)).json()["items"][0]
        assert client.post(f"/api/transactions/{transaction['id']}/confirm-completion", headers=auth_headers(seller)).status_code == 200
        assert client.get("/api/vault/cards", headers=auth_headers(seller)).json()[0]["quantity"] == 2
        assert client.post(f"/api/transactions/{transaction['id']}/confirm-completion", headers=auth_headers(buyer)).status_code == 200
        assert client.get("/api/vault/cards", headers=auth_headers(seller)).json()[0]["quantity"] == 1
    finally:
        cleanup_test_data(); cleanup()


def test_atomic_batch_and_bundle_listings_are_idempotent_searchable_and_deduct_on_completion() -> None:
    cleanup_test_data(); cleanup()
    seller = create_test_user("batch-seller@vault-test.local")
    buyer = create_test_user("batch-buyer@vault-test.local")
    headers = auth_headers(seller)
    try:
        folder = client.post("/api/vault/folders", json={"name": "Köteg", "capacity": 6}, headers=headers).json()
        cards = [client.post("/api/vault/cards", json={**card_payload(f"batch-{index}", f"Köteglap {index}", 3), "folder_id": folder["id"]}, headers=headers).json() for index in range(1, 4)]
        buyer_folder = client.post("/api/vault/folders", json={"name": "Másé", "capacity": 1}, headers=auth_headers(buyer)).json()
        buyer_card = client.post("/api/vault/cards", json={**card_payload("foreign-batch", "Más tulajdona", 1), "folder_id": buyer_folder["id"]}, headers=auth_headers(buyer)).json()
        key = str(uuid4())
        items = [{"vault_collection_card_id": card["id"], "quantity": 1, "base_price": 500 * index, "final_price": 400 * index, "condition": "NM", "description": f"Köteglap {index} részletes állapotleírása."} for index, card in enumerate(cards, start=1)]
        individual = {"creation_key": key, "mode": "individual", "discount_percent": 20, "items": items}
        one_item_bundle = client.post("/api/auctions/batch-fixed", json={"creation_key": str(uuid4()), "mode": "bundle", "discount_percent": 0, "bundle_name": "Túl kicsi csomag", "bundle_description": "Legalább két lap kellene ebbe a csomagba.", "bundle_price": 500, "items": items[:1]}, headers=headers)
        assert one_item_bundle.status_code == 422
        forbidden = client.post("/api/auctions/batch-fixed", json={**individual, "creation_key": str(uuid4()), "items": [{**items[0], "vault_collection_card_id": buyer_card["id"]}]}, headers=headers)
        assert forbidden.status_code == 409
        created = client.post("/api/auctions/batch-fixed", json=individual, headers=headers)
        repeated = client.post("/api/auctions/batch-fixed", json=individual, headers=headers)
        assert created.status_code == 201 and len(created.json()["auctions"]) == 3
        assert [item["id"] for item in repeated.json()["auctions"]] == [item["id"] for item in created.json()["auctions"]]

        bad = client.post("/api/auctions/batch-fixed", json={**individual, "creation_key": str(uuid4()), "items": [items[0], {**items[1], "quantity": 9}]}, headers=headers)
        assert bad.status_code == 409
        with SessionLocal() as db:
            assert db.query(Auction).filter(Auction.seller_id == seller.id).count() == 3

        assert all(client.post(f"/api/auctions/{item['id']}/cancel", headers=headers).status_code == 200 for item in created.json()["auctions"])
        bundle_payload = {"creation_key": str(uuid4()), "mode": "bundle", "discount_percent": 10, "bundle_name": "Háromlapos tesztcsomag", "bundle_description": "Három különböző HKK-lap egyetlen csomaghirdetésben.", "bundle_price": 2400, "items": items}
        bundle = client.post("/api/auctions/batch-fixed", json=bundle_payload, headers=headers)
        assert bundle.status_code == 201, bundle.text
        auction = bundle.json()["auctions"][0]
        assert auction["listing_format"] == "bundle" and len(auction["bundle_items"]) == 3
        found = client.get("/api/auctions?listing_type=fixed&listing_format=bundle&q=batch-2").json()
        assert found["total"] == 1 and found["items"][0]["id"] == auction["id"]

        bought = client.post(f"/api/auctions/{auction['id']}/bids", json={"amount": "2400"}, headers=auth_headers(buyer))
        assert bought.status_code == 201
        transaction = client.get("/api/transactions", headers=headers).json()["items"][0]
        assert client.post(f"/api/transactions/{transaction['id']}/confirm-completion", headers=headers).status_code == 200
        assert client.post(f"/api/transactions/{transaction['id']}/confirm-completion", headers=auth_headers(buyer)).status_code == 200
        quantities = {item["external_card_id"]: item["quantity"] for item in client.get("/api/vault/cards", headers=headers).json()}
        assert quantities == {"batch-1": 2, "batch-2": 2, "batch-3": 2}
        with SessionLocal() as db:
            assert db.query(AuctionBundleItem).filter(AuctionBundleItem.auction_id == auction["id"]).count() == 3
    finally:
        cleanup_test_data(); cleanup()


def test_trade_backed_batch_listing_uses_full_trade_quantity_and_closes_inventory_safely() -> None:
    cleanup_test_data(); cleanup()
    seller = create_test_user("trade-listing-seller@vault-test.local")
    buyer = create_test_user("trade-listing-buyer@vault-test.local")
    headers = auth_headers(seller)
    try:
        trade = client.post("/api/vault/trade", json=card_payload("trade-sale", "Cseremappa eladó lap", 3), headers=headers)
        assert trade.status_code == 201, trade.text
        trade_card = trade.json()
        payload = {
            "creation_key": str(uuid4()),
            "mode": "individual",
            "discount_percent": 0,
            "items": [{
                "vault_trade_card_id": trade_card["id"],
                "quantity": 2,
                "base_price": 600,
                "final_price": 600,
                "condition": "NM",
                "description": "Cseremappából indított, kétpéldányos fix áras teszthirdetés.",
            }],
        }
        created = client.post("/api/auctions/batch-fixed", json=payload, headers=headers)
        assert created.status_code == 201, created.text
        auction = created.json()["auctions"][0]
        assert auction["vault_trade_card_id"] == trade_card["id"]
        own_trade = client.get("/api/vault/trade", headers=headers).json()[0]
        assert own_trade["quantity"] == 3 and own_trade["available_listing_quantity"] == 1
        assert client.patch(f"/api/vault/trade/{trade_card['id']}", json={"quantity": 1}, headers=headers).status_code == 409
        assert client.delete(f"/api/vault/trade/{trade_card['id']}", headers=headers).status_code == 409

        bought = client.post(f"/api/auctions/{auction['id']}/bids", json={"amount": "600"}, headers=auth_headers(buyer))
        assert bought.status_code == 201, bought.text
        transaction = client.get("/api/transactions", headers=headers).json()["items"][0]
        assert client.post(f"/api/transactions/{transaction['id']}/confirm-completion", headers=headers).status_code == 200
        assert client.post(f"/api/transactions/{transaction['id']}/confirm-completion", headers=auth_headers(buyer)).status_code == 200
        remaining = client.get("/api/vault/trade", headers=headers).json()
        assert len(remaining) == 1 and remaining[0]["quantity"] == 1
    finally:
        cleanup_test_data(); cleanup()


def test_public_trade_matching_interest_completion_and_idempotent_rewards() -> None:
    cleanup(); seeker = create_test_user("seeker@vault-test.local"); owner = create_test_user("trader@vault-test.local")
    db = SessionLocal()
    try:
        stored_owner = db.get(User, owner.id)
        stored_owner.username = "omronraktar@vault-test.local"
        stored_owner.full_name = "raktár Omron"
        db.commit()
        owner.username = stored_owner.username
        owner.full_name = stored_owner.full_name
    finally:
        db.close()
    try:
        folder = client.post("/api/vault/folders", json={"name": "Főmappa", "capacity": 10}, headers=auth_headers(seeker)).json()
        collected = client.post("/api/vault/cards", json={**card_payload(), "folder_id": folder["id"]}, headers=auth_headers(seeker)).json()
        client.put(f"/api/vault/cards/{collected['id']}/wanted", json={"wanted": True, "quantity": 1}, headers=auth_headers(seeker))
        offered = client.post("/api/vault/trade", json={**card_payload(quantity=1), "print_variant": "gfa"}, headers=auth_headers(owner))
        assert offered.status_code == 201 and offered.json()["print_variant"] == "gfa"
        changed_variant = client.patch(f"/api/vault/trade/{offered.json()['id']}", json={"quantity": 1, "print_variant": "fa"}, headers=auth_headers(owner))
        assert changed_variant.status_code == 200 and changed_variant.json()["print_variant"] == "fa"
        assert client.patch(f"/api/vault/trade/{offered.json()['id']}", json={"quantity": 3}, headers=auth_headers(seeker)).status_code == 404
        public = client.get(f"/api/vault/public/{owner.username}")
        assert public.status_code == 200 and public.json()[0]["owner_username"] == owner.username and public.json()[0]["print_variant"] == "fa"
        assert client.get("/api/vault/cards", headers=auth_headers(owner)).json() == []
        match = client.get("/api/vault/matches", headers=auth_headers(seeker)).json()[0]
        assert match["offer_count"] == 1
        assert client.get(f"/api/vault/cards/{collected['id']}/offers", headers=auth_headers(seeker)).json()[0]["id"] == offered.json()["id"]
        trade = client.post(f"/api/vault/trade/{offered.json()['id']}/interest", headers=auth_headers(seeker)).json()
        assert client.post(f"/api/vault/trade/{offered.json()['id']}/interest", headers=auth_headers(seeker)).json()["id"] == trade["id"]
        chatted = client.post(f"/api/vault/negotiations/{trade['id']}/messages", json={"message": "Egyezzünk meg!"}, headers=auth_headers(seeker))
        assert chatted.status_code == 200 and chatted.json()["messages"][0]["message"] == "Egyezzünk meg!"
        assert chatted.json()["requester_display_name"] == seeker.username
        assert chatted.json()["owner_display_name"] == "raktár Omron"
        assert chatted.json()["messages"][0]["sender_display_name"] == seeker.username
        db = SessionLocal()
        try:
            notification = db.scalar(select(Notification).where(Notification.user_id == owner.id, Notification.type == "auction_message"))
            assert notification is not None
            assert notification.title == "Új üzenet a Virtuális HKK Mappában"
            assert notification.target_url == "/vault"
            assert db.scalar(select(NotificationOutbox).where(NotificationOutbox.notification_id == notification.id, NotificationOutbox.task_type == "realtime")) is not None
        finally:
            db.close()
        assert client.post(f"/api/vault/negotiations/{trade['id']}/confirm", headers=auth_headers(seeker)).json()["status"] == "open"
        with ThreadPoolExecutor(max_workers=2) as executor:
            completed_responses = list(executor.map(lambda _: client.post(f"/api/vault/negotiations/{trade['id']}/confirm", headers=auth_headers(owner)), range(2)))
        assert all(response.status_code == 200 and response.json()["status"] == "completed" for response in completed_responses)
        assert client.post(f"/api/vault/negotiations/{trade['id']}/confirm", headers=auth_headers(owner)).status_code == 200
        assert client.get("/api/vault/points", headers=auth_headers(seeker)).json()["balance"] == 30
        assert client.get("/api/vault/points", headers=auth_headers(owner)).json()["balance"] == 30
        review = client.post(f"/api/vault/negotiations/{trade['id']}/reviews", json={"rating": 5, "comment": "Korrekt csere."}, headers=auth_headers(seeker))
        assert review.status_code == 201
        refreshed_trade = next(item for item in client.get("/api/vault/negotiations", headers=auth_headers(seeker)).json() if item["id"] == trade["id"])
        assert refreshed_trade["reviewed_by_current_user"] is True
        owner_trade = next(item for item in client.get("/api/vault/negotiations", headers=auth_headers(owner)).json() if item["id"] == trade["id"])
        assert owner_trade["reviewed_by_current_user"] is False
        assert client.post(f"/api/vault/negotiations/{trade['id']}/reviews", json={"rating": 5}, headers=auth_headers(seeker)).status_code == 409
        assert client.get("/api/vault/points", headers=auth_headers(seeker)).json()["balance"] == 35
    finally:
        cleanup()


def test_community_browser_is_independent_from_matches_and_reuses_negotiation() -> None:
    cleanup(); seeker = create_test_user("community-seeker@vault-test.local"); owner = create_test_user("community-owner@vault-test.local")
    try:
        private_folder = client.post("/api/vault/folders", json={"name": "Privát", "capacity": 10}, headers=auth_headers(owner)).json()
        private_card = client.post("/api/vault/cards", json={**card_payload("private-only", "Privát gyűjteménylap", 1), "folder_id": private_folder["id"]}, headers=auth_headers(owner))
        assert private_card.status_code == 201
        offered = client.post("/api/vault/trade", json=card_payload("community-card", "Közösségi lap", 2), headers=auth_headers(owner)).json()

        anonymous = client.get("/api/vault/community/trades")
        assert anonymous.status_code == 200
        assert anonymous.json()["total"] == 1
        assert anonymous.json()["items"][0]["id"] == offered["id"]
        assert anonymous.json()["items"][0]["is_wanted"] is None
        assert anonymous.json()["items"][0]["is_match"] is None
        assert anonymous.json()["items"][0]["can_express_interest"] is False
        assert client.post(f"/api/vault/trade/{offered['id']}/interest").status_code == 401

        without_match = client.get("/api/vault/community/trades?page=1&page_size=1", headers=auth_headers(seeker)).json()
        assert without_match["total"] == 1 and without_match["total_pages"] == 1
        assert without_match["items"][0]["is_wanted"] is False
        assert without_match["items"][0]["is_match"] is False
        assert without_match["items"][0]["can_express_interest"] is True
        negotiation = client.post(f"/api/vault/trade/{offered['id']}/interest", headers=auth_headers(seeker))
        assert negotiation.status_code == 201
        negotiation_id = negotiation.json()["id"]
        assert client.get("/api/vault/negotiations", headers=auth_headers(seeker)).json()[0]["id"] == negotiation_id

        seeker_folder = client.post("/api/vault/folders", json={"name": "Keresem", "capacity": 10}, headers=auth_headers(seeker)).json()
        wanted = client.post("/api/vault/cards/wanted", json={**card_payload("community-card", "Közösségi lap", 1), "folder_id": seeker_folder["id"]}, headers=auth_headers(seeker))
        assert wanted.status_code == 201
        status_before = client.get("/api/vault/matches/status", headers=auth_headers(seeker)).json()
        assert status_before["unseen_count"] == 1

        personalized = client.get("/api/vault/community/trades?query=K%C3%B6z%C3%B6ss%C3%A9gi&print_variant=normal", headers=auth_headers(seeker)).json()["items"][0]
        assert personalized["is_wanted"] is True and personalized["is_match"] is True
        assert client.get("/api/vault/community/trades?query=nincs-ilyen-lap", headers=auth_headers(seeker)).json()["items"] == []
        assert client.get("/api/vault/matches/status", headers=auth_headers(seeker)).json() == status_before
        assert client.post(f"/api/vault/trade/{offered['id']}/interest", headers=auth_headers(seeker)).json()["id"] == negotiation_id
        assert len(client.get("/api/vault/negotiations", headers=auth_headers(seeker)).json()) == 1
    finally:
        cleanup()


def test_vp_capacity_purchase_and_each_vip_activation_grants_permanent_slots() -> None:
    cleanup(); user = create_test_user("member@vault-test.local"); admin = create_test_user("admin@vault-test.local", role="admin")
    db = SessionLocal()
    try:
        grant_points(db, user.id, 200, "TEST_GRANT", "test", "grant-1"); grant_points(db, user.id, 200, "TEST_GRANT", "test", "grant-1"); db.commit()
        bought = client.post("/api/vault/points/buy-capacity", headers=auth_headers(user))
        assert bought.status_code == 200 and bought.json()["total_collection_capacity"] == 1050 and bought.json()["vp_balance"] == 100
        _, _, codes = generate_codes(db, admin, 2, 1)
        activate_code(db, user, codes[0]); activate_code(db, user, codes[1])
        summary = client.get("/api/vault/summary", headers=auth_headers(user)).json()
        assert summary["total_collection_capacity"] == 1250
        user.vip_expires_at = None; db.add(user); db.commit()
        assert client.get("/api/vault/summary", headers=auth_headers(user)).json()["total_collection_capacity"] == 1250
        grants = db.scalars(select(VaultCapacityGrant).where(VaultCapacityGrant.user_id == user.id, VaultCapacityGrant.source_type == "VIP_ACTIVATION")).all()
        assert len(grants) == 2
    finally:
        db.close(); cleanup()


def test_blocked_users_cannot_start_trade_and_vp_purchase_is_concurrency_safe() -> None:
    cleanup(); buyer = create_test_user("blocked-buyer@vault-test.local"); owner = create_test_user("blocked-owner@vault-test.local")
    try:
        offered = client.post("/api/vault/trade", json=card_payload("hkk-block", "Blokkolt lap", 1), headers=auth_headers(owner)).json()
        assert client.post(f"/api/blocks/{owner.username}", headers=auth_headers(buyer)).status_code == 201
        assert client.post(f"/api/vault/trade/{offered['id']}/interest", headers=auth_headers(buyer)).status_code == 403

        db = SessionLocal()
        try:
            grant_points(db, buyer.id, 100, "TEST_GRANT", "test", "concurrent-spend"); db.commit()
        finally:
            db.close()
        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(lambda _: client.post("/api/vault/points/buy-capacity", headers=auth_headers(buyer)), range(2)))
        assert sorted(response.status_code for response in responses) == [200, 409]
        summary = client.get("/api/vault/summary", headers=auth_headers(buyer)).json()
        assert summary["vp_balance"] == 0
        assert summary["total_collection_capacity"] == 1050
    finally:
        cleanup()


def test_same_hkk_card_can_store_separate_variants_and_quantities() -> None:
    cleanup(); user = create_test_user("variants@vault-test.local")
    try:
        folder = client.post("/api/vault/folders", json={"name": "Változatok", "capacity": 10}, headers=auth_headers(user)).json()
        normal = client.post("/api/vault/cards", json={**card_payload("variant-card", "Változatos lap", 2), "folder_id": folder["id"], "print_variant": "normal"}, headers=auth_headers(user))
        foil = client.post("/api/vault/cards", json={**card_payload("variant-card", "Változatos lap", 1), "folder_id": folder["id"], "print_variant": "foil"}, headers=auth_headers(user))
        assert normal.status_code == 201 and foil.status_code == 201
        cards = client.get("/api/vault/cards", headers=auth_headers(user)).json()
        assert {(card["print_variant"], card["quantity"]) for card in cards} == {("normal", 2), ("foil", 1)}
        assert client.patch(f"/api/vault/cards/{foil.json()['id']}", json={"print_variant": "normal"}, headers=auth_headers(user)).status_code == 409

        trade_normal = client.post("/api/vault/trade", json={**card_payload("variant-trade", "Csereváltozat", 2), "print_variant": "normal"}, headers=auth_headers(user))
        trade_gfa = client.post("/api/vault/trade", json={**card_payload("variant-trade", "Csereváltozat", 1), "print_variant": "gfa"}, headers=auth_headers(user))
        assert trade_normal.status_code == 201 and trade_gfa.status_code == 201
        assert {(card["print_variant"], card["quantity"]) for card in client.get("/api/vault/trade", headers=auth_headers(user)).json()} == {("normal", 2), ("gfa", 1)}
    finally:
        cleanup()


def test_official_variant_import_is_idempotent_and_preserves_manual_rows(monkeypatch) -> None:
    cleanup()
    base = {"12064": {"ID": 12064, "name": "Angyalgólem", "editions": [264]}}
    def filtered(params):
        flags = params.get("flags")
        return base if flags in {None, "foilosujranyomas", "vanFullart"} else {}
    monkeypatch.setattr(hkk_variant_service, "_cards", filtered)
    try:
        with SessionLocal() as db:
            first = hkk_variant_service.apply_official_edition(db, "264", "Promóciós lapok (2026)")
            db.commit()
            assert first["applied"] == 4
            rows = db.scalars(select(HkkCardVariantAttestation).where(HkkCardVariantAttestation.external_card_id == "12064")).all()
            assert {row.variant: row.status for row in rows} == {"normal": "exists", "foil": "exists", "fa": "exists", "gfa": "absent"}
            gfa = next(row for row in rows if row.variant == "gfa")
            gfa.status = "exists"; gfa.manually_verified = True; gfa.verification_method = "manual_csv"
            db.commit()
            repeated = hkk_variant_service.apply_official_edition(db, "264", "Promóciós lapok (2026)")
            db.commit()
            assert repeated["skipped_manual"] == 1
            assert db.scalar(select(HkkCardVariantAttestation).where(HkkCardVariantAttestation.id == gfa.id)).status == "exists"
            assert len(db.scalars(select(HkkCardVariantAttestation).where(HkkCardVariantAttestation.external_card_id == "12064")).all()) == 4
    finally:
        cleanup()


def test_verified_variants_override_rarity_and_keep_legacy_conflicts_reviewable() -> None:
    cleanup(); user = create_test_user("foil-rules@vault-test.local")
    try:
        folder = client.post("/api/vault/folders", json={"name": "Foil szabály", "capacity": 10}, headers=auth_headers(user)).json()
        common_payload = card_payload("common-card", "Gyakori lap", 2, "common")
        db = SessionLocal()
        try:
            now = datetime.now(timezone.utc)
            db.add_all([HkkCardVariantAttestation(external_card_id="common-card", card_name="Gyakori lap", edition_id="1", edition_name="Teszt", variant=variant, status=status_value, image_url=None, source_url="https://verseny.hkk.hu/lapkereso", source_checked_at=now, verification_method="manual_csv", manually_verified=True) for variant, status_value in (("normal", "exists"), ("foil", "absent"), ("fa", "exists"), ("gfa", "absent"))])
            db.add(HkkCardVariantAttestation(external_card_id="legacy-common", card_name="Régi foil", edition_id="1", edition_name="Teszt", variant="foil", status="absent", image_url=None, source_url="https://verseny.hkk.hu/lapkereso", source_checked_at=now, verification_method="manual_csv", manually_verified=True))
            db.commit()
        finally:
            db.close()
        normal = client.post("/api/vault/cards", json={**common_payload, "folder_id": folder["id"], "print_variant": "normal"}, headers=auth_headers(user))
        assert normal.status_code == 201
        assert client.post("/api/vault/cards", json={**common_payload, "folder_id": folder["id"], "print_variant": "foil"}, headers=auth_headers(user)).status_code == 422
        assert client.patch(f"/api/vault/cards/{normal.json()['id']}", json={"print_variant": "foil"}, headers=auth_headers(user)).status_code == 422

        fa = client.post("/api/vault/cards", json={**common_payload, "folder_id": folder["id"], "print_variant": "fa", "quantity": 1}, headers=auth_headers(user))
        gfa = client.post("/api/vault/cards", json={**common_payload, "folder_id": folder["id"], "print_variant": "gfa", "quantity": 1}, headers=auth_headers(user))
        assert fa.status_code == 201 and gfa.status_code == 422
        read = client.get("/api/vault/cards", headers=auth_headers(user)).json()
        assert read[0]["variants_verified"] is True and read[0]["variant_statuses"] == {"normal": "exists", "foil": "absent", "fa": "exists", "gfa": "absent"}

        db = SessionLocal()
        try:
            legacy = VaultCollectionCard(user_id=user.id, folder_id=folder["id"], external_card_id="legacy-common", card_name="Régi foil", rarity="common", quantity=2, print_variant="foil")
            db.add(legacy); db.commit(); db.refresh(legacy); legacy_id = legacy.id
        finally:
            db.close()
        repeated_legacy = client.post("/api/vault/cards", json={**card_payload("legacy-common", "Régi foil", 1), "folder_id": folder["id"], "print_variant": "foil"}, headers=auth_headers(user))
        assert repeated_legacy.status_code == 422
        assert client.patch(f"/api/vault/cards/{legacy_id}", json={"quantity": 1}, headers=auth_headers(user)).status_code == 200
        assert client.patch(f"/api/vault/cards/{legacy_id}", json={"quantity": 3}, headers=auth_headers(user)).status_code == 422
        legacy_cards = client.get("/api/vault/cards", headers=auth_headers(user)).json()
        assert any(card["id"] == legacy_id and card["print_variant"] == "foil" and card["quantity"] == 1 for card in legacy_cards)
        assert next(card for card in legacy_cards if card["id"] == legacy_id)["variant_needs_review"] is True
    finally:
        cleanup()


def test_card_loans_enforce_owned_quantity_and_keep_history() -> None:
    cleanup(); owner = create_test_user("loans@vault-test.local"); stranger = create_test_user("loan-stranger@vault-test.local")
    try:
        folder = client.post("/api/vault/folders", json={"name": "Kölcsön", "capacity": 5}, headers=auth_headers(owner)).json()
        card = client.post("/api/vault/cards", json={**card_payload("loan-card", "Kölcsönlap", 2), "folder_id": folder["id"], "print_variant": "foil"}, headers=auth_headers(owner)).json()
        payload = {"quantity": 1, "borrower_name": "Teszt Elek", "lent_at": "2026-10-07", "due_at": "2026-10-20", "note": "Versenyre"}
        loan = client.post(f"/api/vault/cards/{card['id']}/loans", json=payload, headers=auth_headers(owner))
        assert loan.status_code == 201 and loan.json()["status"] == "active" and loan.json()["print_variant"] == "foil"
        assert client.post(f"/api/vault/cards/{card['id']}/loans", json={**payload, "quantity": 2}, headers=auth_headers(owner)).status_code == 409
        assert client.patch(f"/api/vault/cards/{card['id']}", json={"quantity": 0}, headers=auth_headers(owner)).status_code == 409
        assert client.post(f"/api/vault/loans/{loan.json()['id']}/return", headers=auth_headers(stranger)).status_code == 404
        returned = client.post(f"/api/vault/loans/{loan.json()['id']}/return", headers=auth_headers(owner))
        assert returned.status_code == 200 and returned.json()["status"] == "returned" and returned.json()["returned_at"]
        assert client.patch(f"/api/vault/cards/{card['id']}", json={"quantity": 0}, headers=auth_headers(owner)).status_code == 200
        history = client.get("/api/vault/loans", headers=auth_headers(owner)).json()
        assert len(history) == 1 and history[0]["status"] == "returned"
    finally:
        cleanup()


def test_folder_can_be_deleted_with_hundreds_of_cards_without_idor_or_orphan_loans() -> None:
    cleanup(); owner = create_test_user("folder-delete@vault-test.local"); stranger = create_test_user("folder-delete-stranger@vault-test.local")
    try:
        folder = client.post("/api/vault/folders", json={"name": "Nagy import", "capacity": 350}, headers=auth_headers(owner)).json()
        db = SessionLocal()
        try:
            cards = [VaultCollectionCard(user_id=owner.id, folder_id=folder["id"], external_card_id=f"bulk-{index}", card_name=f"Lap {index}", quantity=1, print_variant="normal") for index in range(300)]
            db.add_all(cards); db.flush()
            loan = VaultCardLoan(user_id=owner.id, collection_card_id=cards[0].id, external_card_id=cards[0].external_card_id, card_name=cards[0].card_name, print_variant="normal", quantity=1, borrower_name="Tesztelő", lent_at=date(2026, 10, 7))
            db.add(loan); db.commit(); loan_id = loan.id
        finally:
            db.close()
        assert client.delete(f"/api/vault/folders/{folder['id']}?delete_contents=true", headers=auth_headers(stranger)).status_code == 404
        deleted = client.delete(f"/api/vault/folders/{folder['id']}?delete_contents=true", headers=auth_headers(owner))
        assert deleted.status_code == 204
        assert client.get("/api/vault/cards", headers=auth_headers(owner)).json() == []
        history = client.get("/api/vault/loans", headers=auth_headers(owner)).json()
        assert history[0]["id"] == loan_id and history[0]["status"] == "cancelled" and history[0]["collection_card_id"] is None
    finally:
        cleanup()


def test_deck_crud_counts_all_owned_variants_and_external_trade_availability() -> None:
    cleanup(); owner = create_test_user("deck-owner@vault-test.local"); trader = create_test_user("deck-trader@vault-test.local")
    try:
        folder = client.post("/api/vault/folders", json={"name": "Paklilapok", "capacity": 10}, headers=auth_headers(owner)).json()
        client.post("/api/vault/cards", json={**card_payload("deck-card", "Paklilap", 2), "folder_id": folder["id"], "print_variant": "normal"}, headers=auth_headers(owner))
        client.post("/api/vault/cards", json={**card_payload("deck-card", "Paklilap", 1), "folder_id": folder["id"], "print_variant": "foil"}, headers=auth_headers(owner))
        client.post("/api/vault/trade", json={**card_payload("deck-card", "Paklilap", 2), "print_variant": "gfa"}, headers=auth_headers(trader))
        created = client.post("/api/vault/decks", json={"name": "Versenypakli"}, headers=auth_headers(owner))
        assert created.status_code == 201
        added = client.post(f"/api/vault/decks/{created.json()['id']}/cards", json={**card_payload("deck-card", "Paklilap"), "required_quantity": 4}, headers=auth_headers(owner))
        assert added.status_code == 201
        deck = added.json()
        assert deck["total_required_quantity"] == 4 and deck["missing_quantity"] == 1
        assert deck["cards"][0]["owned_quantity"] == 3 and deck["cards"][0]["available_trade_quantity"] == 1
        assert client.get("/api/vault/decks", headers=auth_headers(trader)).json() == []
        summary = client.get("/api/vault/summary", headers=auth_headers(owner)).json()
        assert summary["owned_card_quantity"] == 3 and summary["deck_missing_quantity"] == 1
        assert client.delete(f"/api/vault/decks/{created.json()['id']}", headers=auth_headers(trader)).status_code == 404
        assert client.delete(f"/api/vault/decks/{created.json()['id']}", headers=auth_headers(owner)).status_code == 204
    finally:
        cleanup()


def test_trade_card_seekers_are_owner_scoped_and_use_public_labels() -> None:
    cleanup(); owner = create_test_user("seeker-owner@vault-test.local"); seeker = create_test_user("seeker-person@vault-test.local"); stranger = create_test_user("seeker-stranger@vault-test.local")
    try:
        owner_headers, seeker_headers, stranger_headers = auth_headers(owner), auth_headers(seeker), auth_headers(stranger)
        seeker_id, seeker_username = seeker.id, seeker.username
        folder = client.post("/api/vault/folders", json={"name": "Keresem", "capacity": 5}, headers=seeker_headers).json()
        wanted = client.post("/api/vault/cards/wanted", json={**card_payload("demand-card", "Keresett lap"), "folder_id": folder["id"]}, headers=seeker_headers)
        assert wanted.status_code == 201
        offered = client.post("/api/vault/trade", json=card_payload("demand-card", "Keresett lap", 1), headers=owner_headers).json()
        own_cards = client.get("/api/vault/trade", headers=owner_headers).json()
        assert own_cards[0]["seeker_count"] == 1
        assert client.get(f"/api/vault/trade/{offered['id']}/seekers", headers=stranger_headers).status_code == 404
        seekers = client.get(f"/api/vault/trade/{offered['id']}/seekers", headers=owner_headers).json()
        assert seekers == [{"user_id": seeker_id, "username": seeker_username, "display_name": seeker_username, "wanted_quantity": 3}]
        summary = client.get("/api/vault/summary", headers=owner_headers).json()
        assert summary["cards_wanted_by_others"] == 1
    finally:
        cleanup()


def test_bulk_card_operations_are_atomic_owner_scoped_and_keep_collection_when_trade_removed() -> None:
    cleanup(); owner = create_test_user("bulk-owner@vault-test.local"); stranger = create_test_user("bulk-stranger@vault-test.local")
    try:
        source = client.post("/api/vault/folders", json={"name": "Forrás", "capacity": 5}, headers=auth_headers(owner)).json()
        target = client.post("/api/vault/folders", json={"name": "Cél", "capacity": 1}, headers=auth_headers(owner)).json()
        stranger_folder = client.post("/api/vault/folders", json={"name": "Idegen", "capacity": 2}, headers=auth_headers(stranger)).json()
        first = client.post("/api/vault/cards", json={**card_payload("bulk-1", "Első", 1), "folder_id": source["id"]}, headers=auth_headers(owner)).json()
        second = client.post("/api/vault/cards", json={**card_payload("bulk-2", "Második", 2), "folder_id": source["id"]}, headers=auth_headers(owner)).json()
        foreign = client.post("/api/vault/cards", json={**card_payload("bulk-3", "Idegen", 1), "folder_id": stranger_folder["id"]}, headers=auth_headers(stranger)).json()

        denied = client.post("/api/vault/cards/bulk", json={"card_ids": [first["id"], foreign["id"]], "action": "move", "folder_id": target["id"]}, headers=auth_headers(owner))
        assert denied.status_code == 404
        assert {card["folder_id"] for card in client.get("/api/vault/cards", headers=auth_headers(owner)).json()} == {source["id"]}

        shortage = client.post("/api/vault/cards/bulk", json={"card_ids": [first["id"], second["id"]], "action": "move", "folder_id": target["id"]}, headers=auth_headers(owner))
        assert shortage.status_code == 409
        assert {card["folder_id"] for card in client.get("/api/vault/cards", headers=auth_headers(owner)).json()} == {source["id"]}

        moved = client.post("/api/vault/cards/bulk", json={"card_ids": [first["id"]], "action": "move", "folder_id": target["id"]}, headers=auth_headers(owner))
        assert moved.status_code == 200 and moved.json()["processed_count"] == 1
        added = client.post("/api/vault/cards/bulk", json={"card_ids": [first["id"], second["id"]], "action": "trade_add"}, headers=auth_headers(owner))
        assert added.status_code == 200 and len(client.get("/api/vault/trade", headers=auth_headers(owner)).json()) == 2
        removed = client.post("/api/vault/cards/bulk", json={"card_ids": [first["id"], second["id"]], "action": "trade_remove"}, headers=auth_headers(owner))
        assert removed.status_code == 200 and client.get("/api/vault/trade", headers=auth_headers(owner)).json() == []
        assert len(client.get("/api/vault/cards", headers=auth_headers(owner)).json()) == 2

        wanted_on = client.post("/api/vault/cards/bulk", json={"card_ids": [first["id"], second["id"]], "action": "wanted_on"}, headers=auth_headers(owner))
        assert wanted_on.status_code == 200
        wanted_cards = client.get("/api/vault/cards", headers=auth_headers(owner)).json()
        assert all(card["wanted"] for card in wanted_cards)
        wanted_off = client.post("/api/vault/cards/bulk", json={"card_ids": [first["id"], second["id"]], "action": "wanted_off"}, headers=auth_headers(owner))
        assert wanted_off.status_code == 200
        assert all(not card["wanted"] for card in client.get("/api/vault/cards", headers=auth_headers(owner)).json())

        deleted = client.post("/api/vault/cards/bulk", json={"card_ids": [second["id"]], "action": "delete"}, headers=auth_headers(owner))
        assert deleted.status_code == 200 and deleted.json()["processed_count"] == 1
        assert [card["id"] for card in client.get("/api/vault/cards", headers=auth_headers(owner)).json()] == [first["id"]]
    finally:
        cleanup()


def test_maintenance_suggestions_are_computed_and_actions_are_owner_scoped() -> None:
    cleanup(); owner = create_test_user("maintenance@vault-test.local"); stranger = create_test_user("maintenance-stranger@vault-test.local")
    try:
        folder = client.post("/api/vault/folders", json={"name": "Karbantartás", "capacity": 10}, headers=auth_headers(owner)).json()
        wanted = client.post("/api/vault/cards/wanted", json={**card_payload("maint-wanted", "Már megvan"), "folder_id": folder["id"]}, headers=auth_headers(owner)).json()
        partial = client.post("/api/vault/cards", json={**card_payload("maint-wanted", "Már megvan", 1), "folder_id": folder["id"]}, headers=auth_headers(owner))
        assert partial.status_code == 201 and partial.json()["wanted"] is True and partial.json()["wanted_quantity"] == 2
        assert client.get("/api/vault/maintenance", headers=auth_headers(owner)).json()["acquired_wanted"] == []
        acquired = client.post("/api/vault/cards", json={**card_payload("maint-wanted", "Már megvan", 3), "folder_id": folder["id"]}, headers=auth_headers(owner))
        assert acquired.status_code == 201 and acquired.json()["wanted"] is True and acquired.json()["wanted_quantity"] == 0
        loan_card = client.post("/api/vault/cards", json={**card_payload("maint-loan", "Késő kölcsön", 1), "folder_id": folder["id"]}, headers=auth_headers(owner)).json()
        loan = client.post(f"/api/vault/cards/{loan_card['id']}/loans", json={"quantity": 1, "borrower_name": "Teszt", "lent_at": "2026-09-01", "due_at": "2026-09-10"}, headers=auth_headers(owner))
        assert loan.status_code == 201
        trade = client.post("/api/vault/trade", json=card_payload("maint-trade", "Régi cserelap", 1), headers=auth_headers(owner)).json()
        db = SessionLocal()
        try:
            stored_trade = db.get(VaultTradeCard, trade["id"])
            stored_trade.updated_at = datetime.now(timezone.utc) - timedelta(days=22)
            db.commit()
        finally:
            db.close()

        suggestions = client.get("/api/vault/maintenance", headers=auth_headers(owner))
        assert suggestions.status_code == 200 and suggestions.json()["stale_after_days"] == 21
        assert [item["id"] for item in suggestions.json()["acquired_wanted"]] == [wanted["id"]]
        assert [item["id"] for item in suggestions.json()["stale_trade_cards"]] == [trade["id"]]
        assert [item["id"] for item in suggestions.json()["overdue_loans"]] == [loan.json()["id"]]

        assert client.post(f"/api/vault/trade/{trade['id']}/verify", headers=auth_headers(stranger)).status_code == 404
        assert client.post(f"/api/vault/trade/{trade['id']}/verify", headers=auth_headers(owner)).status_code == 200
        assert client.get("/api/vault/maintenance", headers=auth_headers(owner)).json()["stale_trade_cards"] == []
        kept = client.put(f"/api/vault/cards/{wanted['id']}/wanted", json={"wanted": True, "quantity": 1}, headers=auth_headers(owner))
        assert kept.status_code == 200 and kept.json()["wanted_quantity"] == 1
    finally:
        cleanup()


def test_match_badge_is_persistent_deduplicated_owner_scoped_and_in_app_only() -> None:
    cleanup(); seeker = create_test_user("match-seeker@vault-test.local"); owner = create_test_user("match-owner@vault-test.local"); stranger = create_test_user("match-stranger@vault-test.local")
    try:
        seeker_headers, owner_headers = auth_headers(seeker), auth_headers(owner)
        folder = client.post("/api/vault/folders", json={"name": "Keresem", "capacity": 5}, headers=seeker_headers).json()
        wanted = client.post("/api/vault/cards/wanted", json={**card_payload("match-card", "Találatos lap"), "folder_id": folder["id"]}, headers=seeker_headers)
        assert wanted.status_code == 201
        db = SessionLocal()
        try:
            db.add(NotificationPreference(user_id=seeker.id, category="system", in_app=False, browser=True, email=True, push=True))
            db.commit()
        finally:
            db.close()

        offered = client.post("/api/vault/trade", json=card_payload("match-card", "Találatos lap", 1), headers=owner_headers)
        assert offered.status_code == 201
        first = client.get("/api/vault/matches/status", headers=seeker_headers)
        assert first.status_code == 200 and first.json()["unseen_count"] == 1
        match_key = first.json()["match_keys"][0]
        assert len(match_key) == 64
        assert client.get("/api/vault/matches/status", headers=seeker_headers).json() == first.json()
        assert client.post("/api/vault/matches/seen", json={"match_keys": [match_key]}, headers=auth_headers(stranger)).json() == {"updated": 0}

        db = SessionLocal()
        try:
            notifications = list(db.scalars(select(Notification).where(Notification.user_id == seeker.id, Notification.type == "vault_match")).all())
            assert len(notifications) == 1
            assert notifications[0].target_url == "/vault?area=trade&view=matches"
            assert notifications[0].in_app_enabled is True
            assert notifications[0].browser_enabled is False
            assert notifications[0].email_enabled is False
            assert notifications[0].push_enabled is False
            assert {row.task_type for row in db.scalars(select(NotificationOutbox).where(NotificationOutbox.notification_id == notifications[0].id)).all()} == {"realtime"}
        finally:
            db.close()

        assert client.post("/api/vault/matches/seen", json={"match_keys": [match_key]}, headers=seeker_headers).json() == {"updated": 1}
        assert client.get("/api/vault/matches/status", headers=seeker_headers).json()["unseen_count"] == 0
        assert client.delete(f"/api/vault/trade/{offered.json()['id']}", headers=owner_headers).status_code == 204
        assert client.get("/api/vault/matches/status", headers=seeker_headers).json()["unseen_count"] == 0

        recreated = client.post("/api/vault/trade", json=card_payload("match-card", "Találatos lap", 1), headers=owner_headers)
        assert recreated.status_code == 201
        assert client.get("/api/vault/matches/status", headers=seeker_headers).json()["unseen_count"] == 0
        db = SessionLocal()
        try:
            assert len(list(db.scalars(select(VaultMatchState).where(VaultMatchState.user_id == seeker.id)).all())) == 1
            assert len(list(db.scalars(select(Notification).where(Notification.user_id == seeker.id, Notification.type == "vault_match")).all())) == 1
        finally:
            db.close()
    finally:
        cleanup()


def test_folder_aggregates_and_direct_trade_state_refresh_without_deleting_collection() -> None:
    cleanup(); owner = create_test_user("folder-stats@vault-test.local")
    try:
        headers = auth_headers(owner)
        folder = client.post("/api/vault/folders", json={"name": "Statisztika", "capacity": 10}, headers=headers).json()
        first = client.post("/api/vault/cards", json={**card_payload("stats-1", "Első", 3), "folder_id": folder["id"]}, headers=headers).json()
        client.post("/api/vault/cards", json={**card_payload("stats-2", "Második", 2), "folder_id": folder["id"]}, headers=headers)
        summary = client.get("/api/vault/summary", headers=headers).json()
        stored_folder = next(item for item in summary["folders"] if item["id"] == folder["id"])
        assert (stored_folder["entry_count"], stored_folder["copy_count"], stored_folder["used_slots"], stored_folder["capacity"]) == (2, 5, 2, 10)

        added = client.post("/api/vault/cards/bulk", json={"card_ids": [first["id"]], "action": "trade_add"}, headers=headers)
        assert added.status_code == 200
        collection = client.get("/api/vault/cards", headers=headers).json()
        assert next(item for item in collection if item["id"] == first["id"])["in_trade"] is True
        removed = client.post("/api/vault/cards/bulk", json={"card_ids": [first["id"]], "action": "trade_remove"}, headers=headers)
        assert removed.status_code == 200
        collection = client.get("/api/vault/cards", headers=headers).json()
        assert len(collection) == 2
        assert next(item for item in collection if item["id"] == first["id"])["in_trade"] is False
    finally:
        cleanup()


def test_collection_variant_trade_quantity_and_standalone_multi_loan() -> None:
    cleanup(); owner = create_test_user("variant-flow@vault-test.local")
    try:
        headers = auth_headers(owner)
        folder = client.post("/api/vault/folders", json={"name": "Változatok", "capacity": 10}, headers=headers).json()
        normal = client.post("/api/vault/cards", json={**card_payload("variant-card", "Változatos lap", 6), "folder_id": folder["id"]}, headers=headers).json()

        foil = client.post(f"/api/vault/cards/{normal['id']}/variants", json={"quantity": 2, "print_variant": "foil"}, headers=headers)
        assert foil.status_code == 201 and foil.json()["quantity"] == 2 and foil.json()["print_variant"] == "foil"
        duplicate = client.post(f"/api/vault/cards/{normal['id']}/variants", json={"quantity": 1, "print_variant": "foil"}, headers=headers)
        assert duplicate.status_code == 409

        offered = client.put("/api/vault/cards/trade", json={"items": [{"card_id": normal["id"], "quantity": 4}, {"card_id": foil.json()["id"], "quantity": 1}]}, headers=headers)
        assert offered.status_code == 200
        trades = client.get("/api/vault/trade", headers=headers).json()
        assert {(item["print_variant"], item["quantity"]) for item in trades} == {("normal", 4), ("foil", 1)}
        removed = client.put("/api/vault/cards/trade", json={"items": [{"card_id": normal["id"], "quantity": 0}, {"card_id": foil.json()["id"], "quantity": 2}]}, headers=headers)
        assert removed.status_code == 200
        assert {(item["print_variant"], item["quantity"]) for item in client.get("/api/vault/trade", headers=headers).json()} == {("foil", 2)}
        assert len(client.get("/api/vault/cards", headers=headers).json()) == 2

        first = card_payload("loan-free-1", "Nem katalogizált lap", 3); first.pop("quantity")
        second = card_payload("loan-free-2", "Másik kölcsönlap", 2); second.pop("quantity")
        loans = client.post("/api/vault/loans", json={"borrower_name": "Tesztelő", "lent_at": "2026-10-13", "cards": [{**first, "quantity": 3, "print_variant": "normal"}, {**second, "quantity": 2, "print_variant": "fa"}]}, headers=headers)
        assert loans.status_code == 201
        assert {(item["external_card_id"], item["quantity"], item["collection_card_id"]) for item in loans.json()} == {("loan-free-1", 3, None), ("loan-free-2", 2, None)}
    finally:
        cleanup()


def test_unverified_variant_is_not_blocked_by_rarity() -> None:
    cleanup(); owner = create_test_user("variant-rarity@vault-test.local")
    try:
        headers = auth_headers(owner)
        folder = client.post("/api/vault/folders", json={"name": "Gyakori", "capacity": 3}, headers=headers).json()
        common = client.post("/api/vault/cards", json={**card_payload("common-card", "Gyakori lap", 1, "common"), "folder_id": folder["id"]}, headers=headers).json()
        unverified = client.post(f"/api/vault/cards/{common['id']}/variants", json={"quantity": 1, "print_variant": "foil"}, headers=headers)
        assert unverified.status_code == 201
        assert client.post(f"/api/vault/cards/{common['id']}/variants", json={"quantity": 1, "print_variant": "fa"}, headers=headers).status_code == 201
    finally:
        cleanup()
