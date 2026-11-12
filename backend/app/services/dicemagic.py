"""Conservative partner inventory: an order blocks its products until manual reconciliation.

The API has no stock revision/order status endpoint. A later snapshot therefore cannot
prove whether it includes our order; never automatically release that hold.
"""
from datetime import datetime, timedelta, timezone
from copy import deepcopy
from decimal import Decimal
from uuid import uuid4
from urllib.parse import urlsplit
from fastapi import HTTPException
from sqlalchemy import func, select, text
from app.core.config import settings
from app.services.dicemagic_access import can_buy_dicemagic
from app.models.auction import Auction
from app.models.cart import Cart, CartItem
from app.models.dicemagic import DiceMagicState, DiceMagicProduct, DiceMagicOrder, DiceMagicSyncLog, DiceMagicOrderHold
from app.models.user import User
from app.services.dicemagic_client import client, DiceMagicError
from app.services.security_audit import create_domain_audit_log

# Deliberately non-hash sentinel: this disabled integration account cannot authenticate.
DISABLED_INTEGRATION_PASSWORD_HASH = "!disabled-integration-account"


def utcnow():
    return datetime.now(timezone.utc)


def state(db):
    row = db.get(DiceMagicState, 1)
    if row is None:
        row = DiceMagicState(id=1, sync_enabled=settings.dicemagic_sync_enabled, orders_enabled=False, summary={})
        db.add(row)
        db.flush()
    return row


def valid_image(value):
    if not value:
        return None
    parsed = urlsplit(value)
    # No server-side download of partner URLs.
    return value if parsed.scheme == "https" and parsed.hostname and not parsed.username else None


def normalize(item):
    required = {"outer_id", "product_id", "variant_id", "name", "type", "quantity", "price", "in_stock", "currency"}
    if not isinstance(item, dict) or not required.issubset(item):
        raise DiceMagicError("incomplete_snapshot")
    if item["type"] not in {"card", "booster"} or item["currency"] != "HUF" or not isinstance(item["in_stock"], bool):
        raise DiceMagicError("invalid_snapshot")
    if any(not isinstance(item[key], str) or not item[key].strip() for key in ["outer_id", "product_id", "variant_id", "name"]):
        raise DiceMagicError("invalid_identifier")
    quantity = item["quantity"]
    if not isinstance(quantity, str) or (quantity != "" and not quantity.isdecimal()):
        raise DiceMagicError("invalid_stock")
    stock = None if quantity == "" else int(quantity)
    def amount(value):
        return int(value) if isinstance(value, str) and value.isdecimal() and 0 < int(value) <= 999999999 else None
    regular = amount(item["price"])
    price = regular
    if str(item.get("is_action")) == "1":
        try:
            start = datetime.fromisoformat(item["action_start"]) if item.get("action_start") else None
            end = datetime.fromisoformat(item["action_end"]) if item.get("action_end") else None
            if start and start.tzinfo is None or end and end.tzinfo is None:
                raise ValueError()
            if (not start or start <= utcnow()) and (not end or utcnow() < end):
                price = amount(item.get("action_price"))
        except (ValueError, TypeError):
            price = None
    variant = {"normal": "normal", "foil": "foil", "full_art": "fa"}.get(item.get("graphic_type"))
    # 'golden' stays explicit and is never silently treated as GFA.
    return stock, price, regular, variant


def sync_products(db, *, force=False):
    if not settings.dicemagic_enabled:
        raise DiceMagicError("integration_disabled", 409)
    if not db.scalar(text("SELECT pg_try_advisory_xact_lock(73624054)")):
        raise DiceMagicError("sync_in_progress", 409)
    config = state(db)
    if config.last_sync_at and utcnow() - config.last_sync_at < timedelta(seconds=300):
        return config.summary
    last_attempt = db.scalar(select(DiceMagicSyncLog.created_at).order_by(DiceMagicSyncLog.id.desc()).limit(1))
    if last_attempt and utcnow() - last_attempt < timedelta(seconds=300):
        return config.summary
    data = client.products()
    if not isinstance(data, dict) or data.get("type") != "all" or not isinstance(data.get("items"), list) or data.get("count") != len(data["items"]) or not data.get("generated_at"):
        raise DiceMagicError("incomplete_snapshot")
    items = data["items"]
    try:
        generated_at = datetime.fromisoformat(data["generated_at"].replace("Z", "+00:00"))
        if generated_at.tzinfo is None or generated_at > utcnow()+timedelta(minutes=2):
            raise ValueError()
    except (ValueError, TypeError, AttributeError):
        raise DiceMagicError("invalid_snapshot_timestamp") from None
    if not items:
        raise DiceMagicError("empty_snapshot_requires_review")
    normalized = [normalize(item) for item in items]
    if len({row["outer_id"] for row in items}) != len(items):
        raise DiceMagicError("duplicate_snapshot_ids")
    seller = db.scalar(select(User).where(User.username == "dicemagic_shop"))
    if seller is None:
        seller = User(username="dicemagic_shop", full_name="DiceMagic", email="dicemagic-integration@nightfall.invalid", password_hash=DISABLED_INTEGRATION_PASSWORD_HASH, password_login_enabled=False, role="user", is_active=False, is_email_verified=False, vip_lifetime=True)
        db.add(seller)
        db.flush()
    elif seller.email != "dicemagic-integration@nightfall.invalid" or seller.password_login_enabled or seller.is_active:
        raise DiceMagicError("dicemagic_integration_identity_conflict", 409)
    seller.vip_lifetime = True
    existing = {p.outer_id: p for p in db.scalars(select(DiceMagicProduct).order_by(DiceMagicProduct.id).with_for_update()).all()}
    if any(p.snapshot_generated_at and generated_at < p.snapshot_generated_at for p in existing.values()):
        raise DiceMagicError("older_snapshot_rejected")
    summary = {"new": 0, "updated": 0, "inactive": 0, "cards": 0, "boosters": 0, "active": 0, "out_of_stock": 0}
    for raw, (stock, price, regular, variant) in zip(items, normalized):
        # The partner's structured product type is authoritative.
        # Each booster/display is one sealed sellable unit, not individual cards.
        listing_format = "bundle" if raw["type"] == "booster" else "single"
        product = existing.pop(raw["outer_id"], None)
        if product is None:
            auction = Auction(seller_id=seller.id, creation_key=str(uuid4()), listing_type="fixed", listing_format="single", title=raw["name"][:180], description="DiceMagic bolti termék. Átutalás és átvétel egyeztetése a bolttal.", category="Hatalom Kártyái Kártyajáték", condition="NM", status="active", starting_price=0, bid_increment=1, current_price=price or 1, buy_now_enabled=True, buy_now_price=price or 1, starts_at=utcnow(), ends_at=utcnow()+timedelta(days=36500), seller_declaration_accepted_at=utcnow(), seller_declaration_version="dicemagic-v1", shop_source="dicemagic")
            db.add(auction)
            db.flush()
            product = DiceMagicProduct(outer_id=raw["outer_id"], auction_id=auction.id, snapshot=raw, stock_blocked=False)
            db.add(product)
            summary["new"] += 1
        else:
            auction = db.get(Auction, product.auction_id)
            summary["updated"] += int(product.snapshot != raw)
        active = bool(price and raw["in_stock"] and stock != 0)
        product.snapshot, product.stock, product.active, product.synced_at = raw, stock, active, utcnow()
        product.snapshot_generated_at = generated_at
        auction.listing_format = listing_format
        auction.title = raw["name"][:180]
        auction.shop_edition = raw.get("edition")
        auction.shop_variant = raw.get("graphic_type")
        auction.shop_regular_price = regular
        auction.shop_image_url = valid_image(raw.get("image_url") or raw.get("picture_file"))
        effective_stock = min(stock, product.stock_ceiling) if stock is not None and product.stock_ceiling is not None else stock
        if stock is None and product.stock_ceiling is not None:
            effective_stock = 0  # A tracking-mode change cannot bypass an established ceiling.
        auction.shop_stock = 0 if product.stock_blocked or not active else effective_stock
        auction.status = "active" if active else "suspended"
        if price:
            auction.current_price = auction.buy_now_price = Decimal(price)
        card_id = raw.get("hkk_card_id")
        auction.vault_external_card_id = str(int(card_id)) if raw["type"] == "card" and str(card_id).isdecimal() and int(card_id) > 0 else None
        auction.vault_print_variant = variant
        summary["cards" if raw["type"] == "card" else "boosters"] += 1
        summary["active"] += int(active)
        summary["out_of_stock"] += int(not active)
    for product in existing.values():
        product.active = False
        db.get(Auction, product.auction_id).shop_stock = 0
        db.get(Auction, product.auction_id).status = "suspended"
        summary["inactive"] += 1
    config.last_sync_at, config.last_error, config.summary = utcnow(), None, summary
    db.add(DiceMagicSyncLog(summary=summary))
    db.commit()
    return summary


def sync_if_due(db):
    if not settings.dicemagic_enabled:
        return
    config = state(db)
    if not config.sync_enabled:
        db.commit()
        return
    if config.last_sync_at and utcnow() - config.last_sync_at < timedelta(seconds=settings.dicemagic_sync_interval_seconds):
        return
    try:
        sync_products(db)
    except DiceMagicError as exc:
        db.rollback()
        state(db).last_error = exc.code
        db.add(DiceMagicSyncLog(summary={"error": exc.code}))
        db.commit()


def order_read(order):
    return {"id": order.id, "external_order_id": order.external_order_id, "status": order.status, "shop_order_id": (order.response or {}).get("shop_order_id"), "transaction_id": order.transaction_id, "error": order.error, "total": order.payload["items_total_huf"], "items": order.payload["items"], "note": order.payload.get("note", ""), "payment_status": "not_processed_by_platform"}


def prepare_order(db, user, key, items, details):
    from app.schemas.dicemagic import ShopCheckout
    if not can_buy_dicemagic(user):
        raise HTTPException(404, "A bolti termék nem található.")
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": "dicemagic:"+str(user.id)+":"+key})
    existing = db.scalar(select(DiceMagicOrder).where(DiceMagicOrder.buyer_id == user.id, DiceMagicOrder.idempotency_key == key))
    if existing:
        return existing
    # Preparation is a local, consented intent, not partner HTTP. The environment
    # and admin real-order switches remain mandatory in send_order itself.
    if not settings.dicemagic_enabled:
        raise HTTPException(409, "A DiceMagic-integráció nincs engedélyezve.")
    details = ShopCheckout.model_validate(details)
    if user.role != "admin" and details.test_order:
        raise HTTPException(422, "Tesztrendelést csak adminisztrátor adhat fel.")
    if not 1 <= len(items) <= 100:
        raise HTTPException(422, "Legfeljebb 100 bolti tétel rendelhető.")
    if user.role != "admin":
        # Stop public unsubmitted checkouts from blocking arbitrary inventory.
        if not settings.dicemagic_real_order_enabled or not state(db).orders_enabled:
            raise HTTPException(409, "A bolti rendelésküldés jelenleg nem elérhető.")
        if len(items) > 30:
            raise HTTPException(422, "Egyszerre legfeljebb 30 különböző bolti tétel rendelhető.")
        pending = int(db.scalar(select(func.count(DiceMagicOrder.id)).where(
            DiceMagicOrder.buyer_id == user.id,
            DiceMagicOrder.status.in_(("queued", "sending", "unknown")),
        )) or 0)
        if pending:
            raise HTTPException(409, "Előbb a már folyamatban lévő bolti rendelésedet fejezd be.")
    lines, holds = [], []
    for item in sorted(items, key=lambda row: row.auction_id):
        if not 1 <= item.quantity <= 999:
            raise HTTPException(422, "A bolti darabszám 1–999 lehet.")
        product = db.scalar(select(DiceMagicProduct).where(DiceMagicProduct.auction_id == item.auction_id).with_for_update().execution_options(populate_existing=True))
        auction = db.scalar(select(Auction).where(Auction.id == item.auction_id).with_for_update().execution_options(populate_existing=True))
        if product is None or not product.active or product.stock_blocked or auction.status != "active" or auction.deleted_at is not None or (auction.shop_stock is not None and auction.shop_stock < item.quantity):
            raise HTTPException(409, "A bolti készlet megváltozott vagy ellenőrzés alatt áll.")
        if auction.buy_now_price != item.price_snapshot:
            raise HTTPException(409, "A bolti ár megváltozott. Fogadd el az új árat.")
        raw = product.snapshot
        price = int(auction.buy_now_price)
        lines.append({"outer_id": product.outer_id, "product_id": raw["product_id"], "variant_id": raw["variant_id"], "name": raw["name"], "quantity": item.quantity, "unit_price_huf": price, "line_total_huf": price*item.quantity})
        holds.append((product, item.quantity, auction.shop_stock))
        product.stock_blocked = True
        auction.shop_stock = 0
    payload = details.model_dump(mode="json", exclude={"test_order", "confirm_real_order", "consent_data_transfer"}, exclude_none=True)
    payload["buyer"]["display_name"] = user.username
    if details.test_order:
        payload["note"] = "TESZTVÁSÁRLÁS – Nightfall Vault integrációs teszt\n" + details.note
    payload.update(external_order_id="NV-DM-"+str(uuid4()), created_at=utcnow().isoformat(), order_status="placed", payment_status="not_processed_by_platform", currency="HUF", items=lines, items_total_huf=sum(line["line_total_huf"] for line in lines), shipping_fee_huf=None, payable_total_huf=None)
    order = DiceMagicOrder(buyer_id=user.id, idempotency_key=key, external_order_id=payload["external_order_id"], payload=payload, cart_item_ids=[item.id for item in items], status="queued")
    db.add(order)
    db.flush()
    for product, quantity, baseline in holds:
        db.add(DiceMagicOrderHold(order_id=order.id, product_id=product.id, quantity=quantity, baseline_stock=baseline))
    db.commit()  # durable intent before any external side effect
    return order


def send_order(db, order_id, user, *, admin_override=False):
    if not can_buy_dicemagic(user):
        raise HTTPException(404, "A rendelés nem található.")
    if admin_override and user.role != "admin":
        raise HTTPException(403, "A rendeléshez adminisztrátori jogosultság szükséges.")
    # Staff can send/retry a customer's prepared order, but a normal buyer may
    # only send their own. Keep the original buyer for all transactions.
    statement = select(DiceMagicOrder).where(DiceMagicOrder.id == order_id)
    if not admin_override:
        statement = statement.where(DiceMagicOrder.buyer_id == user.id)
    statement = statement.with_for_update().execution_options(populate_existing=True)
    order = db.scalar(statement)
    if order is None:
        raise HTTPException(404, "A rendelés nem található.")
    if admin_override and order.buyer_id != user.id:
        buyer = db.get(User, order.buyer_id)
        if buyer is None or buyer.role == "admin":
            raise HTTPException(404, "A rendelés nem található.")
    buyer_id = order.buyer_id
    if order.status == "accepted":
        from app.services.dicemagic_transactions import link_accepted_order
        link_accepted_order(db, order)
        db.commit()
        return order_read(order)
    if order.status == "sending":
        if utcnow() - order.updated_at < timedelta(minutes=2):
            raise HTTPException(409, "A rendelés küldése folyamatban.")
        order.status = "unknown"
    if order.status in {"rejected", "cancelled"}:
        raise HTTPException(409, "Az elutasított rendelés felülvizsgálatot igényel.")
    if order.status not in {"queued", "prepared", "unknown", "sending"}:
        raise HTTPException(409, "A rendelés állapota felülvizsgálatot igényel.")
    if order.next_attempt_at and order.next_attempt_at > utcnow():
        raise HTTPException(429, "Az újrapróbálkozás várakozik.")
    if not settings.dicemagic_real_order_enabled or not state(db).orders_enabled:
        raise HTTPException(409, "A valódi rendelésküldés nincs engedélyezve.")
    order.status, order.attempts, order.updated_at = "sending", order.attempts+1, utcnow()
    order.last_sent_at = order.updated_at
    # The persisted attempt counter is a fencing token. Freeze request data before
    # commit so no lazy reload/transaction remains open during partner HTTP.
    attempt = order.attempts
    payload = deepcopy(order.payload)
    db.commit()
    accepted_response = None
    outcome, error = "unknown", "network_result_unknown"
    try:
        response = client.authorized("POST", "orders", json=payload)
        result = response.json()
        accepted = isinstance(result, dict) and response.status_code in {200, 201} and result.get("accepted") is True and result.get("external_order_id") == payload["external_order_id"] and bool(result.get("shop_order_id")) and result.get("items_total_huf") == payload["items_total_huf"]
        if accepted:
            accepted_response = {k: result.get(k) for k in ["shop_order_id", "order_id", "external_order_id", "duplicate", "items_total_huf"]}
        else:
            code = result.get("error", "invalid_response") if isinstance(result, dict) else "invalid_response"
            allowed = {"validation_error", "invalid_token", "forbidden", "price_mismatch", "out_of_stock", "in_progress", "unknown_items", "server_error"}
            error = code if isinstance(code, str) and code in allowed else "invalid_response"
            outcome = "unknown" if response.status_code >= 500 or response.status_code in {200, 201, 429} or code == "in_progress" else "rejected"
    except (DiceMagicError, ValueError, TypeError, AttributeError):
        pass

    # Re-read the committed truth under a fresh row lock. Terminal decisions made
    # by another sender or reconciliation cannot be overwritten by this response.
    order = db.scalar(statement)
    reconciled_rejection = accepted_response and order.status == "rejected" and db.scalar(
        select(DiceMagicOrderHold.id).where(DiceMagicOrderHold.order_id == order.id,
                                           DiceMagicOrderHold.resolved_at.is_not(None)).limit(1)) is not None
    if order.status in {"accepted", "cancelled"} or reconciled_rejection:
        if accepted_response and order.status != "accepted":
            create_domain_audit_log(db, action="dicemagic_late_acceptance_review", user_id=user.id,
                metadata={"order_id": order.id, "buyer_id": buyer_id, "attempt": attempt, "status": order.status,
                          "shop_order_id": accepted_response["shop_order_id"]})
    elif accepted_response and order.status in {"sending", "unknown", "rejected"}:
        # A verified success for the same immutable external ID is authoritative,
        # even if a newer attempt is pending or returned an unconfirmed rejection.
        # A reconciled rejection/cancellation remains terminal. Only this transition
        # may create the transaction, chat linkage and acceptance notification.
        order.status, order.response, order.error, order.next_attempt_at = "accepted", accepted_response, None, None
        from app.services.dicemagic_transactions import link_accepted_order
        link_accepted_order(db, order)
        for item_id in order.cart_item_ids:
            item = db.get(CartItem, item_id)
            if item:
                item.status = "checked_out"
        create_domain_audit_log(db, action="dicemagic_order_accepted", user_id=user.id, metadata={"order_id": order.id, "buyer_id": buyer_id, "attempt": attempt})
    elif order.status == "sending" and order.attempts == attempt:
        # Only the currently leased generation may record a negative outcome.
        order.status, order.error = outcome, error
        order.next_attempt_at = utcnow()+timedelta(seconds=min(3600, 30 * 2**min(attempt, 6))) if outcome == "unknown" else None
    db.commit()
    return order_read(order)
