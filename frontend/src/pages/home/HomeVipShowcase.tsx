import { useEffect, useState, type TouchEvent } from "react";
import { Link } from "react-router";
import type { Auction } from "../../api/auctions";
import { toAuctionCardItem } from "../../utils/auctionPresentation";
import { formatMoney } from "../../utils/format";
import { HomeCountdown } from "./HomeCountdown";

function cardsPerPage() {
  if (window.matchMedia("(max-width: 660px)").matches) return 1;
  if (window.matchMedia("(max-width: 1100px)").matches) return 2;
  return 3;
}

export function HomeVipShowcase({ auctions }: { auctions: Auction[] }) {
  const [pageSize, setPageSize] = useState(cardsPerPage);
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isHidden, setIsHidden] = useState(document.hidden);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const pages = Math.max(1, Math.ceil(auctions.length / pageSize));

  useEffect(() => {
    const small = window.matchMedia("(max-width: 660px)");
    const medium = window.matchMedia("(max-width: 1100px)");
    const update = () => { setPageSize(small.matches ? 1 : medium.matches ? 2 : 3); setPage(0); };
    update();
    small.addEventListener("change", update);
    medium.addEventListener("change", update);
    return () => { small.removeEventListener("change", update); medium.removeEventListener("change", update); };
  }, []);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    const visible = () => setIsHidden(document.hidden);
    update();
    mq.addEventListener("change", update);
    document.addEventListener("visibilitychange", visible);
    return () => { mq.removeEventListener("change", update); document.removeEventListener("visibilitychange", visible); };
  }, []);
  useEffect(() => { setPage(value => Math.min(value, pages - 1)); }, [pages]);
  useEffect(() => {
    if (pages <= 1 || paused || reducedMotion || isHidden) return;
    const timer = window.setInterval(() => setPage(value => (value + 1) % pages), 6500);
    return () => window.clearInterval(timer);
  }, [pages, paused, reducedMotion, isHidden]);

  if (auctions.length === 0) {
    return <div className="nv-vip-empty">
      <span className="nv-vip-label">VIP KIEMELT</span>
      <h2>Kiemelt hely a legkülönlegesebb aukcióknak</h2>
      <p>A VIP-aukciók itt kapnak különleges megjelenést. Jelenleg nincs aktív kiemelt ajánlat.</p>
      <Link className="button button-secondary" to="/account/vip">VIP lehetőségek</Link>
    </div>;
  }

  const current = auctions.slice(page * pageSize, (page + 1) * pageSize);
  const swipeEnd = (e: TouchEvent<HTMLDivElement>) => {
    if (touchStart === null) return;
    const diff = e.changedTouches[0].clientX - touchStart;
    setTouchStart(null);
    if (Math.abs(diff) > 45) setPage(value => (value + (diff < 0 ? 1 : pages - 1)) % pages);
  };
  return <div className="nv-vip-wrap" aria-label="VIP kiemelt aukciók" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false); }}>
    <div className="nv-vip-grid" onTouchStart={e => setTouchStart(e.touches[0].clientX)} onTouchEnd={swipeEnd}>
      {current.map(auction => {
        const card = toAuctionCardItem(auction);
        return <Link className="nv-vip-card" to={`/auctions/${auction.id}`} key={auction.id}>
          <span className="nv-vip-label">VIP KIEMELT</span>
          <div className="nv-vip-image">
            {card.imageUrl ? <img src={card.imageUrl} alt={auction.title} loading="lazy" /> : <span className="nv-no-image">Kép nélkül</span>}
            {auction.status === "active" && <div className="nv-vip-timer"><HomeCountdown endsAt={auction.ends_at} status={auction.status} compact /></div>}
          </div>
          <strong className="nv-vip-title">{auction.title}</strong>
          <div className="nv-vip-price"><b>{formatMoney(auction.current_price)}</b><small> · {auction.bid_count ?? 0} licit</small></div>
        </Link>;
      })}
    </div>
    {pages > 1 && <nav className="nv-vip-pages" aria-label="VIP aukciók lapozása">
      <button type="button" aria-label="Előző VIP-oldal" onClick={() => setPage(value => (value + pages - 1) % pages)}>‹</button>
      {Array.from({ length: pages }, (_, i) => <button key={i} type="button" aria-label={`VIP-oldal ${i + 1}`} aria-current={page === i ? "page" : undefined} className={page === i ? "is-active" : ""} onClick={() => setPage(i)} />)}
      <button type="button" aria-label="Következő VIP-oldal" onClick={() => setPage(value => (value + 1) % pages)}>›</button>
    </nav>}
  </div>;
}
