import { Link } from "react-router-dom";
import { AuctionCard } from "../components/AuctionCard";
import { featuredAuctions } from "../data/content";

export function AuctionsPage() {
  return (
    <section className="container page-shell">
      <p className="eyebrow">Aukciók</p>
      <div className="section-heading page-heading">
        <h1>Aktív aukciók</h1>
        <Link className="button button-primary" to="/register">Fiók létrehozása</Link>
      </div>
      <div className="auction-grid page-grid">
        {featuredAuctions.map((auction, index) => (
          <AuctionCard
            item={auction}
            index={index}
            detailPath={`/auctions/${auction.id}`}
            actionLabel="Megnézem"
            key={auction.id}
          />
        ))}
      </div>
    </section>
  );
}
