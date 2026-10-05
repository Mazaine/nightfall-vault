from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import delete, or_, select

from app.db.session import SessionLocal
from app.models.user import User, VipActivationCode
from app.models.security_log import AuditLog
from app.models.moderation import UserBlock
from app.models.notification import Notification, NotificationOutbox
from app.models.vault import VaultAccount, VaultCapacityGrant, VaultCollectionCard, VaultFolder, VaultPointTransaction, VaultTrade, VaultTradeCard, VaultTradeMessage, VaultTradeReview
from app.services.membership import activate_code, generate_codes
from app.services.vault import grant_capacity, grant_points, sign_card_snapshot
from app.services import vault as vault_service
from test_auction_domain import auth_headers, client, create_test_user


def cleanup() -> None:
    db = SessionLocal()
    try:
        test_users = or_(User.email.like("%@vault-test.local"), User.email == "mazaine89@gmail.com")
        user_ids = list(db.scalars(select(User.id).where(test_users)).all())
        for model in (VaultTradeReview, VaultTradeMessage, VaultTrade, VaultTradeCard, VaultCollectionCard, VaultFolder, VaultCapacityGrant, VaultPointTransaction, VaultAccount, VipActivationCode):
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


def card_payload(card_id: str = "hkk-1", name: str = "Xenó lárva", quantity: int = 2) -> dict:
    payload = {"external_card_id": card_id, "card_name": name, "image_url": "https://example.test/card.jpg", "edition": "Teszt kiadás", "card_type": "Lény", "subtype": None, "color": None, "rarity": None}
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
        assert created.status_code == 201 and created.json()["quantity"] == 2
        duplicate = client.post("/api/vault/cards", json={**card_payload(quantity=3), "folder_id": xen["id"]}, headers=auth_headers(owner))
        assert duplicate.status_code == 201 and duplicate.json()["id"] == created.json()["id"] and duplicate.json()["quantity"] == 3
        assert client.post("/api/vault/cards", json={**card_payload("bad", "Hibás", 4), "folder_id": xen["id"]}, headers=auth_headers(owner)).status_code == 422
        moved = client.patch(f"/api/vault/cards/{created.json()['id']}", json={"folder_id": other["id"], "quantity": 2}, headers=auth_headers(owner))
        assert moved.status_code == 200 and moved.json()["folder_id"] == other["id"]
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
        offered = client.post("/api/vault/trade", json=card_payload(quantity=1), headers=auth_headers(owner))
        assert offered.status_code == 201
        assert client.patch(f"/api/vault/trade/{offered.json()['id']}", json={"quantity": 3}, headers=auth_headers(seeker)).status_code == 404
        public = client.get(f"/api/vault/public/{owner.username}")
        assert public.status_code == 200 and public.json()[0]["owner_username"] == owner.username
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
