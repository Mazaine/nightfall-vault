import { Link } from "react-router-dom";
import { AuctionCard } from "../../components/AuctionCard";
import { featuredAuctions } from "../../data/content";
import { HomeTrustPanel } from "./HomeTrustPanel";

export function HomeFeatured() {
  return (
    <section className="container content-grid">
      <div className="main-column">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Kurált válogatás</p>
            <h2>Kiemelt aukciók</h2>
          </div>
          <Link className="text-link" to="/auctions">Összes aukció</Link>
        </div>

        <div className="auction-grid">
          {featuredAuctions.map((auction, index) => (
            <AuctionCard
              item={auction}
              index={index}
              detailPath={`/auctions/${auction.id}`}
              key={auction.id}
            />
          ))}
        </div>
      </div>

      <HomeTrustPanel />
    </section>
  );
}
