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
    sellerRating: number | string | null;
    sellerReviewCount?: number;
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
  const parsedSellerRating = typeof item.sellerRating === "number"
    ? item.sellerRating
    : Number.parseFloat(String(item.sellerRating ?? "").replace(",", "."));
  const sellerRating = Number.isFinite(parsedSellerRating) && parsedSellerRating >= 0 && parsedSellerRating <= 5
    ? parsedSellerRating
    : null;
  const filledStars = sellerRating === null ? 0 : Math.round(sellerRating);
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
          <span className="seller-rating-line">
            <span>Értékelés:</span>
            <span
              className="star-rating"
              aria-label={sellerRating === null ? "Még nincs értékelés" : `${sellerRating.toLocaleString("hu-HU")} csillag az 5-ből`}
              title={sellerRating === null ? "Még nincs értékelés" : `${sellerRating.toLocaleString("hu-HU")} / 5`}
            >
              {Array.from({ length: 5 }, (_, starIndex) => (
                <span aria-hidden="true" key={starIndex}>{starIndex < filledStars ? "★" : "☆"}</span>
              ))}
            </span>
          </span>
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
