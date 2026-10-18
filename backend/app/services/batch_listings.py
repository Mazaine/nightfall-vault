from datetime import timedelta
from decimal import Decimal
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.auction import Auction, AuctionBundleItem
from app.models.user import User
from app.models.vault import VaultCollectionCard, VaultTradeCard
from app.schemas.auction import BatchFixedListingCreate
from app.services.auction_lifecycle import SELLER_DECLARATION_VERSION, now_utc
from app.services.moderation_actions import require_no_restriction
from app.services.security_audit import create_domain_audit_log

RESERVING_STATUSES = ("draft", "scheduled", "active", "sold")


def _reserved_quantity(db: Session, card_id: int) -> int:
    singles = int(db.scalar(select(func.coalesce(func.sum(Auction.vault_quantity), 0)).where(
        Auction.vault_collection_card_id == card_id,
        Auction.status.in_(RESERVING_STATUSES),
        Auction.deleted_at.is_(None),
        Auction.vault_inventory_deducted.is_(False),
    )) or 0)
    bundles = int(db.scalar(select(func.coalesce(func.sum(AuctionBundleItem.quantity), 0)).join(
        Auction, Auction.id == AuctionBundleItem.auction_id,
    ).where(
        AuctionBundleItem.vault_collection_card_id == card_id,
        Auction.status.in_(RESERVING_STATUSES),
        Auction.deleted_at.is_(None),
        Auction.vault_inventory_deducted.is_(False),
    )) or 0)
    return singles + bundles


def _reserved_trade_quantity(db: Session, card_id: int) -> int:
    singles = int(db.scalar(select(func.coalesce(func.sum(Auction.vault_quantity), 0)).where(
        Auction.vault_trade_card_id == card_id,
        Auction.status.in_(RESERVING_STATUSES),
        Auction.deleted_at.is_(None),
        Auction.vault_inventory_deducted.is_(False),
    )) or 0)
    bundles = int(db.scalar(select(func.coalesce(func.sum(AuctionBundleItem.quantity), 0)).join(
        Auction, Auction.id == AuctionBundleItem.auction_id,
    ).where(
        AuctionBundleItem.vault_trade_card_id == card_id,
        Auction.status.in_(RESERVING_STATUSES),
        Auction.deleted_at.is_(None),
        Auction.vault_inventory_deducted.is_(False),
    )) or 0)
    return singles + bundles


def _fixed_auction(*, seller: User, title: str, description: str, price: int, condition: str, creation_key: str, batch_key: str, listing_format: str, card: VaultCollectionCard | VaultTradeCard | None = None, quantity: int | None = None, inventory_kind: str | None = None) -> Auction:
    now = now_utc()
    money = Decimal(price).quantize(Decimal("0.01"))
    return Auction(
        seller_id=seller.id, creation_key=creation_key, batch_key=batch_key,
        listing_type="fixed", listing_format=listing_format,
        vault_collection_card_id=card.id if card and inventory_kind == "collection" else None,
        vault_trade_card_id=card.id if card and inventory_kind == "trade" else None,
        vault_external_card_id=card.external_card_id if card else None,
        vault_print_variant=card.print_variant if card else None,
        vault_quantity=quantity if card else None,
        title=title, description=description, category="Hatalom Kártyái Kártyajáték",
        condition=condition, status="active", starting_price=Decimal("0.00"),
        bid_increment=money, current_price=money, buy_now_enabled=True, buy_now_price=money,
        starts_at=now, ends_at=now + timedelta(days=30), five_minute_rule_enabled=False,
        seller_declaration_accepted_at=now, seller_declaration_version=SELLER_DECLARATION_VERSION,
    )


def create_fixed_listing_batch(db: Session, payload: BatchFixedListingCreate, seller: User) -> list[Auction]:
    require_no_restriction(db, seller.id, "auction_creation_ban")
    if seller.deleted_at is not None or not seller.is_active:
        raise HTTPException(status_code=403, detail="Ez a felhasználói fiók inaktív.")
    existing = list(db.scalars(select(Auction).options(selectinload(Auction.bundle_items)).where(
        Auction.seller_id == seller.id, Auction.batch_key == payload.creation_key, Auction.deleted_at.is_(None),
    ).order_by(Auction.id)).all())
    expected = len(payload.items) if payload.mode == "individual" else 1
    if existing:
        if len(existing) != expected:
            raise HTTPException(status_code=409, detail="A köteg korábbi véglegesítése hiányos; ügyfélszolgálati ellenőrzés szükséges.")
        return existing

    ids = sorted(item.vault_collection_card_id for item in payload.items if item.vault_collection_card_id is not None)
    trade_ids = sorted(item.vault_trade_card_id for item in payload.items if item.vault_trade_card_id is not None)
    cards = list(db.scalars(select(VaultCollectionCard).where(
        VaultCollectionCard.id.in_(ids), VaultCollectionCard.user_id == seller.id,
    ).order_by(VaultCollectionCard.id).with_for_update()).all())
    by_id = {card.id: card for card in cards}
    trade_cards = list(db.scalars(select(VaultTradeCard).where(
        VaultTradeCard.id.in_(trade_ids), VaultTradeCard.user_id == seller.id,
    ).order_by(VaultTradeCard.id).with_for_update()).all()) if trade_ids else []
    trade_by_id = {card.id: card for card in trade_cards}
    errors: list[dict[str, object]] = []
    for index, item in enumerate(payload.items):
        is_trade = item.vault_trade_card_id is not None
        card = trade_by_id.get(item.vault_trade_card_id) if is_trade else by_id.get(item.vault_collection_card_id)
        if card is None:
            errors.append({"index": index, "card_id": item.vault_trade_card_id if is_trade else item.vault_collection_card_id, "message": "A saját Vault-készlet nem található."})
            continue
        available = max(card.quantity - (_reserved_trade_quantity(db, card.id) if is_trade else _reserved_quantity(db, card.id)), 0)
        if item.quantity > available:
            errors.append({"index": index, "card_id": card.id, "message": f"Csak {available} szabad példány hirdethető meg."})
    if errors:
        raise HTTPException(status_code=409, detail={"message": "A köteg nem véglegesíthető.", "items": errors})

    created: list[Auction] = []
    try:
        if payload.mode == "individual":
            namespace = UUID(payload.creation_key)
            for item in payload.items:
                is_trade = item.vault_trade_card_id is not None
                card = trade_by_id[item.vault_trade_card_id] if is_trade else by_id[item.vault_collection_card_id]
                auction = _fixed_auction(
                    seller=seller, title=card.card_name, description=item.description,
                    price=item.final_price, condition=item.condition,
                    creation_key=str(uuid5(namespace, f"vault-{'trade' if is_trade else 'collection'}-card:{card.id}")), batch_key=payload.creation_key,
                    listing_format="single", card=card, quantity=item.quantity, inventory_kind="trade" if is_trade else "collection",
                )
                db.add(auction); db.flush(); created.append(auction)
        else:
            auction = _fixed_auction(
                seller=seller, title=payload.bundle_name or "HKK csomag",
                description=payload.bundle_description or "HKK lapcsomag.",
                price=int(payload.bundle_price or 0), condition="NM",
                creation_key=payload.creation_key, batch_key=payload.creation_key, listing_format="bundle",
            )
            db.add(auction); db.flush()
            for item in payload.items:
                is_trade = item.vault_trade_card_id is not None
                card = trade_by_id[item.vault_trade_card_id] if is_trade else by_id[item.vault_collection_card_id]
                db.add(AuctionBundleItem(
                    auction_id=auction.id,
                    vault_trade_card_id=card.id if is_trade else None,
                    vault_collection_card_id=None if is_trade else card.id,
                    external_card_id=card.external_card_id, card_name=card.card_name,
                    edition=card.edition, image_url=card.image_url, print_variant=card.print_variant,
                    quantity=item.quantity, unit_price=Decimal(item.base_price).quantize(Decimal("0.01")),
                ))
            created.append(auction)
        for auction in created:
            create_domain_audit_log(db, action="fixed_listing_batch_created", user_id=seller.id, auction_id=auction.id, metadata={"batch_key": payload.creation_key, "mode": payload.mode})
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = list(db.scalars(select(Auction).options(selectinload(Auction.bundle_items)).where(
            Auction.seller_id == seller.id, Auction.batch_key == payload.creation_key, Auction.deleted_at.is_(None),
        ).order_by(Auction.id)).all())
        if len(existing) == expected:
            return existing
        raise HTTPException(status_code=409, detail="A köteg párhuzamos véglegesítése ütközött; próbáld újra.")
    return list(db.scalars(select(Auction).options(selectinload(Auction.seller), selectinload(Auction.images), selectinload(Auction.bundle_items)).where(Auction.id.in_([item.id for item in created])).order_by(Auction.id)).all())
