import { Link } from "react-router-dom";
import type { FeaturedAuction } from "../data/content";

type AuctionCardProps = {
  item: FeaturedAuction;
  index: number;
  detailPath: string;
  actionLabel?: string;
  priceLabel?: string;
  showTimer?: boolean;
  showBidActions?: boolean;
};

export function AuctionCard({
  item,
  index,
  detailPath,
  actionLabel = "Részletek",
  priceLabel = "Jelenlegi licit",
  showTimer = true,
  showBidActions = true,
}: AuctionCardProps) {
  return (
    <article className={`auction-card auction-card-${index + 1}${item.isClosed ? " auction-card-closed" : ""}`}>
      <div className="auction-image" aria-hidden="true" />
      {showTimer && <div className="auction-time">{item.time}</div>}
      {item.userIsOutbid && <div className="auction-alert">Rád licitáltak</div>}

      <div className="auction-content">
        <h3>{item.title}</h3>
        <p>{item.type}</p>
        <div className="seller-meta">
          <span>Eladó: {item.sellerName}</span>
          <span>Értékelés: {item.sellerRating}</span>
        </div>
        <span>{priceLabel}</span>
        <strong>{item.price}</strong>
        <small>Licitlépcső: {item.step}</small>

        <div className="auction-actions">
          <Link className="button button-secondary" to={detailPath}>
            {actionLabel}
          </Link>
          {showBidActions && !item.isClosed ? (
            <>
              <button className="button button-secondary" type="button">Licitálok</button>
              {item.buyNowPrice ? (
                <button className="button button-lightning" type="button">⚡ Lecsapom</button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
