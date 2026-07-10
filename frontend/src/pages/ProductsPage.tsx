import { Link } from "react-router-dom";
import { AuctionCard } from "../components/AuctionCard";
import { featuredAuctions } from "../data/content";

export function ProductsPage() {
  return (
    <section className="container page-shell">
      <p className="eyebrow">Termékek</p>
      <div className="section-heading page-heading">
        <h1>Termékkatalógus</h1>
        <Link className="button button-primary" to="/cart">
          Kosár megnyitása
        </Link>
      </div>

      <div className="auction-grid page-grid">
        {featuredAuctions.map((product, index) => (
          <AuctionCard
            item={product}
            index={index}
            detailPath={`/products/${product.id}`}
            actionLabel="Részletek"
            priceLabel="Aktuális ár"
            showTimer={false}
            key={product.id}
          />
        ))}
      </div>
    </section>
  );
}
