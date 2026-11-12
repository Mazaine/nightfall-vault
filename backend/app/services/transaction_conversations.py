from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.auction import Auction, AuctionMessage
from app.models.transaction import AuctionTransaction, TransactionConversation, TransactionConversationMessage
from app.models.user import User
from app.services.moderation_actions import require_no_restriction
from app.services.notifications import create_notification
from app.services.realtime import publish_user_event
from app.services.security_audit import create_domain_audit_log
from app.services.transactions import serialize_transaction, transaction_options
from app.services.user_blocks import ensure_not_blocked


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def ensure_transaction_conversation(db: Session, transaction: AuctionTransaction) -> TransactionConversation:
    if transaction.conversation_id is not None:
        conversation = db.get(TransactionConversation, transaction.conversation_id)
        if conversation is not None:
            return conversation
    conversation_id = db.scalar(
        insert(TransactionConversation)
        .values(seller_id=transaction.seller_id, buyer_id=transaction.buyer_id)
        .on_conflict_do_nothing(index_elements=[TransactionConversation.seller_id, TransactionConversation.buyer_id])
        .returning(TransactionConversation.id)
    )
    if conversation_id is None:
        conversation_id = db.scalar(select(TransactionConversation.id).where(
            TransactionConversation.seller_id == transaction.seller_id,
            TransactionConversation.buyer_id == transaction.buyer_id,
        ))
    if conversation_id is None:
        raise RuntimeError("Az ügyletbeszélgetés nem hozható létre.")
    transaction.conversation_id = conversation_id
    db.add(transaction)
    conversation = db.get(TransactionConversation, conversation_id)
    if conversation is None:
        raise RuntimeError("Az ügyletbeszélgetés nem tölthető vissza.")
    return conversation


def conversation_options():
    return (
        joinedload(TransactionConversation.seller),
        joinedload(TransactionConversation.buyer),
        selectinload(TransactionConversation.transactions).options(*transaction_options()),
        selectinload(TransactionConversation.messages).joinedload(TransactionConversationMessage.sender),
    )


def get_participant_conversation(db: Session, conversation_id: int, user_id: int) -> TransactionConversation:
    conversation = db.scalar(select(TransactionConversation).where(
        TransactionConversation.id == conversation_id,
        or_(TransactionConversation.seller_id == user_id, TransactionConversation.buyer_id == user_id),
    ).options(*conversation_options()))
    if conversation is None:
        raise HTTPException(status_code=404, detail="Az ügyletbeszélgetés nem található.")
    from app.models.user import User
    if any(transaction.auction.shop_source for transaction in conversation.transactions) and db.get(User, user_id).role != "admin":
        raise HTTPException(404, "Az ügyletbeszélgetés nem található.")
    return conversation


def _legacy_messages(db: Session, conversation: TransactionConversation) -> list[dict]:
    auction_ids = [transaction.auction_id for transaction in conversation.transactions]
    if not auction_ids:
        return []
    titles = {transaction.auction_id: transaction.auction.title for transaction in conversation.transactions}
    messages = db.scalars(select(AuctionMessage).where(AuctionMessage.auction_id.in_(auction_ids)).options(
        joinedload(AuctionMessage.sender),
    ).order_by(AuctionMessage.created_at, AuctionMessage.id)).all()
    return [{
        "id": message.id,
        "source": "legacy",
        "conversation_id": conversation.id,
        "auction_id": message.auction_id,
        "auction_title": titles.get(message.auction_id),
        "sender_id": message.sender_id,
        "sender": message.sender,
        "message": message.message,
        "created_at": message.created_at,
        "read_at": message.read_at,
    } for message in messages]


def serialize_conversation(db: Session, conversation: TransactionConversation, user_id: int) -> dict:
    transactions = [serialize_transaction(transaction, user_id) for transaction in conversation.transactions]
    common_messages = [{
        "id": message.id,
        "source": "common",
        "conversation_id": conversation.id,
        "auction_id": None,
        "auction_title": None,
        "sender_id": message.sender_id,
        "sender": message.sender,
        "message": message.message,
        "created_at": message.created_at,
        "read_at": message.read_at,
    } for message in conversation.messages]
    messages = sorted([*_legacy_messages(db, conversation), *common_messages], key=lambda item: (item["created_at"], item["source"], item["id"]))
    partner = conversation.buyer if conversation.seller_id == user_id else conversation.seller
    return {
        "id": conversation.id,
        "role": "seller" if conversation.seller_id == user_id else "buyer",
        "partner": partner,
        "transactions": transactions,
        "messages": messages,
        "item_count": sum(item["quantity"] for transaction in transactions for item in transaction["items"]),
        "total": sum(transaction["total"] for transaction in transactions),
        "created_at": conversation.created_at,
        "updated_at": conversation.updated_at,
    }


def mark_conversation_read(db: Session, conversation: TransactionConversation, user_id: int) -> None:
    result = db.execute(update(TransactionConversationMessage).where(
        TransactionConversationMessage.conversation_id == conversation.id,
        TransactionConversationMessage.sender_id != user_id,
        TransactionConversationMessage.read_at.is_(None),
    ).values(read_at=now_utc()))
    if result.rowcount:
        db.commit()


def create_conversation_message(db: Session, conversation: TransactionConversation, sender: User, value: str) -> TransactionConversationMessage:
    require_no_restriction(db, sender.id, "chat_ban")
    recipient_id = conversation.buyer_id if sender.id == conversation.seller_id else conversation.seller_id
    ensure_not_blocked(db, sender.id, recipient_id, "Blokkolás miatt nem küldhető új chatüzenet.")
    normalized = value.strip()
    if not normalized:
        raise HTTPException(status_code=422, detail="Az üzenet nem lehet üres.")
    if len(normalized) > 2000:
        raise HTTPException(status_code=422, detail="Az üzenet túl hosszú.")
    message = TransactionConversationMessage(conversation_id=conversation.id, sender_id=sender.id, message=normalized)
    db.add(message)
    conversation.updated_at = now_utc()
    db.add(conversation)
    db.flush()
    target_url = f"/account/transactions/conversations/{conversation.id}"
    create_notification(
        db,
        user_id=recipient_id,
        notification_type="auction_message",
        title="Új üzenet a közös egyeztetésben",
        message=f"{sender.full_name or sender.username} üzenetet küldött a közös ügyletbeszélgetésben.",
        target_url=target_url,
        event_key=f"transaction-conversation-message:{message.id}:{recipient_id}",
    )
    create_domain_audit_log(db, action="transaction_conversation_message_sent", user_id=sender.id, metadata={
        "conversation_id": conversation.id,
        "recipient_id": recipient_id,
        "message_id": message.id,
    })
    db.commit()
    db.refresh(message)
    publish_user_event(recipient_id, "transaction_conversation_message", {
        "conversation_id": conversation.id,
        "message_id": message.id,
        "target_url": target_url,
    })
    return message
