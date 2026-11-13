import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { Auction } from "../../api/auctions";
import { AuctionCard } from "../../components/AuctionCard";
import { toAuctionCardItem } from "../../utils/auctionPresentation";

export function HomeCardGrid({ auctions, total, isLoading = false }: { auctions: Auction[]; total: number; isLoading?: boolean }) {
  return <section className="container home-products-section" aria-label="Lapok" id="home-products">
    <div className="section-heading nv-section-heading">
      <h2>LAPOK <small>{total.toLocaleString("hu-HU")} DB</small></h2>
      <Link className="text-link" to="/marketplace?tab=cards">Összes a piactéren</Link>
    </div>
    {isLoading && <div className="skeleton-grid" role="status" aria-label="Lapok betöltése" />}
    {!isLoading && auctions.length === 0 && <p className="nv-section-empty">Jelenleg nincs elérhető HKK-lap.</p>}
    {auctions.length > 0 && <div className="auction-grid home-products-grid">
      {auctions.map((auction, index) => <AuctionCard item={toAuctionCardItem(auction)} index={index} detailPath={`/auctions/${auction.id}`} key={auction.id} />)}
    </div>}
    {total > 0 && <div className="home-products-more"><Link className="button button-secondary" to="/marketplace?tab=cards">Összes lap megtekintése ({total.toLocaleString("hu-HU")} db) →</Link></div>}
  </section>;
}

export function HomeSealedProducts({ auctions, total }: { auctions: Auction[]; total: number }) {
  const rail = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  const scroll = (direction: number) => {
    const element = rail.current;
    if (!element) return;
    const child = element.querySelector<HTMLElement>(".auction-card");
    const step = (child?.offsetWidth ?? 220) + 12;
    const maxScroll = element.scrollWidth - element.clientWidth;
    if (direction > 0 && element.scrollLeft >= maxScroll - 5) element.scrollTo({ left: 0, behavior: "smooth" });
    else element.scrollBy({ left: step * direction * 2, behavior: "smooth" });
  };
  useEffect(() => {
    if (paused || auctions.length <= 5 || document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => scroll(1), 6500);
    return () => window.clearInterval(timer);
  }, [auctions.length, paused]);

  if (auctions.length === 0) return null;
  return <section className="container home-sealed-section" aria-label="Bontatlan termékek">
    <div className="section-heading nv-section-heading">
      <h2>BONTATLAN TERMÉKEK <small>{total.toLocaleString("hu-HU")} DB</small></h2>
      <div className="nv-sealed-actions">
        <Link className="text-link" to="/marketplace?tab=bundles">Összes bontatlan</Link>
        <button className="nv-sealed-arrow" type="button" aria-label="Előző bontatlan termékek" onClick={() => scroll(-1)}>‹</button>
        <button className="nv-sealed-arrow" type="button" aria-label="Következő bontatlan termékek" onClick={() => scroll(1)}>›</button>
      </div>
    </div>
    <div className="auction-grid home-sealed-rail" ref={rail} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false); }}>
      {auctions.map((auction, index) => <AuctionCard item={toAuctionCardItem(auction)} index={index} detailPath={`/auctions/${auction.id}`} key={auction.id} />)}
    </div>
  </section>;
}
