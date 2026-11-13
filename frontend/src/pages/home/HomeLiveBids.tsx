import { Link } from "react-router";
import type { Auction } from "../../api/auctions";
import { toAuctionCardItem } from "../../utils/auctionPresentation";
import { formatMoney } from "../../utils/format";
import { HomeCountdown } from "./HomeCountdown";

export function HomeLiveBids({ auctions }: { auctions: Auction[] }) {
  const active = auctions.filter(a => a.status === "active").slice(0, 4);
  if (!active.length) return null;

  return <section className="container nv-bids-section" aria-label="Hamarosan záruló aukciók">
    <div className="section-heading nv-section-heading">
      <h2><span className="nv-live-pill">● ÉLŐ</span> LICITEK HAMAROSAN ZÁRULNAK</h2>
      <Link className="text-link" to="/marketplace?tab=auctions">Összes aukció</Link>
    </div>
    <div className={`nv-bids-grid ${active.length % 2 !== 0 ? "nv-bids-grid-odd" : ""}`.trim()}>
      {active.map(auction => {
        const card = toAuctionCardItem(auction);
        const minNext = Number(auction.current_price) + Number(auction.bid_increment);
        return <article className="nv-bid-card" key={auction.id}>
          <Link className="nv-bid-image" to={`/auctions/${auction.id}`} aria-label={auction.title}>
            {card.imageUrl ? <img src={card.imageUrl} alt={auction.title} loading="lazy" /> : <span className="nv-no-image">Kép nélkül</span>}
          </Link>
          <div className="nv-bid-body">
            <Link className="nv-bid-title" to={`/auctions/${auction.id}`}>{auction.title}</Link>
            <div className="nv-bid-seller">Eladó: {auction.seller?.full_name || auction.seller?.username || "Felhasználó"} · {auction.condition}</div>
            <div className="nv-bid-current">
              <div><small>JELENLEGI LICIT</small><strong>{formatMoney(auction.current_price)}</strong></div>
              <span className="nv-bid-count">{auction.bid_count ?? 0} licit</span>
            </div>
            <div className="nv-bid-timer-row">
              <div><small>ZÁRÁSIG</small>{auction.five_minute_rule_enabled && <span className="nv-bid-shield" title="Új licitnél érvényes az ötperces licitvédelem">5 perces védelem</span>}</div>
              <HomeCountdown endsAt={auction.ends_at} status={auction.status} />
            </div>
            <div className="nv-bid-progress"><span /></div>
            <div className="nv-bid-actions">
              <Link className="button button-primary" to={`/auctions/${auction.id}`}>Licitálok · min. {formatMoney(minNext)}</Link>
              {auction.buy_now_enabled && auction.buy_now_price && <Link className="nv-bid-buynow" to={`/auctions/${auction.id}`}>⚡ Villámár {formatMoney(auction.buy_now_price)}</Link>}
            </div>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
