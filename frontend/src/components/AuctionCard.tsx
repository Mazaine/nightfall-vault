import { KeyboardEvent, MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

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
    canBid?: boolean;
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
  const navigate = useNavigate();
  const openDetail = () => navigate(detailPath);
  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (!(event.target as HTMLElement).closest("a, button")) openDetail();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail();
    }
  };

  return (
    <article
      aria-label={`${item.title} aukció megnyitása`}
      className={`auction-card auction-card-${index + 1}${item.isClosed ? " auction-card-closed" : ""}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="link"
      tabIndex={0}
    >
      <Link className="auction-image" to={detailPath} aria-label={`${item.title} részletei`}>
        {item.imageUrl ? <img src={item.imageUrl} alt={item.title} loading="lazy" decoding="async" /> : null}
      </Link>
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
          {showBidActions && !item.isClosed && item.canBid !== false ? (
            <>
              <Link className="button button-secondary" to={`${detailPath}#bid-section`}>Licitálok</Link>
              {item.buyNowPrice ? (
                <Link className="button button-lightning" to={`${detailPath}#buy-now-section`}>⚡ Lecsapom</Link>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
