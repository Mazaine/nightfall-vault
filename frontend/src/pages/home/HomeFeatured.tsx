import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listAuctions, type Auction } from "../../api/auctions";
import { AuctionCard } from "../../components/AuctionCard";
import { toAuctionCardItem } from "../../utils/auctionPresentation";
import { HomeTrustPanel } from "./HomeTrustPanel";
import { useAuctionRealtime } from "../../AuctionRealtimeContext";

export function HomeFeatured() {
  const { subscribe } = useAuctionRealtime();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadFeatured = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [active, scheduled] = await Promise.all([
        listAuctions({ status: "active", sort: "soon_ending", limit: 4 }),
        listAuctions({ status: "scheduled", sort: "oldest", limit: 4 }),
      ]);
      const combined = [...active.items, ...scheduled.items];
      combined.sort((left, right) => Number(Boolean(right.is_featured)) - Number(Boolean(left.is_featured)));
      setAuctions(combined.slice(0, 4));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "A kiemelt aukciók betöltése nem sikerült.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFeatured();
  }, [loadFeatured]);

  useEffect(() => subscribe((snapshot) => {
    setAuctions((items) => items.map((item) => item.id === snapshot.auction_id
      ? { ...item, status: snapshot.status, current_price: snapshot.current_price, highest_bid_id: snapshot.highest_bid_id, winner_id: snapshot.winner_id, ends_at: snapshot.ends_at, bid_count: snapshot.bid_count }
      : item));
  }), [subscribe]);

  return (
    <section className="container content-grid">
      <div className="main-column">
        <div className="section-heading">
          <div><h2>Kiemelt aukciók</h2></div>
          <Link className="text-link" to="/auctions">Összes aukció</Link>
        </div>

        {isLoading ? (
          <div className="skeleton-grid" role="status" aria-label="Kiemelt aukciók betöltése">
            {Array.from({ length: 4 }).map((_, index) => <div className="skeleton-card" key={index} />)}
          </div>
        ) : null}
        {!isLoading && error ? (
          <div className="side-panel empty-state" role="alert">
            <h3>A kiemelt aukciók most nem érhetők el</h3>
            <p>{error}</p>
            <button className="button button-secondary" type="button" onClick={() => void loadFeatured()}>Újrapróbálás</button>
          </div>
        ) : null}
        {!isLoading && !error && auctions.length === 0 ? (
          <div className="side-panel empty-state">
            <h3>Jelenleg nincs aktív vagy hamarosan induló aukció</h3>
            <Link className="button button-secondary" to="/auctions">Aukciók böngészése</Link>
          </div>
        ) : null}
        {!isLoading && !error && auctions.length > 0 ? (
          <div className="auction-grid home-auction-grid">
            {auctions.map((auction, index) => (
              <AuctionCard item={toAuctionCardItem(auction)} index={index} detailPath={`/auctions/${auction.id}`} key={auction.id} />
            ))}
          </div>
        ) : null}
      </div>
      <HomeTrustPanel />
    </section>
  );
}
