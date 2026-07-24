import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listAuctions, type Auction } from "../../api/auctions";
import { AuctionCard } from "../../components/AuctionCard";
import { toAuctionCardItem } from "../../utils/auctionPresentation";
import { HomeTrustPanel } from "./HomeTrustPanel";
import { useAuctionRealtime } from "../../AuctionRealtimeContext";

const FEATURED_PAGE_SIZE = 5;

export function HomeFeatured() {
  const { subscribe } = useAuctionRealtime();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadFeatured = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [active, scheduled] = await Promise.all([
        listAuctions({ status: "active", sort: "soon_ending", limit: 100 }),
        listAuctions({ status: "scheduled", sort: "oldest", limit: 100 }),
      ]);
      const combined = [...active.items, ...scheduled.items];
      combined.sort((left, right) => Number(Boolean(right.is_featured)) - Number(Boolean(left.is_featured)));
      setAuctions(combined.filter((auction) => auction.is_featured));
      setPageIndex(0);
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

  const pageCount = Math.max(1, Math.ceil(auctions.length / FEATURED_PAGE_SIZE));
  const visibleAuctions = auctions.slice(pageIndex * FEATURED_PAGE_SIZE, (pageIndex + 1) * FEATURED_PAGE_SIZE);

  return (
    <section className="container home-featured-section">
      <div className="main-column">
        <div className="section-heading">
          <div><h2>Kiemelt aukciók</h2></div>
          <div className="featured-carousel-heading-actions">
            {auctions.length > FEATURED_PAGE_SIZE ? (
              <div className="featured-carousel-controls" aria-label="Kiemelt aukciók lapozása">
                <button className="button button-secondary" type="button" disabled={pageIndex === 0} onClick={() => setPageIndex((current) => Math.max(0, current - 1))} aria-label="Előző kiemelt aukciók">‹</button>
                <span aria-live="polite">{pageIndex + 1} / {pageCount}</span>
                <button className="button button-secondary" type="button" disabled={pageIndex >= pageCount - 1} onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))} aria-label="Következő kiemelt aukciók">›</button>
              </div>
            ) : null}
            <Link className="text-link" to="/auctions">Összes aukció</Link>
          </div>
        </div>

        {isLoading ? (
          <div className="skeleton-grid" role="status" aria-label="Kiemelt aukciók betöltése">
            {Array.from({ length: FEATURED_PAGE_SIZE }).map((_, index) => <div className="skeleton-card" key={index} />)}
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
            {visibleAuctions.map((auction, index) => (
              <AuctionCard item={toAuctionCardItem(auction)} index={index} detailPath={`/auctions/${auction.id}`} key={auction.id} />
            ))}
          </div>
        ) : null}
      </div>
      <HomeTrustPanel />
    </section>
  );
}
