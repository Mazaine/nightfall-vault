import { Link } from "react-router-dom";
import type { FeaturedAuction } from "../data/content";

type AuctionCardProps = {
  item: FeaturedAuction;
  index: number;
  detailPath: string;
  actionLabel?: string;
  priceLabel?: string;
  showTimer?: boolean;
};

export function AuctionCard({
  item,
  index,
  detailPath,
  actionLabel = "Részletek",
  priceLabel = "Jelenlegi licit",
  showTimer = true,
}: AuctionCardProps) {
  return (
    <article className={`auction-card auction-card-${index + 1}`}>
      <div className="auction-image" aria-hidden="true" />
      {showTimer && <div className="auction-time">{item.time}</div>}

      <div className="auction-content">
        <h3>{item.title}</h3>
        <p>{item.type}</p>
        <span>{priceLabel}</span>
        <strong>{item.price}</strong>
        <small>Licitlépcső: {item.step}</small>
        <Link className="button button-secondary" to={detailPath}>
          {actionLabel}
        </Link>
      </div>
    </article>
  );
}
