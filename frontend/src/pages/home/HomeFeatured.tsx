import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";
import { Link } from "react-router-dom";
import { listAuctions, type Auction } from "../../api/auctions";
import { AuctionCard } from "../../components/AuctionCard";
import { toAuctionCardItem } from "../../utils/auctionPresentation";
import { HomeTrustPanel } from "./HomeTrustPanel";
import { useAuctionRealtime } from "../../AuctionRealtimeContext";

const FEATURED_PAGE_SIZE = 5;
const MOBILE_FEATURED_PAGE_SIZE = 1;

function getFeaturedPageSize() {
  return typeof window !== "undefined" && window.matchMedia?.("(max-width: 760px)").matches
    ? MOBILE_FEATURED_PAGE_SIZE
    : FEATURED_PAGE_SIZE;
}

export function HomeFeatured() {
  const { subscribe } = useAuctionRealtime();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(getFeaturedPageSize);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const touchStartX = useRef<number | null>(null);

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
    setAuctions((items) => items
      .filter((item) => item.id !== snapshot.auction_id || (snapshot.is_listed !== false && ["active", "scheduled"].includes(snapshot.status)))
      .map((item) => item.id === snapshot.auction_id
        ? { ...item, status: snapshot.status, current_price: snapshot.current_price, highest_bid_id: snapshot.highest_bid_id, winner_id: snapshot.winner_id, ends_at: snapshot.ends_at, bid_count: snapshot.bid_count }
        : item));
  }), [subscribe]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const updatePageSize = () => {
      setPageSize(mediaQuery.matches ? MOBILE_FEATURED_PAGE_SIZE : FEATURED_PAGE_SIZE);
      setPageIndex(0);
    };
    updatePageSize();
    mediaQuery.addEventListener("change", updatePageSize);
    return () => mediaQuery.removeEventListener("change", updatePageSize);
  }, []);

  const pageCount = Math.max(1, Math.ceil(auctions.length / pageSize));
  const visibleAuctions = auctions.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  const showPreviousPage = () => setPageIndex((current) => current === 0 ? pageCount - 1 : current - 1);
  const showNextPage = () => setPageIndex((current) => current >= pageCount - 1 ? 0 : current + 1);

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null || pageCount <= 1) return;
    const distance = event.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(distance) < 50) return;
    if (distance < 0) showNextPage();
    else showPreviousPage();
  };

  return (
    <section className="container home-featured-section">
      <div className="main-column">
        <div className="section-heading">
          <div><h2>Kiemelt aukciók</h2></div>
          <Link className="text-link" to="/auctions">Összes aukció</Link>
        </div>

        {isLoading ? (
          <div className="skeleton-grid" role="status" aria-label="Kiemelt aukciók betöltése">
            {Array.from({ length: pageSize }).map((_, index) => <div className="skeleton-card" key={index} />)}
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
            <h3>Jelenleg nincs aktív vagy hamarosan induló kiemelt aukció</h3>
            <Link className="button button-secondary" to="/auctions">Aukciók böngészése</Link>
          </div>
        ) : null}
        {!isLoading && !error && auctions.length > 0 ? (
          <div
            className="auction-grid home-auction-grid"
            onTouchStart={(event) => { touchStartX.current = event.touches[0].clientX; }}
            onTouchEnd={handleTouchEnd}
          >
            {visibleAuctions.map((auction, index) => (
              <AuctionCard item={toAuctionCardItem(auction)} index={index} detailPath={`/auctions/${auction.id}`} key={auction.id} />
            ))}
          </div>
        ) : null}
        {!isLoading && !error && pageCount > 1 ? (
          <nav className="featured-carousel-controls" aria-label="Kiemelt aukciók lapozása">
            <button className="button button-secondary" type="button" onClick={showPreviousPage} aria-label="Előző kiemelt aukciók">‹ <span>Előző</span></button>
            <span className="featured-carousel-page" aria-live="polite">{pageIndex + 1} / {pageCount}</span>
            <button className="button button-secondary" type="button" onClick={showNextPage} aria-label="Következő kiemelt aukciók"><span>Következő</span> ›</button>
          </nav>
        ) : null}
      </div>
      <HomeTrustPanel />
    </section>
  );
}
