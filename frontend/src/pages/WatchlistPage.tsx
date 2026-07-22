import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listWatchlist, removeWatchlistItem, type WatchlistItem } from "../api/auctions";
import { formatAuctionStatus, formatMoney } from "../utils/format";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncStates";
import { useAuctionRealtime } from "../AuctionRealtimeContext";

export function WatchlistPage() {
  const { subscribe } = useAuctionRealtime();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setItems(await listWatchlist());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült betölteni a figyelőlistát.");
    } finally { setIsLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => subscribe((snapshot) => {
    setItems((current) => current.map((item) => item.auction.id === snapshot.auction_id
      ? { ...item, auction: { ...item.auction, status: snapshot.status, current_price: snapshot.current_price, highest_bid_id: snapshot.highest_bid_id, winner_id: snapshot.winner_id, ends_at: snapshot.ends_at, bid_count: snapshot.bid_count } }
      : item));
  }), [subscribe]);

  async function remove(auctionId: number) {
    await removeWatchlistItem(auctionId);
    await load();
  }

  return (
    <>
        <span className="eyebrow">Fiók</span>
        <h1>Figyelőlista</h1>
        {isLoading ? <LoadingState label="Figyelőlista betöltése" /> : null}
        {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
        <div className="my-bids-list">
          {!isLoading && !error && items.length === 0 ? <EmptyState title="Még nincs figyelt aukciód" action={<Link className="button button-primary" to="/auctions">Aukciók böngészése</Link>} /> : null}
          {items.map(({ auction }) => (
            <article className="my-bid-row" key={auction.id}>
              <div>
                <strong>{auction.title}</strong>
                <span>{formatAuctionStatus(auction.status)} | {formatMoney(auction.current_price)}</span>
              </div>
              <div className="row-actions">
                <Link className="button button-secondary" to={`/auctions/${auction.id}`}>Megnyitás</Link>
                <button className="button button-ghost" type="button" onClick={() => remove(auction.id)}>Eltávolítás</button>
              </div>
            </article>
          ))}
        </div>
    </>
  );
}
