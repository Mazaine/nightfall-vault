import { Link } from "react-router-dom";

type AuctionCardProps = {
  item: {
    id: string | number;
    title: string;
    type: string;
    price: string;
    step: string;
    time: string;
    sellerName: string;
    sellerRating: string;
    buyNowPrice?: string | null;
    isClosed?: boolean;
    userIsOutbid?: boolean;
    sellerProfilePath?: string;
    imageUrl?: string;
    statusLabel?: string;
    bidCount?: number;
  };
  index: number;
  detailPath: string;
  priceLabel?: string;
  showTimer?: boolean;
  showBidActions?: boolean;
};

export function AuctionCard({
  item,
  index,
  detailPath,
  priceLabel = "Jelenlegi licit",
  showTimer = true,
  showBidActions = true,
}: AuctionCardProps) {
  return (
    <article className={`auction-card auction-card-${index + 1}${item.isClosed ? " auction-card-closed" : ""}`}>
      <div className="auction-image">{item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" decoding="async" /> : null}</div>
      {showTimer && <div className="auction-time">{item.time}</div>}
      {item.userIsOutbid && <div className="auction-alert">Rád licitáltak</div>}

      <div className="auction-content">
        <h3>
          <Link className="auction-title-link" to={detailPath}>
            {item.title}
          </Link>
        </h3>
        <p>{item.type}</p>
        {item.statusLabel ? <span className="status-badge">Állapot: {item.statusLabel}</span> : null}
        <div className="seller-meta">
          <span>Eladó: {item.sellerName}</span>
          <span>Értékelés: {item.sellerRating}</span>
        </div>
        <span>{priceLabel}</span>
        <strong>{item.price}</strong>
        <small>Licitlépcső: {item.step}</small>
        {typeof item.bidCount === "number" ? <small>{item.bidCount} licit</small> : null}

        <div className="auction-actions">
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
