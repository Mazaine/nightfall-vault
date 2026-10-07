from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import require_active_user
from app.models.user import User
from app.models.vault import VaultCardLoan, VaultCollectionCard, VaultFolder, VaultPointTransaction, VaultTrade, VaultTradeCard, VaultTradeMessage, VaultTradeReview
from app.schemas.vault import CardLoanCreate, CardLoanRead, CardRead, CollectionCardCreate, CollectionCardUpdate, FolderCreate, FolderRead, FolderReorder, FolderUpdate, HkkEditionCards, HkkEditionImport, HkkEditionImportResult, HkkEditionRead, HkkSearchResult, PointHistory, PointTransactionRead, PublicTradeCardRead, QuantityUpdate, TradeCardCreate, TradeMessageCreate, TradeRead, TradeReviewCreate, TradeReviewRead, VaultSummary, WantedCardCreate, WantedUpdate
from app.services.notifications import create_notification
from app.services.vault import account_for, buy_capacity_pack, card_snapshot_values, collection_card_for_user, complete_trade, fetch_hkk_card_image, folder_for_user, folder_used, grant_points, hkk_edition_cards, import_hkk_edition, list_hkk_editions, point_balance, require_allocatable, require_valid_card_snapshot, search_hkk_cards, total_collection_capacity, trade_for_participant, utc_now
from app.services.user_blocks import ensure_not_blocked


router = APIRouter(prefix="/api/vault", tags=["virtual-vault"])


def public_user_label(user: User) -> str:
    username = user.username.strip()
    if "@" not in username:
        return username
    return user.full_name.strip() or username.split("@", 1)[0]


def card_read(db: Session, card: VaultCollectionCard) -> CardRead:
    offers = int(db.scalar(select(func.count()).select_from(VaultTradeCard).where(VaultTradeCard.external_card_id == card.external_card_id, VaultTradeCard.user_id != card.user_id)) or 0)
    return CardRead.model_validate({**card.__dict__, "offer_count": offers})


def active_loan_quantity(db: Session, card_id: int) -> int:
    return int(db.scalar(select(func.coalesce(func.sum(VaultCardLoan.quantity), 0)).where(VaultCardLoan.collection_card_id == card_id, VaultCardLoan.status == "active")) or 0)


def owned_card_quantity(db: Session, user_id: int, external_card_id: str) -> int:
    return min(3, int(db.scalar(select(func.coalesce(func.sum(VaultCollectionCard.quantity), 0)).where(VaultCollectionCard.user_id == user_id, VaultCollectionCard.external_card_id == external_card_id)) or 0))


def refresh_wanted_quantity(db: Session, user_id: int, external_card_id: str) -> None:
    wanted_card = db.scalar(
        select(VaultCollectionCard)
        .where(VaultCollectionCard.user_id == user_id, VaultCollectionCard.external_card_id == external_card_id, VaultCollectionCard.wanted.is_(True))
        .order_by(VaultCollectionCard.id)
        .with_for_update()
    )
    if wanted_card is None:
        return
    wanted_card.wanted_quantity = max(3 - owned_card_quantity(db, user_id, external_card_id), 0)
    wanted_card.wanted = wanted_card.wanted_quantity > 0


def trade_card_read(card: VaultTradeCard) -> PublicTradeCardRead:
    return PublicTradeCardRead.model_validate({**card.__dict__, "owner_id": card.user_id, "owner_username": card.user.username})


def trade_read(trade: VaultTrade, viewer_id: int) -> TradeRead:
    messages = sorted(trade.messages, key=lambda item: (item.created_at, item.id))
    return TradeRead(
        id=trade.id, requester_id=trade.requester_id, requester_username=trade.requester.username,
        requester_display_name=public_user_label(trade.requester),
        owner_id=trade.owner_id, owner_username=trade.owner.username,
        owner_display_name=public_user_label(trade.owner), status=trade.status,
        reviewed_by_current_user=any(review.reviewer_id == viewer_id for review in trade.reviews),
        requester_confirmed_at=trade.requester_confirmed_at, owner_confirmed_at=trade.owner_confirmed_at,
        completed_at=trade.completed_at, card=CardRead.model_validate(trade.offered_card),
        messages=[{"id": item.id, "sender_id": item.sender_id, "sender_username": item.sender.username, "sender_display_name": public_user_label(item.sender), "message": item.message, "created_at": item.created_at} for item in messages],
    )


@router.get("/summary", response_model=VaultSummary)
def summary(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> VaultSummary:
    account = account_for(db, current_user.id)
    folders = db.scalars(select(VaultFolder).where(VaultFolder.user_id == current_user.id).order_by(VaultFolder.position, VaultFolder.id)).all()
    total = total_collection_capacity(db, current_user.id)
    assigned = sum(folder.capacity for folder in folders)
    folder_reads = [FolderRead.model_validate({**folder.__dict__, "used_slots": folder_used(db, folder.id)}) for folder in folders]
    used_trade = int(db.scalar(select(func.count()).select_from(VaultTradeCard).where(VaultTradeCard.user_id == current_user.id)) or 0)
    return VaultSummary(total_collection_capacity=total, assigned_collection_capacity=assigned, free_collection_capacity=max(total - assigned, 0), used_collection_slots=sum(item.used_slots for item in folder_reads), trade_capacity=account.trade_capacity, used_trade_slots=used_trade, vp_balance=point_balance(db, current_user.id), vault_unlimited=account.vault_unlimited, folders=folder_reads)


@router.post("/folders", response_model=FolderRead, status_code=status.HTTP_201_CREATED)
def create_folder(payload: FolderCreate, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> FolderRead:
    account_for(db, current_user.id, lock=True)
    require_allocatable(db, current_user.id, payload.capacity)
    current_max = db.scalar(select(func.max(VaultFolder.position)).where(VaultFolder.user_id == current_user.id))
    position = (int(current_max) if current_max is not None else -1) + 1
    folder = VaultFolder(user_id=current_user.id, name=payload.name.strip(), capacity=payload.capacity, position=position, color=payload.color)
    db.add(folder)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Már van ilyen nevű mappád.")
    db.refresh(folder)
    return FolderRead.model_validate({**folder.__dict__, "used_slots": 0})


@router.patch("/folders/{folder_id}", response_model=FolderRead)
def update_folder(folder_id: int, payload: FolderUpdate, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> FolderRead:
    account_for(db, current_user.id, lock=True)
    folder = folder_for_user(db, folder_id, current_user.id, lock=True)
    next_capacity = folder.capacity if payload.capacity is None else payload.capacity
    used = folder_used(db, folder.id)
    if next_capacity < used:
        raise HTTPException(status_code=409, detail="A kapacitás nem csökkenthető a használt zsebek száma alá.")
    require_allocatable(db, current_user.id, next_capacity, exclude_folder_id=folder.id)
    if payload.name is not None:
        folder.name = payload.name.strip()
    if payload.capacity is not None:
        folder.capacity = payload.capacity
    if "color" in payload.model_fields_set:
        folder.color = payload.color
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Már van ilyen nevű mappád.")
    db.refresh(folder)
    return FolderRead.model_validate({**folder.__dict__, "used_slots": used})


@router.put("/folders/reorder", response_model=list[FolderRead])
def reorder_folders(payload: FolderReorder, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> list[FolderRead]:
    folders = db.scalars(select(VaultFolder).where(VaultFolder.user_id == current_user.id).with_for_update()).all()
    if len(payload.folder_ids) != len(set(payload.folder_ids)) or set(payload.folder_ids) != {folder.id for folder in folders}:
        raise HTTPException(status_code=422, detail="A sorrendnek minden saját mappát pontosan egyszer kell tartalmaznia.")
    by_id = {folder.id: folder for folder in folders}
    for position, folder_id in enumerate(payload.folder_ids):
        by_id[folder_id].position = position
    db.commit()
    return [FolderRead.model_validate({**by_id[folder_id].__dict__, "used_slots": folder_used(db, folder_id)}) for folder_id in payload.folder_ids]


@router.delete("/folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder(
    folder_id: int,
    move_to_folder_id: int | None = Query(default=None),
    delete_contents: bool = Query(default=False),
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> Response:
    folder = folder_for_user(db, folder_id, current_user.id, lock=True)
    used = folder_used(db, folder.id)
    if move_to_folder_id is not None and delete_contents:
        raise HTTPException(status_code=422, detail="Válassz az áthelyezés és a tartalom törlése között.")
    if used:
        cards = db.scalars(select(VaultCollectionCard).where(VaultCollectionCard.folder_id == folder.id).with_for_update()).all()
        if delete_contents:
            card_ids = [card.id for card in cards]
            if card_ids:
                db.execute(
                    update(VaultCardLoan)
                    .where(VaultCardLoan.user_id == current_user.id, VaultCardLoan.collection_card_id.in_(card_ids), VaultCardLoan.status == "active")
                    .values(
                        status="cancelled",
                        returned_at=utc_now(),
                    )
                )
                db.execute(
                    update(VaultCardLoan)
                    .where(VaultCardLoan.user_id == current_user.id, VaultCardLoan.collection_card_id.in_(card_ids))
                    .values(collection_card_id=None)
                )
                db.execute(delete(VaultCollectionCard).where(VaultCollectionCard.user_id == current_user.id, VaultCollectionCard.id.in_(card_ids)))
        else:
            if move_to_folder_id is None:
                raise HTTPException(status_code=409, detail="A mappa lapokat tartalmaz. Válassz célmappát vagy erősítsd meg a tartalom törlését.")
            if move_to_folder_id == folder.id:
                raise HTTPException(status_code=422, detail="A célmappa nem lehet azonos a törlendő mappával.")
            target = folder_for_user(db, move_to_folder_id, current_user.id, lock=True)
            for card in cards:
                card.folder = target
            target.capacity += folder.capacity
            db.flush()
    db.delete(folder)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/cards", response_model=list[CardRead])
def list_cards(folder_id: int | None = None, query: str | None = Query(default=None, max_length=180), wanted: bool | None = None, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> list[CardRead]:
    statement = select(VaultCollectionCard).where(VaultCollectionCard.user_id == current_user.id)
    if folder_id is not None:
        folder_for_user(db, folder_id, current_user.id)
        statement = statement.where(VaultCollectionCard.folder_id == folder_id)
    if query:
        statement = statement.where(VaultCollectionCard.card_name.ilike(f"%{query.strip()}%"))
    if wanted is not None:
        statement = statement.where(VaultCollectionCard.wanted == wanted)
    return [card_read(db, card) for card in db.scalars(statement.order_by(VaultCollectionCard.card_name, VaultCollectionCard.id)).all()]


@router.post("/cards", response_model=CardRead, status_code=status.HTTP_201_CREATED)
def add_card(payload: CollectionCardCreate, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> CardRead:
    require_valid_card_snapshot(payload)
    account = account_for(db, current_user.id, lock=True)
    folder = folder_for_user(db, payload.folder_id, current_user.id, lock=True)
    variant = payload.print_variant or "normal"
    existing = db.scalar(select(VaultCollectionCard).where(VaultCollectionCard.user_id == current_user.id, VaultCollectionCard.external_card_id == payload.external_card_id, VaultCollectionCard.print_variant == variant).with_for_update())
    if existing is None:
        if not account.vault_unlimited and folder_used(db, folder.id) >= folder.capacity:
            raise HTTPException(status_code=409, detail="A célmappa megtelt.")
        existing = VaultCollectionCard(user_id=current_user.id, folder_id=folder.id, quantity=payload.quantity, print_variant=variant, **card_snapshot_values(payload))
        db.add(existing)
    else:
        if not account.vault_unlimited and existing.folder_id != folder.id and folder_used(db, folder.id) >= folder.capacity:
            raise HTTPException(status_code=409, detail="A célmappa megtelt.")
        existing.folder_id = folder.id
        existing.quantity = payload.quantity
        for key, value in card_snapshot_values(payload).items():
            setattr(existing, key, value)
    db.flush()
    refresh_wanted_quantity(db, current_user.id, payload.external_card_id)
    db.commit()
    db.refresh(existing)
    return card_read(db, existing)


@router.post("/cards/wanted", response_model=CardRead, status_code=status.HTTP_201_CREATED)
def add_wanted_card(payload: WantedCardCreate, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> CardRead:
    require_valid_card_snapshot(payload)
    account = account_for(db, current_user.id, lock=True)
    folder = folder_for_user(db, payload.folder_id, current_user.id, lock=True)
    existing_cards = db.scalars(select(VaultCollectionCard).where(VaultCollectionCard.user_id == current_user.id, VaultCollectionCard.external_card_id == payload.external_card_id).order_by(VaultCollectionCard.print_variant == payload.print_variant, VaultCollectionCard.id).with_for_update()).all()
    existing = next((card for card in existing_cards if card.wanted), None) or next((card for card in existing_cards if card.print_variant == payload.print_variant), None) or (existing_cards[0] if existing_cards else None)
    owned = min(3, sum(card.quantity for card in existing_cards))
    if existing is None:
        if not account.vault_unlimited and folder_used(db, folder.id) >= folder.capacity:
            raise HTTPException(status_code=409, detail="A célmappa megtelt.")
        existing = VaultCollectionCard(
            user_id=current_user.id,
            folder_id=folder.id,
            quantity=0,
            wanted=True,
            wanted_quantity=3,
            print_variant=payload.print_variant,
            **card_snapshot_values(payload),
        )
        db.add(existing)
    else:
        if owned >= 3:
            raise HTTPException(status_code=409, detail="A teljes playset már megvan.")
        for card in existing_cards:
            card.wanted = card.id == existing.id
            if card.id != existing.id:
                card.wanted_quantity = 0
        existing.wanted = True
        existing.wanted_quantity = 3 - owned
        for key, value in card_snapshot_values(payload).items():
            setattr(existing, key, value)
    db.commit()
    db.refresh(existing)
    return card_read(db, existing)


@router.patch("/cards/{card_id}", response_model=CardRead)
def update_card(card_id: int, payload: CollectionCardUpdate, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> CardRead | Response:
    account = account_for(db, current_user.id, lock=True)
    card = collection_card_for_user(db, card_id, current_user.id, lock=True)
    if payload.folder_id is not None and payload.folder_id != card.folder_id:
        target = folder_for_user(db, payload.folder_id, current_user.id, lock=True)
        if not account.vault_unlimited and folder_used(db, target.id) >= target.capacity:
            raise HTTPException(status_code=409, detail="A célmappa megtelt.")
        card.folder_id = target.id
    if payload.quantity is not None:
        if payload.quantity < active_loan_quantity(db, card.id):
            raise HTTPException(status_code=409, detail="A példányszám nem lehet kevesebb az aktívan kölcsönadott mennyiségnél.")
        card.quantity = payload.quantity
    if payload.print_variant is not None:
        if payload.print_variant != card.print_variant and active_loan_quantity(db, card.id):
            raise HTTPException(status_code=409, detail="Aktív kölcsönzés mellett a lapváltozat nem módosítható.")
        duplicate = db.scalar(select(VaultCollectionCard.id).where(VaultCollectionCard.user_id == current_user.id, VaultCollectionCard.external_card_id == card.external_card_id, VaultCollectionCard.print_variant == payload.print_variant, VaultCollectionCard.id != card.id))
        if duplicate is not None:
            raise HTTPException(status_code=409, detail="Ebből a lapváltozatból már van külön bejegyzésed.")
        card.print_variant = payload.print_variant
    db.flush()
    refresh_wanted_quantity(db, current_user.id, card.external_card_id)
    db.commit()
    db.refresh(card)
    return card_read(db, card)


@router.put("/cards/{card_id}/wanted", response_model=CardRead)
def update_wanted(card_id: int, payload: WantedUpdate, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> CardRead | Response:
    card = collection_card_for_user(db, card_id, current_user.id, lock=True)
    missing = 3 - owned_card_quantity(db, current_user.id, card.external_card_id)
    if payload.wanted and missing <= 0:
        raise HTTPException(status_code=409, detail="A teljes playset már megvan.")
    if not payload.wanted and card.quantity == 0:
        db.delete(card)
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    if payload.wanted:
        other_variants = db.scalars(select(VaultCollectionCard).where(VaultCollectionCard.user_id == current_user.id, VaultCollectionCard.external_card_id == card.external_card_id, VaultCollectionCard.id != card.id).with_for_update()).all()
        for other in other_variants:
            other.wanted = False
            other.wanted_quantity = 0
    card.wanted = payload.wanted
    card.wanted_quantity = min(payload.quantity or missing, missing) if payload.wanted else 0
    db.commit()
    db.refresh(card)
    return card_read(db, card)


@router.delete("/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_card(card_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> Response:
    card = collection_card_for_user(db, card_id, current_user.id, lock=True)
    if active_loan_quantity(db, card.id):
        raise HTTPException(status_code=409, detail="Aktívan kölcsönadott lap nem törölhető. Előbb jelöld visszakapottként.")
    external_card_id = card.external_card_id
    db.delete(card)
    db.flush()
    refresh_wanted_quantity(db, current_user.id, external_card_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/loans", response_model=list[CardLoanRead])
def list_card_loans(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> list[CardLoanRead]:
    loans = db.scalars(
        select(VaultCardLoan)
        .where(VaultCardLoan.user_id == current_user.id)
        .order_by((VaultCardLoan.status == "active").desc(), VaultCardLoan.lent_at.desc(), VaultCardLoan.id.desc())
    ).all()
    return [CardLoanRead.model_validate(loan) for loan in loans]


@router.post("/cards/{card_id}/loans", response_model=CardLoanRead, status_code=status.HTTP_201_CREATED)
def create_card_loan(card_id: int, payload: CardLoanCreate, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> CardLoanRead:
    card = collection_card_for_user(db, card_id, current_user.id, lock=True)
    if payload.due_at is not None and payload.due_at < payload.lent_at:
        raise HTTPException(status_code=422, detail="A tervezett visszaadás nem lehet korábbi a kölcsönadásnál.")
    lent_quantity = active_loan_quantity(db, card.id)
    if lent_quantity + payload.quantity > card.quantity:
        raise HTTPException(status_code=409, detail=f"Legfeljebb {max(card.quantity - lent_quantity, 0)} további példány adható kölcsön.")
    borrower = db.scalar(
        select(User).where(
            User.id != current_user.id,
            User.deleted_at.is_(None),
            User.is_active.is_(True),
            or_(User.username == payload.borrower_name, User.email == payload.borrower_name),
        )
    )
    loan = VaultCardLoan(
        user_id=current_user.id,
        collection_card_id=card.id,
        borrower_user_id=borrower.id if borrower else None,
        external_card_id=card.external_card_id,
        card_name=card.card_name,
        print_variant=card.print_variant,
        quantity=payload.quantity,
        borrower_name=payload.borrower_name,
        lent_at=payload.lent_at,
        due_at=payload.due_at,
        note=payload.note.strip() if payload.note and payload.note.strip() else None,
    )
    db.add(loan)
    db.commit()
    db.refresh(loan)
    return CardLoanRead.model_validate(loan)


@router.post("/loans/{loan_id}/return", response_model=CardLoanRead)
def return_card_loan(loan_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> CardLoanRead:
    loan = db.scalar(select(VaultCardLoan).where(VaultCardLoan.id == loan_id, VaultCardLoan.user_id == current_user.id).with_for_update())
    if loan is None:
        raise HTTPException(status_code=404, detail="A kölcsönzés nem található.")
    if loan.status != "active":
        raise HTTPException(status_code=409, detail="Ez a kölcsönzés már le van zárva.")
    loan.status = "returned"
    loan.returned_at = utc_now()
    db.commit()
    db.refresh(loan)
    return CardLoanRead.model_validate(loan)


@router.get("/trade", response_model=list[PublicTradeCardRead])
def my_trade_cards(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> list[PublicTradeCardRead]:
    cards = db.scalars(select(VaultTradeCard).where(VaultTradeCard.user_id == current_user.id).order_by(VaultTradeCard.card_name)).all()
    return [trade_card_read(card) for card in cards]


@router.post("/trade", response_model=PublicTradeCardRead, status_code=status.HTTP_201_CREATED)
def add_trade_card(payload: TradeCardCreate, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> PublicTradeCardRead:
    require_valid_card_snapshot(payload)
    account = account_for(db, current_user.id, lock=True)
    variant = payload.print_variant or "normal"
    card = db.scalar(select(VaultTradeCard).where(VaultTradeCard.user_id == current_user.id, VaultTradeCard.external_card_id == payload.external_card_id, VaultTradeCard.print_variant == variant).with_for_update())
    if card is None:
        used = int(db.scalar(select(func.count()).select_from(VaultTradeCard).where(VaultTradeCard.user_id == current_user.id)) or 0)
        if not account.vault_unlimited and used >= account.trade_capacity:
            raise HTTPException(status_code=409, detail="A cseremappád megtelt.")
        card = VaultTradeCard(user_id=current_user.id, quantity=payload.quantity, print_variant=variant, **card_snapshot_values(payload))
        db.add(card)
    else:
        card.quantity = payload.quantity
        for key, value in card_snapshot_values(payload).items():
            setattr(card, key, value)
    db.commit()
    db.refresh(card)
    return trade_card_read(card)


@router.patch("/trade/{card_id}", response_model=PublicTradeCardRead)
def update_trade_card(card_id: int, payload: QuantityUpdate, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> PublicTradeCardRead:
    card = db.scalar(select(VaultTradeCard).where(VaultTradeCard.id == card_id, VaultTradeCard.user_id == current_user.id).with_for_update())
    if card is None:
        raise HTTPException(status_code=404, detail="A cserelap nem található.")
    card.quantity = payload.quantity
    if payload.print_variant is not None:
        duplicate = db.scalar(select(VaultTradeCard.id).where(VaultTradeCard.user_id == current_user.id, VaultTradeCard.external_card_id == card.external_card_id, VaultTradeCard.print_variant == payload.print_variant, VaultTradeCard.id != card.id))
        if duplicate is not None:
            raise HTTPException(status_code=409, detail="Ebből a cserelap-változatból már van külön bejegyzésed.")
        card.print_variant = payload.print_variant
    db.commit(); db.refresh(card)
    return trade_card_read(card)


@router.delete("/trade/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trade_card(card_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> Response:
    card = db.scalar(select(VaultTradeCard).where(VaultTradeCard.id == card_id, VaultTradeCard.user_id == current_user.id).with_for_update())
    if card is None:
        raise HTTPException(status_code=404, detail="A cserelap nem található.")
    if db.scalar(select(VaultTrade.id).where(VaultTrade.offered_card_id == card.id, VaultTrade.status == "open")) is not None:
        raise HTTPException(status_code=409, detail="Nyitott egyeztetéshez tartozó lap nem törölhető.")
    db.delete(card); db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/public/{username}", response_model=list[PublicTradeCardRead])
def public_trade_folder(username: str, query: str | None = Query(default=None, max_length=180), db: Session = Depends(get_db)) -> list[PublicTradeCardRead]:
    owner = db.scalar(select(User).where(User.username == username, User.deleted_at.is_(None), User.is_active.is_(True)))
    if owner is None:
        raise HTTPException(status_code=404, detail="A felhasználó nem található.")
    statement = select(VaultTradeCard).where(VaultTradeCard.user_id == owner.id)
    if query:
        statement = statement.where(VaultTradeCard.card_name.ilike(f"%{query.strip()}%"))
    return [trade_card_read(card) for card in db.scalars(statement.order_by(VaultTradeCard.card_name)).all()]


@router.get("/matches", response_model=list[CardRead])
def matches(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> list[CardRead]:
    wanted_cards = db.scalars(select(VaultCollectionCard).where(VaultCollectionCard.user_id == current_user.id, VaultCollectionCard.wanted.is_(True)).order_by(VaultCollectionCard.card_name)).all()
    return [card_read(db, card) for card in wanted_cards]


@router.get("/cards/{card_id}/offers", response_model=list[PublicTradeCardRead])
def matching_offers(card_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> list[PublicTradeCardRead]:
    card = collection_card_for_user(db, card_id, current_user.id)
    if not card.wanted:
        raise HTTPException(status_code=409, detail="A lap nincs Keresem állapotban.")
    offers = db.scalars(select(VaultTradeCard).where(VaultTradeCard.external_card_id == card.external_card_id, VaultTradeCard.user_id != current_user.id).order_by(VaultTradeCard.updated_at.desc())).all()
    return [trade_card_read(offer) for offer in offers]


@router.post("/trade/{card_id}/interest", response_model=TradeRead, status_code=status.HTTP_201_CREATED)
def express_interest(card_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> TradeRead:
    offered = db.scalar(select(VaultTradeCard).where(VaultTradeCard.id == card_id))
    if offered is None:
        raise HTTPException(status_code=404, detail="A cserelap nem található.")
    if offered.user_id == current_user.id:
        raise HTTPException(status_code=409, detail="A saját lapod iránt nem jelezhetsz érdeklődést.")
    ensure_not_blocked(db, current_user.id, offered.user_id, "Blokkolás miatt nem indítható egyeztetés.")
    trade = db.scalar(select(VaultTrade).where(VaultTrade.requester_id == current_user.id, VaultTrade.offered_card_id == offered.id))
    if trade is None:
        trade = VaultTrade(requester_id=current_user.id, owner_id=offered.user_id, offered_card_id=offered.id)
        db.add(trade); db.commit(); db.refresh(trade)
    return trade_read(trade_for_participant(db, trade.id, current_user.id), current_user.id)


@router.get("/negotiations", response_model=list[TradeRead])
def list_negotiations(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> list[TradeRead]:
    ids = db.scalars(select(VaultTrade.id).where(or_(VaultTrade.requester_id == current_user.id, VaultTrade.owner_id == current_user.id)).order_by(VaultTrade.updated_at.desc())).all()
    return [trade_read(trade_for_participant(db, trade_id, current_user.id), current_user.id) for trade_id in ids]


@router.post("/negotiations/{trade_id}/messages", response_model=TradeRead)
def post_trade_message(trade_id: int, payload: TradeMessageCreate, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> TradeRead:
    trade = trade_for_participant(db, trade_id, current_user.id, lock=True)
    if trade.status != "open":
        raise HTTPException(status_code=409, detail="A lezárt egyeztetéshez nem küldhető üzenet.")
    ensure_not_blocked(db, trade.requester_id, trade.owner_id, "Blokkolás miatt nem küldhető új üzenet.")
    message = VaultTradeMessage(trade_id=trade.id, sender_id=current_user.id, message=payload.message.strip())
    db.add(message)
    db.flush()
    recipient_id = trade.owner_id if current_user.id == trade.requester_id else trade.requester_id
    create_notification(
        db,
        user_id=recipient_id,
        notification_type="auction_message",
        title="Új üzenet a Virtuális HKK Mappában",
        message=f"{public_user_label(current_user)} új üzenetet küldött a(z) {trade.offered_card.card_name} lap egyeztetéséhez.",
        target_url="/vault",
        event_key=f"vault-message:{message.id}:{recipient_id}",
    )
    db.commit()
    return trade_read(trade_for_participant(db, trade.id, current_user.id), current_user.id)


@router.post("/negotiations/{trade_id}/confirm", response_model=TradeRead)
def confirm_trade(trade_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> TradeRead:
    trade = trade_for_participant(db, trade_id, current_user.id, lock=True)
    if trade.status == "completed":
        return trade_read(trade_for_participant(db, trade.id, current_user.id), current_user.id)
    if trade.status != "open":
        raise HTTPException(status_code=409, detail="Ez az egyeztetés már nem erősíthető meg.")
    if current_user.id == trade.requester_id:
        trade.requester_confirmed_at = trade.requester_confirmed_at or utc_now()
    else:
        trade.owner_confirmed_at = trade.owner_confirmed_at or utc_now()
    complete_trade(db, trade)
    db.commit()
    return trade_read(trade_for_participant(db, trade.id, current_user.id), current_user.id)


@router.post("/negotiations/{trade_id}/reviews", response_model=TradeReviewRead, status_code=status.HTTP_201_CREATED)
def review_trade(trade_id: int, payload: TradeReviewCreate, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> TradeReviewRead:
    trade = trade_for_participant(db, trade_id, current_user.id, lock=True)
    if trade.status != "completed":
        raise HTTPException(status_code=409, detail="Értékelés csak kölcsönösen lezárt csere után adható.")
    existing = db.scalar(select(VaultTradeReview).where(VaultTradeReview.trade_id == trade.id, VaultTradeReview.reviewer_id == current_user.id))
    if existing is not None:
        raise HTTPException(status_code=409, detail="Ezt a cserepartnert már értékelted.")
    reviewed_user_id = trade.owner_id if current_user.id == trade.requester_id else trade.requester_id
    review = VaultTradeReview(trade_id=trade.id, reviewer_id=current_user.id, reviewed_user_id=reviewed_user_id, rating=payload.rating, comment=payload.comment.strip() if payload.comment else None)
    db.add(review); db.flush()
    grant_points(db, current_user.id, 5, "TRADE_REVIEW", "vault_trade_review", str(review.id))
    db.commit(); db.refresh(review)
    return TradeReviewRead.model_validate(review, from_attributes=True)


@router.get("/points", response_model=PointHistory)
def points(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> PointHistory:
    items = db.scalars(select(VaultPointTransaction).where(VaultPointTransaction.user_id == current_user.id).order_by(VaultPointTransaction.created_at.desc(), VaultPointTransaction.id.desc()).limit(200)).all()
    return PointHistory(balance=point_balance(db, current_user.id), items=[PointTransactionRead.model_validate(item) for item in items])


@router.post("/points/buy-capacity", response_model=VaultSummary)
def purchase_capacity(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> VaultSummary:
    buy_capacity_pack(db, current_user.id)
    return summary(current_user, db)


@router.get("/hkk/search", response_model=list[HkkSearchResult])
def hkk_search(q: str | None = Query(default=None, max_length=120), limit: int = Query(default=500, ge=1, le=1000), edition_id: str | None = Query(default=None, pattern=r"^[1-9][0-9]*$"), current_user: User = Depends(require_active_user)) -> list[HkkSearchResult]:
    del current_user
    normalized_query = (q or "").strip()
    if normalized_query and len(normalized_query) < 2:
        raise HTTPException(status_code=422, detail="A keresőkifejezés legalább 2 karakter legyen.")
    if edition_id:
        _, cards = hkk_edition_cards(str(int(edition_id)))
        if normalized_query:
            needle = normalized_query.casefold()
            cards = [card for card in cards if needle in card["card_name"].casefold()]
        return [HkkSearchResult.model_validate(item) for item in cards[:limit]]
    if not normalized_query:
        raise HTTPException(status_code=422, detail="Adj meg legalább két karaktert vagy válassz kiegészítőt.")
    return [HkkSearchResult.model_validate(item) for item in search_hkk_cards(normalized_query, limit)]


@router.get("/hkk/images/{card_id}", include_in_schema=False)
def hkk_card_image(card_id: int = Path(gt=0)) -> Response:
    content, media_type = fetch_hkk_card_image(card_id)
    return Response(
        content=content,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=86400, stale-while-revalidate=604800"},
    )


@router.get("/hkk/editions", response_model=list[HkkEditionRead])
def hkk_editions(current_user: User = Depends(require_active_user)) -> list[HkkEditionRead]:
    del current_user
    return [HkkEditionRead.model_validate(item) for item in list_hkk_editions()]


@router.get("/hkk/editions/{edition_id}/cards", response_model=HkkEditionCards)
def hkk_edition_preview(edition_id: str, current_user: User = Depends(require_active_user)) -> HkkEditionCards:
    del current_user
    if not edition_id.isdigit() or int(edition_id) <= 0:
        raise HTTPException(status_code=422, detail="Hibás HKK kiegészítő-azonosító.")
    edition, cards = hkk_edition_cards(str(int(edition_id)))
    return HkkEditionCards(edition=HkkEditionRead.model_validate(edition), count=len(cards), cards=[HkkSearchResult.model_validate(card) for card in cards])


@router.post("/hkk/editions/import", response_model=HkkEditionImportResult)
def hkk_edition_import(payload: HkkEditionImport, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> HkkEditionImportResult:
    result = import_hkk_edition(
        db,
        user_id=current_user.id,
        edition_id=str(int(payload.edition_id)),
        folder_id=payload.folder_id,
        quantity=payload.quantity,
        missing_only=payload.missing_only,
        rarities=payload.rarities,
    )
    return HkkEditionImportResult.model_validate(result)
