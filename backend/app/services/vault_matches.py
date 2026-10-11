from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256

from sqlalchemy import and_, select, update
from sqlalchemy.orm import Session

from app.models.vault import VaultCollectionCard, VaultMatchState, VaultTradeCard
from app.services.notifications import create_notification


def _now() -> datetime:
    return datetime.now(timezone.utc)


def vault_match_key(wanted: VaultCollectionCard, offered: VaultTradeCard) -> str:
    identity = "|".join((
        f"seeker:{wanted.user_id}",
        f"owner:{offered.user_id}",
        f"card:{wanted.external_card_id}",
        f"wanted-variant:{wanted.print_variant}",
        f"offered-variant:{offered.print_variant}",
        f"wanted-quantity:{wanted.wanted_quantity}",
        f"offered-quantity:{offered.quantity}",
    ))
    return sha256(identity.encode("utf-8")).hexdigest()


def sync_vault_matches(db: Session, user_id: int, *, notify: bool = True) -> list[VaultMatchState]:
    rows = db.execute(
        select(VaultCollectionCard, VaultTradeCard)
        .join(
            VaultTradeCard,
            and_(
                VaultTradeCard.external_card_id == VaultCollectionCard.external_card_id,
                VaultTradeCard.user_id != VaultCollectionCard.user_id,
            ),
        )
        .where(
            VaultCollectionCard.user_id == user_id,
            VaultCollectionCard.wanted.is_(True),
            VaultCollectionCard.wanted_quantity > 0,
        )
        .order_by(VaultCollectionCard.id, VaultTradeCard.id)
    ).all()
    now = _now()
    current = {vault_match_key(wanted, offered): (wanted, offered) for wanted, offered in rows}
    states = list(db.scalars(select(VaultMatchState).where(VaultMatchState.user_id == user_id)).all())
    by_key = {state.match_key: state for state in states}
    new_keys: list[str] = []

    for state in states:
        if state.is_active and state.match_key not in current:
            state.is_active = False

    for match_key, (wanted, offered) in current.items():
        state = by_key.get(match_key)
        if state is None:
            state = VaultMatchState(
                user_id=user_id,
                collection_card_id=wanted.id,
                offered_card_id=offered.id,
                owner_id=offered.user_id,
                match_key=match_key,
                external_card_id=wanted.external_card_id,
                wanted_quantity=wanted.wanted_quantity,
                offered_quantity=offered.quantity,
                is_active=True,
                last_seen_at=now,
            )
            db.add(state)
            by_key[match_key] = state
            new_keys.append(match_key)
        else:
            state.is_active = True
            state.collection_card_id = wanted.id
            state.offered_card_id = offered.id
            state.owner_id = offered.user_id
            state.last_seen_at = now

    db.flush()
    if notify and new_keys:
        batch_key = sha256("|".join(sorted(new_keys)).encode("utf-8")).hexdigest()[:32]
        count = len(new_keys)
        create_notification(
            db,
            user_id=user_id,
            notification_type="vault_match",
            title="Új cserelehetőséged érkezett!",
            message=f"{count} új találat érkezett a Virtuális HKK Mappádhoz.",
            target_url="/vault?area=trade&view=matches",
            event_key=f"vault-match:{user_id}:{batch_key}",
            send_email=False,
        )
    return [state for state in by_key.values() if state.is_active]


def sync_vault_matches_for_card(db: Session, external_card_id: str) -> None:
    user_ids = db.scalars(
        select(VaultCollectionCard.user_id)
        .where(
            VaultCollectionCard.external_card_id == external_card_id,
            VaultCollectionCard.wanted.is_(True),
            VaultCollectionCard.wanted_quantity > 0,
        )
        .distinct()
    ).all()
    for user_id in user_ids:
        sync_vault_matches(db, int(user_id))


def unseen_vault_matches(db: Session, user_id: int) -> list[VaultMatchState]:
    sync_vault_matches(db, user_id)
    return list(db.scalars(
        select(VaultMatchState)
        .where(VaultMatchState.user_id == user_id, VaultMatchState.is_active.is_(True), VaultMatchState.seen_at.is_(None))
        .order_by(VaultMatchState.first_seen_at, VaultMatchState.id)
    ).all())


def mark_vault_matches_seen(db: Session, user_id: int, match_keys: list[str]) -> int:
    result = db.execute(
        update(VaultMatchState)
        .where(
            VaultMatchState.user_id == user_id,
            VaultMatchState.is_active.is_(True),
            VaultMatchState.seen_at.is_(None),
            VaultMatchState.match_key.in_(match_keys),
        )
        .values(seen_at=_now())
    )
    return int(result.rowcount or 0)
