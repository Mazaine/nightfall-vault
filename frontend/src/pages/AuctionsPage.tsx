import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listAuctions, type Auction } from "../api/auctions";
import { AuctionCard } from "../components/AuctionCard";
import { formatMoney, formatRemainingTime } from "../utils/format";

function toCardAuction(auction: Auction) {
  return {
    id: auction.id,
    title: auction.title,
    type: auction.category,
    price: formatMoney(auction.current_price ?? auction.starting_price),
    step: formatMoney(auction.bid_increment),
    time: formatRemainingTime(auction.ends_at, auction.status),
    sellerName: auction.seller?.full_name ?? auction.seller?.username ?? "Eladó",
    sellerRating: "Értékelés később",
    buyNowPrice: auction.buy_now_enabled ? auction.buy_now_price : null,
    isClosed: ["ended", "sold", "unsold", "cancelled", "suspended"].includes(auction.status),
  };
}

export function AuctionsPage() {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listAuctions()
      .then(setAuctions)
      .catch((err: Error) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <section className="container page-shell">
      <p className="eyebrow">Aukciók</p>
      <div className="section-heading page-heading">
        <h1>Aktív aukciók</h1>
        <Link className="button button-primary" to="/register">Fiók létrehozása</Link>
      </div>
      {isLoading ? <div className="side-panel">Aukciók betöltése...</div> : null}
      {error ? <div className="side-panel form-message">{error}</div> : null}
      {!isLoading && !error && auctions.length === 0 ? (
        <div className="side-panel">Jelenleg nincs nyilvános aukció.</div>
      ) : null}
      <div className="auction-grid page-grid">
        {auctions.map((auction, index) => (
          <AuctionCard
            item={toCardAuction(auction)}
            index={index}
            detailPath={`/auctions/${auction.id}`}
            key={auction.id}
          />
        ))}
      </div>
    </section>
  );
}
