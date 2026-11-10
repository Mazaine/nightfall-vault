"""Read-only audit for legacy fixed-price purchases without quantity snapshots.

Run locally/test only:
    python -m app.scripts.audit_fixed_price_transactions

The script never writes. It flags old fixed-price transactions whose listing
advertised more than one copy but has no AuctionTransactionItem row, so the
historical purchased quantity cannot be proven from stored transaction data.
"""
from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models.auction import Auction
from app.models.transaction import AuctionTransaction, AuctionTransactionItem


def main() -> None:
    with SessionLocal() as db:
        item_count = select(
            AuctionTransactionItem.transaction_id.label("transaction_id"),
            func.count(AuctionTransactionItem.id).label("item_count"),
        ).group_by(AuctionTransactionItem.transaction_id).subquery()
        rows = db.execute(
            select(AuctionTransaction, Auction, func.coalesce(item_count.c.item_count, 0))
            .join(Auction, Auction.id == AuctionTransaction.auction_id)
            .outerjoin(item_count, item_count.c.transaction_id == AuctionTransaction.id)
            .where(
                Auction.listing_type == "fixed",
                Auction.vault_quantity > 1,
                func.coalesce(item_count.c.item_count, 0) == 0,
            )
            .order_by(AuctionTransaction.id)
        ).all()
        print(f"Felülvizsgálandó régi fix áras ügyletek: {len(rows)}")
        for transaction, auction, _ in rows:
            print(
                f"transaction_id={transaction.id} auction_id={auction.id} "
                f"seller_id={transaction.seller_id} buyer_id={transaction.buyer_id} "
                f"listed_quantity={auction.vault_quantity} title={auction.title!r}"
            )


if __name__ == "__main__":
    main()
