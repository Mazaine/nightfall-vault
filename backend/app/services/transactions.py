from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.config import settings
from app.models.auction import Auction, AuctionReview
from app.models.transaction import AuctionTransaction
from app.models.user import User
from app.services.demo_visibility import auction_visibility_clause
from app.services.security_audit import create_domain_audit_log


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def transaction_options():
    return (
        joinedload(AuctionTransaction.auction),
        joinedload(AuctionTransaction.seller),
        joinedload(AuctionTransaction.buyer),
        selectinload(AuctionTransaction.items),
    )


def visible_transaction_filters(user: User):
    """Participant, personal hide state and auction visibility for list/count queries."""
    return (
        or_(AuctionTransaction.seller_id == user.id, AuctionTransaction.buyer_id == user.id),
        or_(
            and_(AuctionTransaction.seller_id == user.id, AuctionTransaction.seller_hidden_at.is_(None)),
            and_(AuctionTransaction.buyer_id == user.id, AuctionTransaction.buyer_hidden_at.is_(None)),
        ),
        auction_visibility_clause(user),
    )


def ensure_transaction_for_sold_auction(db: Session, auction: Auction) -> tuple[AuctionTransaction | None, bool]:
    if auction.status != "sold" or auction.winner_id is None or auction.seller_id == auction.winner_id:
        return None, False
    existing = db.scalar(select(AuctionTransaction).where(AuctionTransaction.auction_id == auction.id))
    if existing is not None:
        return existing, False
    transaction_id = db.scalar(
        insert(AuctionTransaction)
        .values(auction_id=auction.id, seller_id=auction.seller_id, buyer_id=auction.winner_id, status="transaction_open")
        .on_conflict_do_nothing(index_elements=[AuctionTransaction.auction_id])
        .returning(AuctionTransaction.id)
    )
    if transaction_id is None:
        existing = db.scalar(select(AuctionTransaction).where(AuctionTransaction.auction_id == auction.id))
        return existing, False
    transaction = db.get(AuctionTransaction, transaction_id)
    if transaction is None:
        raise RuntimeError("A létrehozott tranzakció nem tölthető vissza.")
    create_domain_audit_log(
        db,
        action="transaction_created",
        auction_id=auction.id,
        metadata={"transaction_id": transaction.id, "seller_id": auction.seller_id, "buyer_id": auction.winner_id},
    )
    return transaction, True


def get_participant_transaction(db: Session, transaction_id: int, user_id: int, *, lock: bool = False) -> AuctionTransaction:
    statement = select(AuctionTransaction).where(
        AuctionTransaction.id == transaction_id,
        or_(AuctionTransaction.seller_id == user_id, AuctionTransaction.buyer_id == user_id),
    )
    if lock:
        statement = statement.with_for_update()
    else:
        statement = statement.options(*transaction_options())
    transaction = db.scalar(statement)
    if transaction is None:
        raise HTTPException(status_code=404, detail="A tranzakció nem található.")
    return transaction


def serialize_transaction(transaction: AuctionTransaction, user_id: int) -> dict:
    seller_role = transaction.seller_id == user_id
    own_completed_at = transaction.seller_completed_at if seller_role else transaction.buyer_completed_at
    partner_completed_at = transaction.buyer_completed_at if seller_role else transaction.seller_completed_at
    reviews = transaction.auction.reviews if hasattr(transaction.auction, "reviews") else []
    has_reviewed = any(review.reviewer_id == user_id for review in reviews)
    transaction_items = [{
        "id": item.id, "auction_id": item.auction_id, "title": item.title_snapshot,
        "quantity": item.quantity, "unit_price": item.unit_price,
        "subtotal": item.unit_price * item.quantity,
    } for item in transaction.items]
    return {
        "id": transaction.id,
        "auction_id": transaction.auction_id,
        "status": transaction.status,
        "seller_completed_at": transaction.seller_completed_at,
        "buyer_completed_at": transaction.buyer_completed_at,
        "completed_at": transaction.completed_at,
        "review_deadline": transaction.review_deadline,
        "archived_at": transaction.archived_at,
        "created_at": transaction.created_at,
        "updated_at": transaction.updated_at,
        "role": "seller" if seller_role else "buyer",
        "own_completed_at": own_completed_at,
        "partner_completed_at": partner_completed_at,
        "can_confirm": transaction.status == "transaction_open" and own_completed_at is None,
        "can_review": transaction.status in {"completed", "reviewed"} and not has_reviewed and (transaction.review_deadline is None or transaction.review_deadline > now_utc()),
        "own_note": transaction.seller_note if seller_role else transaction.buyer_note,
        "can_delete": transaction.status != "transaction_open",
        "auction": transaction.auction,
        "partner": transaction.buyer if seller_role else transaction.seller,
        "items": transaction_items,
        "total": sum((item["subtotal"] for item in transaction_items), 0),
    }


def is_transaction_hidden_for(transaction: AuctionTransaction, user_id: int) -> bool:
    return transaction.seller_hidden_at is not None if transaction.seller_id == user_id else transaction.buyer_hidden_at is not None


def update_transaction_note(db: Session, transaction_id: int, user: User, note: str | None) -> AuctionTransaction:
    transaction = get_participant_transaction(db, transaction_id, user.id, lock=True)
    if is_transaction_hidden_for(transaction, user.id):
        raise HTTPException(status_code=404, detail="A tranzakció nem található.")
    if transaction.seller_id == user.id:
        transaction.seller_note = note
    else:
        transaction.buyer_note = note
    db.add(transaction)
    create_domain_audit_log(
        db,
        action="transaction_note_updated",
        user_id=user.id,
        auction_id=transaction.auction_id,
        metadata={"transaction_id": transaction.id, "note_present": note is not None},
    )
    db.commit()
    return get_participant_transaction(db, transaction.id, user.id)


def hide_closed_transaction(db: Session, transaction_id: int, user: User) -> None:
    transaction = get_participant_transaction(db, transaction_id, user.id, lock=True)
    if transaction.status == "transaction_open":
        raise HTTPException(status_code=409, detail="Folyamatban lévő tranzakció nem törölhető.")
    if is_transaction_hidden_for(transaction, user.id):
        raise HTTPException(status_code=404, detail="A tranzakció nem található.")
    timestamp = now_utc()
    if transaction.seller_id == user.id:
        transaction.seller_hidden_at = timestamp
    else:
        transaction.buyer_hidden_at = timestamp
    db.add(transaction)
    create_domain_audit_log(
        db,
        action="transaction_hidden",
        user_id=user.id,
        auction_id=transaction.auction_id,
        metadata={"transaction_id": transaction.id},
    )
    db.commit()


def _deduct_grouped_transaction_inventory(db: Session, transaction: AuctionTransaction) -> bool:
    """Deduct each cart-checkout line exactly once after both parties confirm."""
    from app.models.auction import AuctionBundleItem
    from app.models.transaction import AuctionTransactionItem
    from app.models.vault import VaultCollectionCard, VaultTradeCard

    lines = list(db.scalars(select(AuctionTransactionItem).where(
        AuctionTransactionItem.transaction_id == transaction.id,
    ).order_by(AuctionTransactionItem.id).with_for_update()).all())
    if not lines:
        return False
    auctions = {row.id: row for row in db.scalars(select(Auction).where(
        Auction.id.in_([line.auction_id for line in lines]),
    ).order_by(Auction.id).with_for_update()).all()}
    for line in lines:
        if line.inventory_deducted:
            continue
        auction = auctions.get(line.auction_id)
        if auction is None:
            raise HTTPException(status_code=409, detail="A tranzakció egyik hirdetése már nem található.")
        if auction.listing_format == "bundle":
            bundle_items = list(db.scalars(select(AuctionBundleItem).where(
                AuctionBundleItem.auction_id == auction.id,
            ).order_by(AuctionBundleItem.id).with_for_update()).all())
            for bundle_item in bundle_items:
                if bundle_item.vault_trade_card_id is not None:
                    inventory = db.scalar(select(VaultTradeCard).where(
                        VaultTradeCard.id == bundle_item.vault_trade_card_id,
                        VaultTradeCard.user_id == transaction.seller_id,
                    ).with_for_update())
                else:
                    inventory = db.scalar(select(VaultCollectionCard).where(
                        VaultCollectionCard.id == bundle_item.vault_collection_card_id,
                        VaultCollectionCard.user_id == transaction.seller_id,
                    ).with_for_update())
                if inventory is None or inventory.quantity < bundle_item.quantity:
                    raise HTTPException(status_code=409, detail=f"A Vault-készlet nem elegendő ehhez a csomagtételhez: {bundle_item.card_name}.")
                if bundle_item.vault_trade_card_id is not None and inventory.quantity == bundle_item.quantity:
                    db.delete(inventory)
                else:
                    inventory.quantity -= bundle_item.quantity
                    db.add(inventory)
        else:
            required = line.quantity
            if auction.vault_trade_card_id is not None:
                inventory = db.scalar(select(VaultTradeCard).where(
                    VaultTradeCard.id == auction.vault_trade_card_id,
                    VaultTradeCard.user_id == transaction.seller_id,
                ).with_for_update())
                if inventory is None or inventory.quantity < required:
                    raise HTTPException(status_code=409, detail=f"A cseremappa-készlet nem elegendő ehhez a tételhez: {line.title_snapshot}.")
                if inventory.quantity == required:
                    db.delete(inventory)
                else:
                    inventory.quantity -= required
                    db.add(inventory)
            elif auction.vault_collection_card_id is not None:
                inventory = db.scalar(select(VaultCollectionCard).where(
                    VaultCollectionCard.id == auction.vault_collection_card_id,
                    VaultCollectionCard.user_id == transaction.seller_id,
                ).with_for_update())
                if inventory is None or inventory.quantity < required:
                    raise HTTPException(status_code=409, detail=f"A Vault-készlet nem elegendő ehhez a tételhez: {line.title_snapshot}.")
                inventory.quantity -= required
                db.add(inventory)
        line.inventory_deducted = True
        auction.vault_inventory_deducted = True
        db.add_all([line, auction])
    return True

def confirm_completion(db: Session, transaction_id: int, user: User) -> AuctionTransaction:
    transaction = get_participant_transaction(db, transaction_id, user.id, lock=True)
    if transaction.status != "transaction_open":
        if transaction.status == "completed" and (
            (transaction.seller_id == user.id and transaction.seller_completed_at)
            or (transaction.buyer_id == user.id and transaction.buyer_completed_at)
        ):
            return transaction
        raise HTTPException(status_code=409, detail="Ez a tranzakció már nem erősíthető meg.")
    timestamp = now_utc()
    if transaction.seller_id == user.id:
        if transaction.seller_completed_at is not None:
            return transaction
        transaction.seller_completed_at = timestamp
    else:
        if transaction.buyer_completed_at is not None:
            return transaction
        transaction.buyer_completed_at = timestamp
    create_domain_audit_log(
        db,
        action="transaction_completion_confirmed",
        user_id=user.id,
        auction_id=transaction.auction_id,
        metadata={"transaction_id": transaction.id},
    )
    from app.services.notifications import create_notification

    partner_id = transaction.buyer_id if transaction.seller_id == user.id else transaction.seller_id
    create_notification(
        db,
        user_id=partner_id,
        auction_id=transaction.auction_id,
        notification_type="transaction_confirmation",
        title="A partnered megerősítette a teljesítést",
        message=f"A(z) {transaction.auction.title} tranzakciónál most a te megerősítésedre várunk.",
        event_key=f"transaction-confirmation:{transaction.id}:{user.id}:{partner_id}",
    )
    if transaction.seller_completed_at and transaction.buyer_completed_at:
        auction = db.scalar(select(Auction).where(Auction.id == transaction.auction_id).with_for_update())
        grouped_inventory = _deduct_grouped_transaction_inventory(db, transaction)
        if not grouped_inventory and auction is not None and not auction.vault_inventory_deducted and auction.listing_format == "bundle":
            from app.models.auction import AuctionBundleItem
            from app.models.vault import VaultCollectionCard, VaultTradeCard
            bundle_items = list(db.scalars(select(AuctionBundleItem).where(AuctionBundleItem.auction_id == auction.id).order_by(AuctionBundleItem.id).with_for_update()).all())
            card_ids = [item.vault_collection_card_id for item in bundle_items if item.vault_collection_card_id is not None]
            trade_card_ids = [item.vault_trade_card_id for item in bundle_items if item.vault_trade_card_id is not None]
            vault_cards = {card.id: card for card in db.scalars(select(VaultCollectionCard).where(VaultCollectionCard.id.in_(card_ids), VaultCollectionCard.user_id == transaction.seller_id).order_by(VaultCollectionCard.id).with_for_update()).all()}
            trade_cards = {card.id: card for card in db.scalars(select(VaultTradeCard).where(VaultTradeCard.id.in_(trade_card_ids), VaultTradeCard.user_id == transaction.seller_id).order_by(VaultTradeCard.id).with_for_update()).all()}
            for item in bundle_items:
                inventory_card = trade_cards.get(item.vault_trade_card_id) if item.vault_trade_card_id is not None else vault_cards.get(item.vault_collection_card_id)
                if inventory_card is None or inventory_card.quantity < item.quantity:
                    raise HTTPException(status_code=409, detail=f"A Vault-készlet időközben nem elegendő ehhez a csomagtételhez: {item.card_name}.")
            for item in bundle_items:
                inventory_card = trade_cards[item.vault_trade_card_id] if item.vault_trade_card_id is not None else vault_cards[item.vault_collection_card_id]
                if item.vault_trade_card_id is not None and inventory_card.quantity == item.quantity:
                    db.delete(inventory_card)
                else:
                    inventory_card.quantity -= item.quantity
            auction.vault_inventory_deducted = True
            db.add_all([*vault_cards.values(), auction])
        elif not grouped_inventory and auction is not None and auction.vault_collection_card_id is not None and not auction.vault_inventory_deducted:
            from app.models.vault import VaultCollectionCard
            vault_card = db.scalar(select(VaultCollectionCard).where(
                VaultCollectionCard.id == auction.vault_collection_card_id,
                VaultCollectionCard.user_id == transaction.seller_id,
            ).with_for_update())
            required = int(auction.vault_quantity or 0)
            if vault_card is None or vault_card.quantity < required:
                raise HTTPException(status_code=409, detail="A Vault-készlet időközben nem elegendő a tranzakció lezárásához.")
            vault_card.quantity -= required
            auction.vault_inventory_deducted = True
            db.add_all([vault_card, auction])
        elif not grouped_inventory and auction is not None and auction.vault_trade_card_id is not None and not auction.vault_inventory_deducted:
            from app.models.vault import VaultTradeCard
            trade_card = db.scalar(select(VaultTradeCard).where(
                VaultTradeCard.id == auction.vault_trade_card_id,
                VaultTradeCard.user_id == transaction.seller_id,
            ).with_for_update())
            required = int(auction.vault_quantity or 0)
            if trade_card is None or trade_card.quantity < required:
                raise HTTPException(status_code=409, detail="A cseremappa-készlet időközben nem elegendő a tranzakció lezárásához.")
            if trade_card.quantity == required:
                db.delete(trade_card)
            else:
                trade_card.quantity -= required
                db.add(trade_card)
            auction.vault_inventory_deducted = True
            db.add(auction)
        transaction.status = "completed"
        transaction.completed_at = timestamp
        transaction.review_deadline = timestamp + timedelta(days=settings.transaction_review_window_days)
        create_domain_audit_log(db, action="transaction_completed", auction_id=transaction.auction_id, metadata={"transaction_id": transaction.id})
        for participant_id in (transaction.seller_id, transaction.buyer_id):
            from app.services.vault import grant_points
            grant_points(db, participant_id, 15, "AUCTION_TRANSACTION_COMPLETED", "auction_transaction", str(transaction.id))
            create_notification(
                db,
                user_id=participant_id,
                auction_id=transaction.auction_id,
                notification_type="transaction_completed",
                title="A tranzakció sikeresen teljesült",
                message=f"Most már értékelhetitek egymást: {transaction.auction.title}",
                event_key=f"transaction-completed:{transaction.id}:{participant_id}",
            )
    db.add(transaction)
    db.commit()
    if transaction.status == "completed":
        from app.services.auction_lifecycle import publish_auction_change
        publish_auction_change(db, transaction.auction)
    return get_participant_transaction(db, transaction.id, user.id)


def cancel_open_transaction(db: Session, transaction_id: int, user: User) -> AuctionTransaction:
    """Cancel a still-open grouped checkout and return its listing quantities safely."""
    from app.models.transaction import AuctionTransactionItem
    from app.services.notifications import create_notification

    transaction = get_participant_transaction(db, transaction_id, user.id, lock=True)
    if transaction.status == "cancelled":
        return transaction
    if transaction.status != "transaction_open" or transaction.seller_completed_at or transaction.buyer_completed_at:
        raise HTTPException(status_code=409, detail="Ez az ügylet már nem vonható vissza.")
    lines = list(db.scalars(select(AuctionTransactionItem).where(
        AuctionTransactionItem.transaction_id == transaction.id,
    ).order_by(AuctionTransactionItem.id).with_for_update()).all())
    if not lines:
        raise HTTPException(status_code=409, detail="A hagyományos aukciós ügylet ezen a felületen nem vonható vissza.")
    auction_ids = sorted({line.auction_id for line in lines} | {line.source_auction_id for line in lines})
    auctions = {row.id: row for row in db.scalars(select(Auction).where(Auction.id.in_(auction_ids)).order_by(Auction.id).with_for_update()).all()}
    for line in lines:
        sold = auctions[line.auction_id]
        source = auctions[line.source_auction_id]
        if line.inventory_deducted:
            raise HTTPException(status_code=409, detail="A már készletből levont ügylet nem vonható vissza.")
        if sold.id == source.id:
            sold.status = "active"
            sold.winner_id = None
            sold.finalized_at = None
            db.add(sold)
        else:
            source.vault_quantity = int(source.vault_quantity or 0) + line.quantity
            sold.status = "cancelled"
            sold.winner_id = None
            db.add_all([source, sold])
    transaction.status = "cancelled"
    db.add(transaction)
    create_domain_audit_log(db, action="transaction_cancelled", user_id=user.id, auction_id=transaction.auction_id, metadata={"transaction_id": transaction.id})
    for participant_id in (transaction.seller_id, transaction.buyer_id):
        create_notification(db, user_id=participant_id, auction_id=transaction.auction_id, notification_type="transaction_cancelled", title="Az ügylet meghiúsult", message=f"A(z) {transaction.auction.title} ügyletet az egyik fél visszavonta.", target_url="/account/transactions", event_key=f"transaction-cancelled:{transaction.id}:{participant_id}")
    db.commit()
    return get_participant_transaction(db, transaction.id, user.id)

def require_reviewable_transaction(db: Session, auction: Auction, user_id: int) -> AuctionTransaction:
    transaction = db.scalar(
        select(AuctionTransaction).where(
            AuctionTransaction.auction_id == auction.id,
            or_(AuctionTransaction.seller_id == user_id, AuctionTransaction.buyer_id == user_id),
        )
    )
    if transaction is None or transaction.status not in {"completed", "reviewed"}:
        raise HTTPException(status_code=409, detail="Értékelés csak kölcsönösen teljesített tranzakció után adható.")
    if transaction.review_deadline and transaction.review_deadline <= now_utc():
        raise HTTPException(status_code=409, detail="Az értékelési időszak lezárult.")
    return transaction


def can_user_review_transaction(db: Session, auction: Auction, user_id: int) -> bool:
    transaction = db.scalar(
        select(AuctionTransaction).where(
            AuctionTransaction.auction_id == auction.id,
            or_(AuctionTransaction.seller_id == user_id, AuctionTransaction.buyer_id == user_id),
        )
    )
    if transaction is None or transaction.status not in {"completed", "reviewed"}:
        return False
    if transaction.review_deadline and transaction.review_deadline <= now_utc():
        return False
    return db.scalar(select(AuctionReview.id).where(AuctionReview.auction_id == auction.id, AuctionReview.reviewer_id == user_id).limit(1)) is None


def mark_reviewed_if_complete(db: Session, transaction: AuctionTransaction) -> None:
    review_count = int(db.scalar(select(func.count()).select_from(AuctionReview).where(AuctionReview.auction_id == transaction.auction_id)) or 0)
    if review_count >= 2 and transaction.status == "completed":
        transaction.status = "reviewed"
        db.add(transaction)
        create_domain_audit_log(db, action="transaction_reviewed", auction_id=transaction.auction_id, metadata={"transaction_id": transaction.id})


def archive_due_transactions(db: Session, limit: int = 100) -> int:
    current_time = now_utc()
    statement = (
        select(AuctionTransaction)
        .where(
            AuctionTransaction.status.in_(["completed", "reviewed"]),
            or_(AuctionTransaction.status == "reviewed", and_(AuctionTransaction.review_deadline.is_not(None), AuctionTransaction.review_deadline <= current_time)),
        )
        .order_by(AuctionTransaction.updated_at.asc(), AuctionTransaction.id.asc())
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    archived = 0
    for transaction in db.scalars(statement).all():
        transaction.status = "archived"
        transaction.archived_at = current_time
        db.add(transaction)
        create_domain_audit_log(db, action="transaction_archived", auction_id=transaction.auction_id, metadata={"transaction_id": transaction.id})
        archived += 1
    return archived
