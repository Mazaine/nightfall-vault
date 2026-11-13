import { Link } from "react-router";
import type { Auction } from "../../api/auctions";
import { AuctionLivePanel } from "../../components/AuctionLivePanel";
import { toAuctionCardItem } from "../../utils/auctionPresentation";
import { formatMoney } from "../../utils/format";

export function HomeLiveBids({ auctions }: { auctions: Auction[] }) {
  const active = auctions.filter(auction => auction.status === "active").slice(0, 4);
  if (!active.length) return null;

  return <section className="container nv-bids-section" aria-label="Hamarosan záruló aukciók">
    <div className="section-heading nv-section-heading">
      <h2><span className="nv-live-pill">● ÉLŐ</span> LICITEK HAMAROSAN ZÁRULNAK</h2>
      <Link className="text-link" to="/marketplace?tab=auctions">Összes aukció</Link>
    </div>
    <div className={`nv-bids-grid ${active.length % 2 ? "nv-bids-grid-odd" : ""}`.trim()}>
      {active.map(auction => {
        const item = toAuctionCardItem(auction);
        const detailPath = `/auctions/${auction.id}`;
        const minNext = Number(auction.current_price) + Number(auction.bid_increment);
        return <AuctionLivePanel
          key={auction.id}
          title={auction.title}
          detailPath={detailPath}
          imageUrl={item.imageUrl}
          zoomImageUrl={item.zoomImageUrl}
          sellerName={item.sellerName}
          sellerRating={item.sellerRating}
          condition={item.condition}
          price={formatMoney(auction.current_price)}
          bidCount={auction.bid_count ?? 0}
          status={auction.status}
          endsAt={auction.ends_at}
          fiveMinuteRuleEnabled={auction.five_minute_rule_enabled}
          isFeatured={auction.is_featured ?? false}
          isDemo={auction.is_demo ?? false}
          mainAction={<Link className="button button-primary" to={detailPath}>Licitálok · min. {formatMoney(minNext)}</Link>}
          secondaryAction={auction.buy_now_enabled && auction.buy_now_price
            ? <Link className="nv-bid-buynow" to={detailPath}>⚡ Villámár {formatMoney(auction.buy_now_price)}</Link>
            : null}
        />;
      })}
    </div>
  </section>;
}
