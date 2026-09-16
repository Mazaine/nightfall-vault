import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { Link } from "react-router";
import type { Auction } from "../../api/auctions";
import { AuctionCard } from "../../components/AuctionCard";
import { toAuctionCardItem } from "../../utils/auctionPresentation";

const DESKTOP_PAGE_SIZE = 4;
const TABLET_PAGE_SIZE = 2;
const MOBILE_PAGE_SIZE = 1;

function getPageSize() {
  if (typeof window === "undefined" || !window.matchMedia) return DESKTOP_PAGE_SIZE;
  if (window.matchMedia("(max-width: 760px)").matches) return MOBILE_PAGE_SIZE;
  if (window.matchMedia("(max-width: 1100px)").matches) return TABLET_PAGE_SIZE;
  return DESKTOP_PAGE_SIZE;
}

type Props = {
  title: string;
  auctions: Auction[];
  sectionClassName: string;
  isLoading?: boolean;
  emptyTitle?: string;
  children?: ReactNode;
};

export function HomeAuctionCarousel({ title, auctions, sectionClassName, isLoading = false, emptyTitle, children }: Props) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(getPageSize);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(typeof document !== "undefined" && document.hidden);
  const [reducedMotion, setReducedMotion] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const manualPauseUntil = useRef(0);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 760px)");
    const tabletQuery = window.matchMedia("(max-width: 1100px)");
    const updatePageSize = () => {
      setPageSize(mobileQuery.matches ? MOBILE_PAGE_SIZE : tabletQuery.matches ? TABLET_PAGE_SIZE : DESKTOP_PAGE_SIZE);
      setPageIndex(0);
    };
    updatePageSize();
    mobileQuery.addEventListener("change", updatePageSize);
    tabletQuery.addEventListener("change", updatePageSize);
    return () => {
      mobileQuery.removeEventListener("change", updatePageSize);
      tabletQuery.removeEventListener("change", updatePageSize);
    };
  }, []);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(motion.matches);
    const updateVisibility = () => setHidden(document.hidden);
    updateMotion();
    document.addEventListener("visibilitychange", updateVisibility);
    motion.addEventListener("change", updateMotion);
    return () => {
      document.removeEventListener("visibilitychange", updateVisibility);
      motion.removeEventListener("change", updateMotion);
    };
  }, []);

  const pageCount = Math.max(1, Math.ceil(auctions.length / pageSize));
  const visibleAuctions = auctions.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  const showPreviousPage = () => {
    manualPauseUntil.current = Date.now() + 12000;
    setPageIndex((current) => current === 0 ? pageCount - 1 : current - 1);
  };
  const showNextPage = () => {
    manualPauseUntil.current = Date.now() + 12000;
    setPageIndex((current) => current >= pageCount - 1 ? 0 : current + 1);
  };

  useEffect(() => {
    if (pageCount <= 1 || paused || hidden || reducedMotion) return;
    const timer = window.setInterval(() => {
      if (Date.now() >= manualPauseUntil.current) setPageIndex((current) => current >= pageCount - 1 ? 0 : current + 1);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [pageCount, paused, hidden, reducedMotion]);

  useEffect(() => { setPageIndex((current) => Math.min(current, pageCount - 1)); }, [pageCount]);

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null || pageCount <= 1) return;
    const distance = event.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(distance) < 50) return;
    if (distance < 0) showNextPage();
    else showPreviousPage();
  };

  return (
    <section className={`container ${sectionClassName}`} aria-label={title} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
      <div className="main-column">
        <div className="section-heading">
          <h2>{title}</h2>
          <Link className="text-link" to="/auctions">Összes aukció</Link>
        </div>
        {isLoading ? <div className="skeleton-grid" role="status" aria-label={`${title} betöltése`}>{Array.from({ length: pageSize }).map((_, index) => <div className="skeleton-card" key={index} />)}</div> : null}
        {!isLoading && auctions.length === 0 && emptyTitle ? (
          <div className="side-panel empty-state">
            <h3>{emptyTitle}</h3>
            <Link className="button button-secondary" to="/auctions">Aukciók böngészése</Link>
          </div>
        ) : null}
        {!isLoading && auctions.length > 0 ? (
          <div className="auction-grid home-auction-grid" onTouchStart={(event) => { touchStartX.current = event.touches[0].clientX; }} onTouchEnd={handleTouchEnd}>
            {visibleAuctions.map((auction, index) => <AuctionCard item={toAuctionCardItem(auction)} index={index} detailPath={`/auctions/${auction.id}`} key={auction.id} />)}
          </div>
        ) : null}
        {!isLoading && pageCount > 1 ? (
          <nav className="featured-carousel-controls" aria-label={`${title} lapozása`}>
            <button className="button button-secondary" type="button" onClick={showPreviousPage} aria-label={`Előző ${title.toLowerCase()}`}>‹ <span>Előző</span></button>
            <span className="featured-carousel-page" aria-live="polite">{pageIndex + 1} / {pageCount}</span>
            <button className="button button-secondary" type="button" onClick={showNextPage} aria-label={`Következő ${title.toLowerCase()}`}><span>Következő</span> ›</button>
          </nav>
        ) : null}
      </div>
      {children}
    </section>
  );
}
