import { Link } from "react-router";
import type { Auction } from "../../api/auctions";
import { AuctionCard } from "../../components/AuctionCard";
import { toAuctionCardItem } from "../../utils/auctionPresentation";

export function HomeLiveBids({ auctions }: { auctions: Auction[] }) {
  const active = auctions.filter(auction => auction.status === "active").slice(0, 4);
  if (!active.length) return null;

  return <section className="container nv-bids-section" aria-label="Hamarosan záruló aukciók">
    <div className="section-heading nv-section-heading">
      <h2><span className="nv-live-pill">● ÉLŐ</span> LICITEK HAMAROSAN ZÁRULNAK</h2>
      <Link className="text-link" to="/marketplace?tab=auctions">Összes aukció</Link>
    </div>
    <div className={`nv-bids-grid ${active.length % 2 ? "nv-bids-grid-odd" : ""}`.trim()}>
      {active.map((auction, index) => <AuctionCard
        key={auction.id}
        item={toAuctionCardItem(auction)}
        index={index}
        detailPath={`/auctions/${auction.id}`}
        variant="live"
      />)}
    </div>
  </section>;
}
