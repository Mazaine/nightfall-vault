import { Link, useParams } from "react-router-dom";
import { featuredAuctions } from "../data/content";

export function AuctionDetailPage() {
  const { auctionId } = useParams();
  const auction = featuredAuctions.find((item) => item.id === auctionId) ?? featuredAuctions[0];

  return (
    <section className="container page-shell detail-layout">
      <div className="detail-media auction-image" aria-hidden="true" />
      <div className="side-panel detail-panel">
        <p className="eyebrow">{auction.type}</p>
        <h1>{auction.title}</h1>
        <p className="hero-lead">
          Részletes aukciós oldal licitálási összefoglalóval,
          állapotinformációkkal és szállítási tudnivalókkal.
        </p>
        <dl className="detail-list">
          <div><dt>Jelenlegi licit</dt><dd>{auction.price}</dd></div>
          <div><dt>Licitlépcső</dt><dd>{auction.step}</dd></div>
          <div><dt>Hátralévő idő</dt><dd>{auction.time}</dd></div>
        </dl>
        <div className="hero-actions">
          <button className="button button-primary" type="button">Licitálok</button>
          <Link className="button button-ghost" to="/auctions">Vissza az aukciókhoz</Link>
        </div>
      </div>
    </section>
  );
}
