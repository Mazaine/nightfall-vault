import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listWatchlist, removeWatchlistItem, type WatchlistItem } from "../api/auctions";
import { formatMoney } from "../utils/format";

export function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      setItems(await listWatchlist());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerult betolteni a figyelolistat.");
    }
  }

  useEffect(() => { void load(); }, []);

  async function remove(auctionId: number) {
    await removeWatchlistItem(auctionId);
    await load();
  }

  return (
    <section className="page-section">
      <div className="container">
        <span className="eyebrow">Fiok</span>
        <h1>Figyelolista</h1>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="my-bids-list">
          {items.length === 0 ? <p className="empty-state">Meg nincs figyelt aukciod.</p> : null}
          {items.map(({ auction }) => (
            <article className="my-bid-row" key={auction.id}>
              <div>
                <strong>{auction.title}</strong>
                <span>{auction.status} | {formatMoney(auction.current_price)}</span>
              </div>
              <div className="row-actions">
                <Link className="button button-secondary" to={`/auctions/${auction.id}`}>Megnyitas</Link>
                <button className="button button-ghost" type="button" onClick={() => remove(auction.id)}>Eltavolitas</button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
