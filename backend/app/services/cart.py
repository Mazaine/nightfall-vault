from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.auction import Auction
from app.models.cart import Cart, CartItem, CheckoutBatch, InventoryReservation
from app.models.transaction import AuctionTransaction, AuctionTransactionItem
from app.models.user import User
from app.services.notifications import create_notification
from app.services.security_audit import create_domain_audit_log
from app.services.dicemagic_access import can_buy_dicemagic

RESERVATION_MINUTES = 60
MAX_RESERVATION_ATTEMPTS = 4


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _price(auction: Auction) -> Decimal:
    value = auction.buy_now_price if auction.buy_now_price is not None else auction.current_price
    return Decimal(value).quantize(Decimal("0.01"))


def _listed_quantity(auction: Auction) -> int:
    if auction.shop_source:
        return min(999, auction.shop_stock) if auction.shop_stock is not None else 999
    return 1 if auction.listing_format == "bundle" else int(auction.vault_quantity or 1)


def _validate_listing(auction: Auction | None, user_id: int) -> Auction:
    if auction is None or auction.deleted_at is not None:
        raise HTTPException(status_code=404, detail="A hirdetés nem található.")
    if auction.shop_source:
        raise HTTPException(status_code=409, detail="A bolti tételhez az adminisztrátori vásárlási folyamat szükséges.")
    if auction.listing_type != "fixed":
        raise HTTPException(status_code=409, detail="Csak fix áras hirdetés tehető kosárba.")
    if auction.status != "active":
        raise HTTPException(status_code=409, detail="A hirdetés már nem vásárolható meg.")
    if auction.seller_id == user_id:
        raise HTTPException(status_code=409, detail="A saját hirdetésedet nem teheted kosárba.")
    return auction


def _validate_underlying_inventory(db: Session, auction: Auction) -> None:
    """Lock and validate all Vault rows behind a listing; bundles are all-or-nothing."""
    from app.models.auction import AuctionBundleItem
    from app.models.vault import VaultCollectionCard, VaultTradeCard

    if auction.listing_format == "bundle":
        rows = list(db.scalars(select(AuctionBundleItem).where(AuctionBundleItem.auction_id == auction.id).order_by(AuctionBundleItem.id).with_for_update()).all())
        for row in rows:
            if row.vault_trade_card_id is not None:
                inventory = db.scalar(select(VaultTradeCard).where(VaultTradeCard.id == row.vault_trade_card_id, VaultTradeCard.user_id == auction.seller_id).with_for_update())
            elif row.vault_collection_card_id is not None:
                inventory = db.scalar(select(VaultCollectionCard).where(VaultCollectionCard.id == row.vault_collection_card_id, VaultCollectionCard.user_id == auction.seller_id).with_for_update())
            else:
                continue
            if inventory is None or inventory.quantity < row.quantity:
                raise HTTPException(status_code=409, detail=f"A csomag egyik tétele már nem elérhető: {row.card_name}.")
        return
    required = _listed_quantity(auction)
    if auction.vault_trade_card_id is not None:
        inventory = db.scalar(select(VaultTradeCard).where(VaultTradeCard.id == auction.vault_trade_card_id, VaultTradeCard.user_id == auction.seller_id).with_for_update())
    elif auction.vault_collection_card_id is not None:
        inventory = db.scalar(select(VaultCollectionCard).where(VaultCollectionCard.id == auction.vault_collection_card_id, VaultCollectionCard.user_id == auction.seller_id).with_for_update())
    else:
        return
    if inventory is None or inventory.quantity < required:
        raise HTTPException(status_code=409, detail="A hirdetés mögötti Vault-készlet már nem elegendő.")


def release_auction_reservations(db: Session, auction_id: int) -> int:
    timestamp = now_utc()
    rows = list(db.scalars(select(InventoryReservation).where(
        InventoryReservation.auction_id == auction_id,
        InventoryReservation.status == "active",
        InventoryReservation.expires_at > timestamp,
    ).with_for_update()).all())
    for row in rows:
        row.status = "released"
        row.released_at = timestamp
        db.add(row)
    return len(rows)


def validate_direct_purchase_reservations(db: Session, auction_id: int, buyer_id: int) -> None:
    """A kosár nem foglal készletet, ezért nem blokkolhat közvetlen vásárlást."""
    return None


def consume_direct_purchase_reservations(db: Session, auction_id: int, buyer_id: int) -> int:
    """Close the buyer's own cart rows when they use the compatible direct buy action."""
    timestamp = now_utc()
    rows = list(db.scalars(select(InventoryReservation).where(
        InventoryReservation.auction_id == auction_id,
        InventoryReservation.user_id == buyer_id,
        InventoryReservation.status == "active",
        InventoryReservation.expires_at > timestamp,
    ).with_for_update()).all())
    for row in rows:
        row.status = "consumed"
        row.released_at = timestamp
        row.cart_item.status = "checked_out"
        db.add(row)
        db.add(row.cart_item)
    cart_item = db.scalar(select(CartItem).join(Cart).where(
        Cart.user_id == buyer_id,
        CartItem.auction_id == auction_id,
        CartItem.status == "active",
    ).with_for_update())
    if cart_item is not None:
        cart_item.status = "checked_out"
        db.add(cart_item)
    return len(rows)

def _get_or_create_cart(db: Session, user_id: int) -> Cart:
    cart = db.scalar(select(Cart).where(Cart.user_id == user_id).with_for_update())
    if cart is None:
        cart = Cart(user_id=user_id)
        db.add(cart)
        db.flush()
    return cart


def expire_reservations(db: Session, *, commit: bool = False) -> int:
    timestamp = now_utc()
    rows = list(db.scalars(select(InventoryReservation).where(
        InventoryReservation.status == "active", InventoryReservation.expires_at <= timestamp,
    ).with_for_update(skip_locked=True)).all())
    for reservation in rows:
        reservation.status = "expired"
        reservation.released_at = timestamp
        db.add(reservation)
    if commit and rows:
        db.commit()
    return len(rows)


def _reserved_by_others(db: Session, auction_id: int, exclude_item_id: int | None = None) -> int:
    statement = select(func.coalesce(func.sum(InventoryReservation.quantity), 0)).where(
        InventoryReservation.auction_id == auction_id,
        InventoryReservation.status == "active",
        InventoryReservation.expires_at > now_utc(),
    )
    if exclude_item_id is not None:
        statement = statement.where(InventoryReservation.cart_item_id != exclude_item_id)
    return int(db.scalar(statement) or 0)


def _available(db: Session, auction: Auction, exclude_item_id: int | None = None) -> int:
    return max(0, _listed_quantity(auction))


def _reserve(db: Session, item: CartItem, auction: Auction, quantity: int, *, explicit_renewal: bool) -> InventoryReservation:
    timestamp = now_utc()
    current = item.reservation
    is_current = current is not None and current.status == "active" and current.expires_at > timestamp
    if explicit_renewal and is_current:
        return current
    if explicit_renewal and item.reservation_attempts >= MAX_RESERVATION_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Ezt a hirdetést túl sokszor foglaltad újra. Próbáld később.")
    if _available(db, auction, item.id) < quantity:
        raise HTTPException(status_code=409, detail="A kért mennyiség már nem elérhető.")
    if current is None:
        current = InventoryReservation(cart_item=item, auction_id=auction.id, user_id=item.cart.user_id, quantity=quantity, starts_at=timestamp, expires_at=timestamp + timedelta(minutes=RESERVATION_MINUTES), status="active")
    else:
        current.quantity = quantity
        current.status = "active"
        current.starts_at = timestamp
        current.expires_at = timestamp + timedelta(minutes=RESERVATION_MINUTES)
        current.released_at = None
    item.reservation_attempts += 1
    db.add_all([item, current])
    return current


def add_cart_item(db: Session, user: User, auction_id: int, quantity: int) -> dict:
    if quantity < 1 or quantity > 9:
        raise HTTPException(status_code=422, detail="A darabszám 1 és 9 közötti lehet.")
    auction = _validate_listing(db.scalar(select(Auction).where(Auction.id == auction_id).with_for_update()), user.id)
    _validate_underlying_inventory(db, auction)
    if auction.listing_format == "bundle" and quantity != 1:
        raise HTTPException(status_code=422, detail="A csomag csak egyben tehető kosárba.")
    cart = _get_or_create_cart(db, user.id)
    item = db.scalar(select(CartItem).where(CartItem.cart_id == cart.id, CartItem.auction_id == auction.id).with_for_update())
    if item is None:
        item = CartItem(cart=cart, auction=auction, quantity=quantity, status="active", price_snapshot=_price(auction))
        db.add(item)
        db.flush()
    else:
        item.status = "active"
        item.quantity = quantity
        item.price_snapshot = _price(auction)
    if _available(db, auction) < quantity:
        raise HTTPException(status_code=409, detail="A kért mennyiség jelenleg nem elérhető.")
    create_domain_audit_log(db, action="cart_item_added", user_id=user.id, auction_id=auction.id, metadata={"quantity": quantity, "inventory_reserved": False})
    db.commit()
    return get_cart(db, user.id)


def update_cart_item(db: Session, user: User, item_id: int, quantity: int, *, accept_price: bool = False) -> dict:
    if quantity < 1 or quantity > 9:
        raise HTTPException(status_code=422, detail="A darabszám 1 és 9 közötti lehet.")
    item = db.scalar(select(CartItem).join(Cart).where(CartItem.id == item_id, Cart.user_id == user.id, CartItem.status == "active").with_for_update())
    if item is None:
        raise HTTPException(status_code=404, detail="A kosártétel nem található.")
    auction = _validate_listing(db.scalar(select(Auction).where(Auction.id == item.auction_id).with_for_update()), user.id)
    _validate_underlying_inventory(db, auction)
    if auction.listing_format == "bundle" and quantity != 1:
        raise HTTPException(status_code=422, detail="A csomag mennyisége nem módosítható.")
    current_price = _price(auction)
    if current_price < item.price_snapshot and not auction.shop_source:
        item.price_snapshot = current_price
        db.add(item)
    if current_price > item.price_snapshot and not accept_price:
        raise HTTPException(status_code=409, detail="A hirdetés ára megváltozott. Fogadd el az új árat a folytatáshoz.")
    if _available(db, auction, item.id) < quantity:
        raise HTTPException(status_code=409, detail="A kért mennyiség már nem elérhető.")
    item.quantity = quantity
    if accept_price or current_price < item.price_snapshot:
        item.price_snapshot = current_price
    db.add(item)
    db.commit()
    return get_cart(db, user.id)


def remove_cart_item(db: Session, user: User, item_id: int) -> dict:
    if item_id in pending_shop_item_ids(db, user.id):
        raise HTTPException(409, "A bolti tétel már előkészített rendeléshez tartozik. Visszavonáshoz egyeztess az ügyfélszolgálattal.")
    item = db.scalar(select(CartItem).join(Cart).where(CartItem.id == item_id, Cart.user_id == user.id, CartItem.status == "active").with_for_update())
    if item is None:
        raise HTTPException(status_code=404, detail="A kosártétel nem található.")
    item.status = "removed"
    if item.reservation is not None and item.reservation.status == "active":
        item.reservation.status = "released"
        item.reservation.released_at = now_utc()
        db.add(item.reservation)
    db.add(item)
    db.commit()
    return get_cart(db, user.id)


def renew_cart_item(db: Session, user: User, item_id: int) -> dict:
    item = db.scalar(select(CartItem).join(Cart).where(CartItem.id == item_id, Cart.user_id == user.id, CartItem.status == "active").with_for_update())
    if item is None:
        raise HTTPException(status_code=404, detail="A kosártétel nem található.")
    auction = _validate_listing(db.scalar(select(Auction).where(Auction.id == item.auction_id).with_for_update()), user.id)
    _validate_underlying_inventory(db, auction)
    if _available(db, auction) < item.quantity:
        raise HTTPException(status_code=409, detail="A kért mennyiség jelenleg nem elérhető.")
    return get_cart(db, user.id)


def _item_state(item: CartItem, timestamp: datetime) -> str:
    return "available"


def _item_dict(db: Session, item: CartItem, timestamp: datetime, pending: bool = False) -> dict:
    auction = item.auction
    state = _item_state(item, timestamp)
    if auction.deleted_at is not None or auction.status != "active":
        state = "listing_removed"
    elif _available(db, auction) <= 0:
        state = "sold_out"
    elif _available(db, auction) < item.quantity:
        state = "quantity_changed"
    current_price = _price(auction)
    if current_price < item.price_snapshot and not auction.shop_source:
        item.price_snapshot = current_price
        db.add(item)
    if pending:
        state = "order_pending"
    cover = next((image for image in auction.images if image.is_cover), auction.images[0] if auction.images else None)
    return {
        "id": item.id, "auction_id": auction.id, "title": auction.title, "seller_id": auction.seller_id,
        "shop_source": auction.shop_source, "stock_tracked": auction.shop_stock is not None,
        "seller_name": auction.seller.full_name or auction.seller.username, "listing_format": auction.listing_format,
        "variant": auction.vault_print_variant, "quantity": item.quantity, "max_quantity": item.quantity if pending else _listed_quantity(auction),
        "unit_price": item.price_snapshot, "current_price": current_price, "subtotal": item.price_snapshot * item.quantity,
        "price_changed": current_price != item.price_snapshot if auction.shop_source else current_price > item.price_snapshot, "state": state,
        "reservation_expires_at": None,
        "image_url": auction.shop_image_url or ((cover.list_storage_key or cover.thumbnail_storage_key or cover.storage_key) if cover else None),
        "external_card_id": auction.vault_external_card_id,
        "bundle_items": [{"card_name": row.card_name, "quantity": row.quantity, "external_card_id": row.external_card_id, "image_url": row.image_url} for row in auction.bundle_items],
    }


def get_cart(db: Session, user_id: int) -> dict:
    expire_reservations(db)
    cart = db.scalar(select(Cart).where(Cart.user_id == user_id))
    timestamp = now_utc()
    if cart is None:
        return {"items": [], "item_count": 0, "total": Decimal("0"), "server_time": timestamp}
    items = list(db.scalars(select(CartItem).where(CartItem.cart_id == cart.id, CartItem.status == "active").options(
        joinedload(CartItem.reservation), joinedload(CartItem.auction).joinedload(Auction.seller), joinedload(CartItem.auction).selectinload(Auction.images), joinedload(CartItem.auction).selectinload(Auction.bundle_items),
    ).order_by(CartItem.created_at, CartItem.id)).unique().all())
    viewer = db.get(User, user_id)
    pending_ids = pending_shop_item_ids(db, user_id) if can_buy_dicemagic(viewer) else set()
    result = [_item_dict(db, item, timestamp, item.id in pending_ids) for item in items if not item.auction.shop_source or can_buy_dicemagic(viewer)]
    resume_key = None
    if pending_ids:
        from app.models.dicemagic import DiceMagicCheckoutAttempt, DiceMagicOrder
        attempts = db.execute(select(DiceMagicCheckoutAttempt.idempotency_key, DiceMagicOrder.cart_item_ids)
            .join(DiceMagicOrder, DiceMagicCheckoutAttempt.shop_order_id == DiceMagicOrder.id)
            .where(DiceMagicCheckoutAttempt.buyer_id == user_id, DiceMagicOrder.buyer_id == user_id,
                   DiceMagicOrder.status.in_(["queued", "sending", "unknown"]))
            .order_by(DiceMagicCheckoutAttempt.id.desc())).all()
        active_ids = {row["id"] for row in result}
        resume_key = next((key for key, ids in attempts if active_ids.intersection(ids)), None)
    db.commit()
    return {"items": result, "item_count": len(result), "total": sum((row["subtotal"] for row in result), Decimal("0")), "server_time": timestamp, "checkout_resume_key": resume_key}


def pending_shop_item_ids(db: Session, user_id: int) -> set[int]:
    from app.models.dicemagic import DiceMagicOrder
    return {item_id for ids in db.scalars(select(DiceMagicOrder.cart_item_ids).where(DiceMagicOrder.buyer_id == user_id, DiceMagicOrder.status.in_(["queued", "sending", "unknown"]))) for item_id in ids}


def _sold_snapshot(db: Session, auction: Auction, buyer_id: int, quantity: int, *, shop_order_key: str | None = None) -> Auction:
    if auction.shop_source:
        if not shop_order_key:
            raise HTTPException(409, "Bolti eladás csak igazolt partner-rendelésből rögzíthető.")
        # Reuse the existing historical listing snapshot pattern. Never mutate
        # the live shop listing or an earlier sale, and never attach Vault stock.
        sold = Auction(seller_id=auction.seller_id, creation_key=str(uuid4()), listing_type="fixed", listing_format="single",
            shop_source=auction.shop_source, shop_stock=0, shop_image_url=auction.shop_image_url,
            shop_edition=auction.shop_edition, shop_variant=auction.shop_variant, shop_regular_price=auction.shop_regular_price,
            vault_external_card_id=auction.vault_external_card_id, vault_print_variant=auction.vault_print_variant,
            title=auction.title, description=auction.description, category=auction.category, condition=auction.condition,
            status="sold", starting_price=0, bid_increment=1, current_price=auction.current_price,
            buy_now_enabled=True, buy_now_price=auction.buy_now_price, starts_at=auction.starts_at, ends_at=auction.ends_at,
            five_minute_rule_enabled=False, winner_id=buyer_id, seller_declaration_accepted_at=auction.seller_declaration_accepted_at,
            seller_declaration_version=auction.seller_declaration_version, finalized_at=now_utc())
        db.add(sold)
        db.flush()
        return sold
    total = _listed_quantity(auction)
    if auction.listing_format == "bundle" or quantity == total:
        if auction.listing_format != "bundle":
            auction.vault_quantity = None
        auction.status = "sold"
        auction.winner_id = buyer_id
        auction.finalized_at = now_utc()
        db.add(auction)
        return auction
    auction.vault_quantity = total - quantity
    sold = Auction(
        seller_id=auction.seller_id, creation_key=str(uuid4()), batch_key=auction.batch_key,
        listing_type="fixed", listing_format="single", vault_collection_card_id=auction.vault_collection_card_id,
        vault_trade_card_id=auction.vault_trade_card_id, vault_external_card_id=auction.vault_external_card_id,
        vault_print_variant=auction.vault_print_variant, vault_quantity=quantity, vault_inventory_deducted=False,
        title=auction.title, description=auction.description, external_link_label=auction.external_link_label,
        external_link_url=auction.external_link_url, category=auction.category, hatalom_era=auction.hatalom_era,
        condition=auction.condition, has_printing_error=auction.has_printing_error,
        printing_error_description=auction.printing_error_description, status="sold", starting_price=auction.starting_price,
        bid_increment=auction.bid_increment, current_price=auction.current_price, buy_now_enabled=True,
        buy_now_price=auction.buy_now_price, reserve_price=None, starts_at=auction.starts_at, ends_at=auction.ends_at,
        five_minute_rule_enabled=auction.five_minute_rule_enabled, winner_id=buyer_id,
        seller_declaration_accepted_at=auction.seller_declaration_accepted_at,
        seller_declaration_version=auction.seller_declaration_version, finalized_at=now_utc(),
    )
    db.add_all([auction, sold])
    db.flush()
    return sold


def _checkout_result(batch: CheckoutBatch) -> dict:
    transactions = [{"id": row.id, "seller_id": row.seller_id, "auction_id": row.auction_id, "item_count": len(row.items)} for row in batch.transactions]
    return {"checkout_batch_id": batch.id, "transaction_count": len(transactions), "seller_count": batch.seller_count, "item_count": batch.item_count, "total": batch.total_amount, "transactions": transactions}


def checkout_cart(db: Session, user: User, idempotency_key: str, item_ids: list[int] | None = None, *, shop_details=None, confirm_real_order=False) -> dict:
    from app.services.dicemagic_checkout import checkout_with_shop
    return checkout_with_shop(db, user, idempotency_key, item_ids, shop_details, confirm_real_order, checkout_private_cart)


def checkout_private_cart(db: Session, user: User, idempotency_key: str, item_ids: list[int] | None = None) -> dict:
    if not idempotency_key.strip():
        raise HTTPException(status_code=422, detail="Az idempotenciakulcs kötelező.")
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": f"cart-checkout:{user.id}:{idempotency_key}"})
    existing = db.scalar(select(CheckoutBatch).where(CheckoutBatch.buyer_id == user.id, CheckoutBatch.idempotency_key == idempotency_key).options(selectinload(CheckoutBatch.transactions).selectinload(AuctionTransaction.items)))
    if existing is not None:
        return _checkout_result(existing)
    cart = db.scalar(select(Cart).where(Cart.user_id == user.id).with_for_update())
    if cart is None:
        raise HTTPException(status_code=409, detail="A kosár üres.")
    statement = select(CartItem).where(CartItem.cart_id == cart.id, CartItem.status == "active")
    if item_ids is not None:
        statement = statement.where(CartItem.id.in_(item_ids))
    items = list(db.scalars(statement.options(selectinload(CartItem.reservation)).order_by(CartItem.auction_id).with_for_update()).all())
    if not items:
        raise HTTPException(status_code=409, detail="Nincs véglegesíthető kosártétel.")
    auctions = {row.id: row for row in db.scalars(select(Auction).where(Auction.id.in_([item.auction_id for item in items])).order_by(Auction.id).with_for_update().execution_options(populate_existing=True)).all()}
    timestamp = now_utc()
    for item in items:
        auction = _validate_listing(auctions.get(item.auction_id), user.id)
        _validate_underlying_inventory(db, auction)
        if _price(auction) > item.price_snapshot:
            raise HTTPException(status_code=409, detail=f"A(z) {auction.title} ára megváltozott. Előbb fogadd el az új árat.")
        if _price(auction) < item.price_snapshot:
            item.price_snapshot = _price(auction)
            db.add(item)
        if _available(db, auction) < item.quantity:
            raise HTTPException(status_code=409, detail=f"A(z) {auction.title} kért mennyisége már nem elérhető.")
    grouped: dict[int, list[tuple[CartItem, Auction, Auction]]] = defaultdict(list)
    for item in items:
        source = auctions[item.auction_id]
        sold = _sold_snapshot(db, source, user.id, item.quantity)
        grouped[source.seller_id].append((item, source, sold))
    total = sum((item.price_snapshot * item.quantity for item in items), Decimal("0"))
    batch = CheckoutBatch(buyer_id=user.id, idempotency_key=idempotency_key, total_amount=total, seller_count=len(grouped), item_count=len(items))
    db.add(batch)
    db.flush()
    for seller_id, rows in grouped.items():
        anchor = rows[0][2]
        transaction = AuctionTransaction(auction_id=anchor.id, checkout_batch_id=batch.id, seller_id=seller_id, buyer_id=user.id, status="transaction_open")
        db.add(transaction)
        db.flush()
        from app.services.transaction_conversations import ensure_transaction_conversation
        ensure_transaction_conversation(db, transaction)
        for item, source, sold in rows:
            db.add(AuctionTransactionItem(transaction_id=transaction.id, auction_id=sold.id, source_auction_id=source.id, quantity=item.quantity, unit_price=item.price_snapshot, title_snapshot=sold.title))
            item.status = "checked_out"
            if item.reservation is not None:
                item.reservation.status = "consumed"
                item.reservation.released_at = timestamp
                db.add(item.reservation)
            db.add(item)
        create_notification(db, user_id=seller_id, auction_id=anchor.id, notification_type="purchase_intent_created", title="Új vásárlási szándék", message=f"{user.full_name or user.username} {len(rows)} tételt szeretne megvásárolni.", target_url="/account/transactions", event_key=f"checkout-seller:{batch.id}:{seller_id}")
        create_domain_audit_log(db, action="cart_checkout_transaction_created", user_id=user.id, auction_id=anchor.id, metadata={"checkout_batch_id": batch.id, "transaction_id": transaction.id, "item_count": len(rows)})
    create_notification(db, user_id=user.id, auction_id=next(iter(grouped.values()))[0][2].id, notification_type="purchase_intent_confirmed", title="Vásárlási szándék véglegesítve", message=f"{len(grouped)} eladóval {len(items)} tételhez jött létre ügylet.", target_url="/account/transactions", event_key=f"checkout-buyer:{batch.id}:{user.id}")
    db.commit()
    loaded = db.scalar(select(CheckoutBatch).where(CheckoutBatch.id == batch.id).options(selectinload(CheckoutBatch.transactions).selectinload(AuctionTransaction.items)))
    return _checkout_result(loaded)
