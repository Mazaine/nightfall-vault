import { Link } from "react-router";
import type { Auction } from "../../api/auctions";
import { AuctionCard } from "../../components/AuctionCard";
import { toAuctionCardItem } from "../../utils/auctionPresentation";

export function HomeAuctionSection({ title, auctions }: { title: string; auctions: Auction[] }) {
  if (!auctions.length) return null;
  return <section className="container home-discovery-section" aria-label={title}>
    <div className="section-heading"><h2>{title}</h2><Link className="text-link" to="/auctions">Összes aukció</Link></div>
    <div className="auction-grid home-auction-grid">{auctions.map((auction, index) => <AuctionCard item={toAuctionCardItem(auction)} index={index} detailPath={`/auctions/${auction.id}`} key={auction.id} />)}</div>
  </section>;
}
