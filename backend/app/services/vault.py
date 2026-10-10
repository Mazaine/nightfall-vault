from datetime import datetime, timezone
import hashlib
import hmac
import json
import time
from urllib.parse import urlencode
from uuid import uuid4

import httpx
from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.config import settings
from app.models.user import User
from app.models.vault import VaultAccount, VaultCapacityGrant, VaultCollectionCard, VaultFolder, VaultPointTransaction, VaultTrade, VaultTradeCard, VaultTradeMessage


BASE_COLLECTION_CAPACITY = 1000
BASE_TRADE_CAPACITY = 200
CAPACITY_PACK_SLOTS = 50
CAPACITY_PACK_COST = 100
VIP_ACTIVATION_SLOTS = 100
HKK_CONSTANTS_CACHE_TTL_SECONDS = 60 * 60
HKK_CARD_IMAGE_MAX_BYTES = 8 * 1024 * 1024
HKK_CARD_IMAGE_MEDIA_TYPES = frozenset({"image/jpeg", "image/png", "image/webp", "image/gif"})
HKK_RARITIES = frozenset({"common", "uncommun", "rare", "ultrarare"})
_hkk_constants_cache: tuple[float, tuple[frozenset[str], dict[str, str]]] | None = None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def account_for(db: Session, user_id: int, *, lock: bool = False) -> VaultAccount:
    statement = select(VaultAccount).where(VaultAccount.user_id == user_id)
    if lock:
        statement = statement.with_for_update()
    account = db.scalar(statement)
    if account is None:
        try:
            with db.begin_nested():
                account = VaultAccount(user_id=user_id, base_collection_capacity=BASE_COLLECTION_CAPACITY, trade_capacity=BASE_TRADE_CAPACITY)
                db.add(account)
                db.flush()
        except IntegrityError:
            account = db.scalar(select(VaultAccount).where(VaultAccount.user_id == user_id).with_for_update())
            if account is None:
                raise
    return account


def point_balance(db: Session, user_id: int) -> int:
    return int(db.scalar(select(func.coalesce(func.sum(VaultPointTransaction.amount), 0)).where(VaultPointTransaction.user_id == user_id)) or 0)


def total_collection_capacity(db: Session, user_id: int) -> int:
    account = account_for(db, user_id)
    bonus = int(db.scalar(select(func.coalesce(func.sum(VaultCapacityGrant.slots), 0)).where(VaultCapacityGrant.user_id == user_id)) or 0)
    return account.base_collection_capacity + bonus


def grant_points(db: Session, user_id: int, amount: int, reason: str, reference_type: str, reference_id: str, *, event_key: str | None = None) -> bool:
    key = event_key or f"{reason}:{reference_type}:{reference_id}"
    if db.scalar(select(VaultPointTransaction.id).where(VaultPointTransaction.user_id == user_id, VaultPointTransaction.event_key == key)) is not None:
        return False
    try:
        with db.begin_nested():
            db.add(VaultPointTransaction(user_id=user_id, amount=amount, reason=reason, reference_type=reference_type, reference_id=reference_id, event_key=key))
            db.flush()
    except IntegrityError:
        return False
    return True


def grant_capacity(db: Session, user_id: int, slots: int, source_type: str, reference_id: str) -> bool:
    if db.scalar(select(VaultCapacityGrant.id).where(VaultCapacityGrant.user_id == user_id, VaultCapacityGrant.source_type == source_type, VaultCapacityGrant.reference_id == reference_id)) is not None:
        return False
    try:
        with db.begin_nested():
            db.add(VaultCapacityGrant(user_id=user_id, slots=slots, source_type=source_type, reference_id=reference_id))
            db.flush()
    except IntegrityError:
        return False
    return True


def buy_capacity_pack(db: Session, user_id: int) -> None:
    account = account_for(db, user_id, lock=True)
    if account.vault_unlimited:
        raise HTTPException(status_code=409, detail="A korlátlan mappához nem szükséges kapacitást vásárolni.")
    if point_balance(db, user_id) < CAPACITY_PACK_COST:
        raise HTTPException(status_code=409, detail="Nincs elegendő VP-d a bővítéshez.")
    purchase_id = str(uuid4())
    grant_points(db, user_id, -CAPACITY_PACK_COST, "CAPACITY_PURCHASE", "capacity_purchase", purchase_id)
    grant_capacity(db, user_id, CAPACITY_PACK_SLOTS, "VP_PURCHASE", purchase_id)
    db.commit()


def folder_for_user(db: Session, folder_id: int, user_id: int, *, lock: bool = False) -> VaultFolder:
    statement = select(VaultFolder).where(VaultFolder.id == folder_id, VaultFolder.user_id == user_id)
    if lock:
        statement = statement.with_for_update()
    folder = db.scalar(statement)
    if folder is None:
        raise HTTPException(status_code=404, detail="A mappa nem található.")
    return folder


def folder_used(db: Session, folder_id: int) -> int:
    return int(db.scalar(select(func.count()).select_from(VaultCollectionCard).where(VaultCollectionCard.folder_id == folder_id)) or 0)


def assigned_capacity(db: Session, user_id: int, *, exclude_folder_id: int | None = None) -> int:
    statement = select(func.coalesce(func.sum(VaultFolder.capacity), 0)).where(VaultFolder.user_id == user_id)
    if exclude_folder_id is not None:
        statement = statement.where(VaultFolder.id != exclude_folder_id)
    return int(db.scalar(statement) or 0)


def require_allocatable(db: Session, user_id: int, requested_capacity: int, *, exclude_folder_id: int | None = None) -> None:
    if account_for(db, user_id).vault_unlimited:
        return
    if assigned_capacity(db, user_id, exclude_folder_id=exclude_folder_id) + requested_capacity > total_collection_capacity(db, user_id):
        raise HTTPException(status_code=409, detail="Nincs ennyi szabad gyűjtőzseb.")


def collection_card_for_user(db: Session, card_id: int, user_id: int, *, lock: bool = False) -> VaultCollectionCard:
    statement = select(VaultCollectionCard).where(VaultCollectionCard.id == card_id, VaultCollectionCard.user_id == user_id)
    if lock:
        statement = statement.with_for_update()
    card = db.scalar(statement)
    if card is None:
        raise HTTPException(status_code=404, detail="A lap nem található.")
    return card


def trade_for_participant(db: Session, trade_id: int, user_id: int, *, lock: bool = False) -> VaultTrade:
    statement = select(VaultTrade).where(VaultTrade.id == trade_id, or_(VaultTrade.requester_id == user_id, VaultTrade.owner_id == user_id))
    if lock:
        statement = statement.with_for_update()
    else:
        statement = statement.options(joinedload(VaultTrade.requester), joinedload(VaultTrade.owner), joinedload(VaultTrade.offered_card), selectinload(VaultTrade.messages).joinedload(VaultTradeMessage.sender))
    trade = db.scalar(statement)
    if trade is None:
        raise HTTPException(status_code=404, detail="Az egyeztetés nem található.")
    return trade


def card_snapshot_values(payload) -> dict:
    return {key: getattr(payload, key) for key in ("external_card_id", "card_name", "image_url", "edition", "card_type", "subtype", "color", "rarity")}


def sign_card_snapshot(card: dict) -> str:
    values = {key: card.get(key) for key in ("external_card_id", "card_name", "image_url", "edition", "card_type", "subtype", "color", "rarity")}
    serialized = json.dumps(values, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hmac.new(settings.secret_key.encode("utf-8"), serialized.encode("utf-8"), hashlib.sha256).hexdigest()


def require_valid_card_snapshot(payload) -> None:
    values = card_snapshot_values(payload)
    if not hmac.compare_digest(payload.source_token, sign_card_snapshot(values)):
        raise HTTPException(status_code=422, detail="A HKK lapadat nem hiteles vagy megváltozott. Keress rá újra a lapra.")


def _hkk_catalog_url(route: str, params: dict[str, str] | None = None) -> str:
    query = route
    if params:
        query = f"{query}&{urlencode(params)}"
    return f"{settings.hkk_catalog_base_url.rstrip('/')}/api/api.php?{query}"


def _hkk_text(value: object, *, max_length: int) -> str | None:
    if not isinstance(value, (str, int)) or isinstance(value, bool):
        return None
    normalized = " ".join(str(value).strip().split())
    return normalized[:max_length] or None


def _hkk_values(value: object, *, max_items: int, max_length: int) -> list[str]:
    source = value if isinstance(value, list) else [value] if isinstance(value, str) else []
    result: list[str] = []
    for item in source:
        normalized = _hkk_text(item, max_length=max_length)
        if normalized and normalized not in result:
            result.append(normalized)
        if len(result) >= max_items:
            break
    return result


def _hkk_external_id(value: object) -> str | None:
    normalized = _hkk_text(value, max_length=120)
    if normalized is None or not normalized.isdigit() or int(normalized) <= 0:
        return None
    return str(int(normalized))


def _parse_hkk_constants(payload: object) -> tuple[frozenset[str], dict[str, str]]:
    if not isinstance(payload, dict):
        raise ValueError("The Lapkereső constants response is malformed.")
    subtypes = frozenset(value for value in _hkk_values(payload.get("subTypes"), max_items=500, max_length=120) if value not in {"--nincs--", "-", "?"})
    editions: dict[str, str] = {}
    if isinstance(payload.get("editions"), list):
        for edition in payload["editions"]:
            if not isinstance(edition, dict):
                continue
            edition_id = _hkk_external_id(edition.get("id"))
            name = _hkk_text(edition.get("nev"), max_length=160)
            if edition_id and name:
                editions[edition_id] = name
    return subtypes, editions


def _load_hkk_constants() -> tuple[frozenset[str], dict[str, str]]:
    global _hkk_constants_cache
    now = time.monotonic()
    if _hkk_constants_cache is not None and now - _hkk_constants_cache[0] < HKK_CONSTANTS_CACHE_TTL_SECONDS:
        return _hkk_constants_cache[1]
    response = httpx.get(_hkk_catalog_url("lapkereso/cardConstants"), timeout=settings.hkk_catalog_request_timeout_seconds)
    response.raise_for_status()
    constants = _parse_hkk_constants(response.json())
    _hkk_constants_cache = (now, constants)
    return constants


def _joined(values: list[str], max_length: int) -> str | None:
    return " · ".join(values)[:max_length] or None


def fetch_hkk_card_image(card_id: int) -> tuple[bytes, str]:
    if card_id <= 0:
        raise HTTPException(status_code=422, detail="Érvénytelen HKK lapazonosító.")
    url = f"{settings.hkk_catalog_base_url.rstrip('/')}/HKKCardImage.php?{urlencode({'cardID': card_id})}"
    try:
        response = httpx.get(url, timeout=settings.hkk_catalog_request_timeout_seconds)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="A HKK kártyakép jelenleg nem érhető el.") from exc
    media_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if media_type == "image/jpg":
        media_type = "image/jpeg"
    if media_type not in HKK_CARD_IMAGE_MEDIA_TYPES or not response.content or len(response.content) > HKK_CARD_IMAGE_MAX_BYTES:
        raise HTTPException(status_code=502, detail="A HKK kártyakép válasza érvénytelen.")
    return response.content, media_type


def parse_hkk_item(item: object, constants: tuple[frozenset[str], dict[str, str]]) -> dict | None:
    if not isinstance(item, dict):
        return None
    external_id = _hkk_external_id(item.get("ID"))
    name = _hkk_text(item.get("name"), max_length=180)
    if external_id is None or name is None:
        return None
    subtypes, edition_names = constants
    raw_types = _hkk_values(item.get("type"), max_items=50, max_length=120)
    card_subtypes = [value for value in raw_types if value in subtypes]
    card_types = [value for value in raw_types if value not in subtypes and value not in {"--Nincs--", "-"}]
    edition_ids = _hkk_values(item.get("editions"), max_items=100, max_length=20)
    editions = [edition_names.get(edition_id, edition_id) for edition_id in edition_ids]
    return {
        "external_card_id": str(external_id),
        "card_name": str(name),
        "image_url": f"{settings.hkk_catalog_base_url.rstrip('/')}/HKKCardImage.php?{urlencode({'cardID': external_id})}",
        "edition": _joined(editions, 120),
        "card_type": _joined(card_types, 80),
        "subtype": _joined(card_subtypes, 120),
        "color": _joined(_hkk_values(item.get("color"), max_items=50, max_length=80), 80),
        "rarity": _hkk_text(item.get("commonness"), max_length=80),
    }


def search_hkk_cards(query: str, limit: int, edition_id: str | None = None) -> list[dict]:
    try:
        constants = _load_hkk_constants()
        if edition_id is not None and edition_id not in constants[1]:
            raise HTTPException(status_code=404, detail="A HKK kiegészítő nem található.")
        parameters = {"nev": query.strip()}
        if edition_id is not None:
            parameters["kiegeszito"] = edition_id
        response = httpx.get(_hkk_catalog_url("lapkereso/kereses", parameters), timeout=settings.hkk_catalog_request_timeout_seconds)
        response.raise_for_status()
        payload = response.json()
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="A HKK lapkereső jelenleg nem érhető el.") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("cards"), list):
        raise HTTPException(status_code=503, detail="A HKK lapkereső hibás választ adott.")
    results: list[dict] = []
    seen_external_ids: set[str] = set()
    for item in payload["cards"]:
        if edition_id is not None and (not isinstance(item, dict) or edition_id not in _hkk_values(item.get("editions"), max_items=100, max_length=20)):
            continue
        parsed = parse_hkk_item(item, constants)
        if parsed is not None and parsed["external_card_id"] not in seen_external_ids:
            seen_external_ids.add(parsed["external_card_id"])
            results.append(parsed)
        if len(results) >= limit:
            break
    return [{**item, "source_token": sign_card_snapshot(item)} for item in results]


def list_hkk_editions() -> list[dict[str, str]]:
    try:
        _, editions = _load_hkk_constants()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="A HKK lapkereső jelenleg nem érhető el.") from exc
    return [{"id": edition_id, "name": name} for edition_id, name in editions.items()]


def hkk_edition_cards(edition_id: str) -> tuple[dict[str, str], list[dict]]:
    try:
        constants = _load_hkk_constants()
        edition_name = constants[1].get(edition_id)
        if edition_name is None:
            raise HTTPException(status_code=404, detail="A HKK kiegészítő nem található.")
        response = httpx.get(
            _hkk_catalog_url("lapkereso/kereses", {"kiegeszito": edition_id}),
            timeout=settings.hkk_catalog_request_timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="A HKK lapkereső jelenleg nem érhető el.") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("cards"), list):
        raise HTTPException(status_code=503, detail="A HKK lapkereső hibás választ adott.")
    cards: list[dict] = []
    seen_external_ids: set[str] = set()
    for item in payload["cards"]:
        if not isinstance(item, dict) or edition_id not in _hkk_values(item.get("editions"), max_items=100, max_length=20):
            continue
        parsed = parse_hkk_item(item, constants)
        if parsed is None or parsed["external_card_id"] in seen_external_ids:
            continue
        seen_external_ids.add(parsed["external_card_id"])
        cards.append({**parsed, "source_token": sign_card_snapshot(parsed)})
        if len(cards) >= 5000:
            raise HTTPException(status_code=503, detail="A HKK kiegészítő túl sok rekordot adott vissza.")
    return {"id": edition_id, "name": edition_name}, cards


def import_hkk_edition(
    db: Session,
    *,
    user_id: int,
    edition_id: str,
    folder_id: int,
    quantity: int,
    missing_only: bool,
    rarities: list[str] | None = None,
) -> dict:
    edition, cards = hkk_edition_cards(edition_id)
    if rarities is not None:
        selected_rarities = set(rarities) & HKK_RARITIES
        cards = [card for card in cards if str(card.get("rarity") or "").casefold() in selected_rarities]
    account = account_for(db, user_id, lock=True)
    folder = folder_for_user(db, folder_id, user_id, lock=True)
    external_ids = [card["external_card_id"] for card in cards]
    existing_cards = db.scalars(
        select(VaultCollectionCard)
        .where(VaultCollectionCard.user_id == user_id, VaultCollectionCard.external_card_id.in_(external_ids))
        .with_for_update()
    ).all() if external_ids else []
    existing_by_id: dict[str, list[VaultCollectionCard]] = {}
    for existing_card in existing_cards:
        existing_by_id.setdefault(existing_card.external_card_id, []).append(existing_card)
    normal_by_id = {
        external_id: next((card for card in variants if card.print_variant == "normal"), None)
        for external_id, variants in existing_by_id.items()
    }
    new_cards = [card for card in cards if normal_by_id.get(card["external_card_id"]) is None and not (missing_only and existing_by_id.get(card["external_card_id"]))]
    moved_cards = [] if missing_only else [card for card in normal_by_id.values() if card is not None and card.folder_id != folder.id]
    required_slots = len(new_cards) + len(moved_cards)
    free_slots = max(folder.capacity - folder_used(db, folder.id), 0)
    if not account.vault_unlimited and required_slots > free_slots:
        raise HTTPException(status_code=409, detail=f"{required_slots} új zseb szükséges, {free_slots} szabad.")

    added = 0
    updated = 0
    skipped = 0
    for snapshot in cards:
        variants = existing_by_id.get(snapshot["external_card_id"], [])
        existing = normal_by_id.get(snapshot["external_card_id"])
        if missing_only and any(card.quantity > 0 for card in variants):
            skipped += 1
            continue
        values = {key: snapshot[key] for key in ("external_card_id", "card_name", "image_url", "edition", "card_type", "subtype", "color", "rarity")}
        if existing is None:
            db.add(VaultCollectionCard(user_id=user_id, folder_id=folder.id, quantity=quantity, print_variant="normal", **values))
            added += 1
            continue
        existing.folder_id = folder.id
        existing.quantity = quantity
        for key, value in values.items():
            setattr(existing, key, value)
        updated += 1
    db.flush()
    for external_id in set(external_ids):
        refresh = db.scalar(
            select(VaultCollectionCard)
            .where(VaultCollectionCard.user_id == user_id, VaultCollectionCard.external_card_id == external_id, VaultCollectionCard.wanted.is_(True))
            .order_by(VaultCollectionCard.id)
            .with_for_update()
        )
        if refresh is not None:
            owned = min(3, int(db.scalar(select(func.coalesce(func.sum(VaultCollectionCard.quantity), 0)).where(VaultCollectionCard.user_id == user_id, VaultCollectionCard.external_card_id == external_id)) or 0))
            refresh.wanted_quantity = max(3 - owned, 0)
    db.commit()
    return {
        "edition": edition,
        "total_cards": len(cards),
        "added_cards": added,
        "updated_cards": updated,
        "skipped_cards": skipped,
    }


def complete_trade(db: Session, trade: VaultTrade) -> None:
    if not trade.requester_confirmed_at or not trade.owner_confirmed_at or trade.status != "open":
        return
    trade.status = "completed"
    trade.completed_at = utc_now()
    for user_id in (trade.requester_id, trade.owner_id):
        grant_points(db, user_id, 20, "SUCCESSFUL_TRADE", "vault_trade", str(trade.id))
        grant_points(db, user_id, 10, "FIRST_SUCCESSFUL_MATCH", "milestone", "first_successful_match", event_key="milestone:first_successful_match")
