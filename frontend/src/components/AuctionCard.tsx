import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { placeAuctionBid, withdrawAuctionBid } from "../api/auctions";
import { useAuth } from "../AuthContext";
import { formatMoney } from "../utils/format";
import { AuctionCountdown } from "./AuctionCountdown";
import { SafeImage } from "./SafeImage";

function moneyToCents(value: string | null | undefined) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function centsToAmount(cents: number) {
  return (cents / 100).toFixed(2);
}

type AuctionCardProps = {
  item: {
    id: string | number;
    title: string;
    type: string;
    price: string;
    step: string;
    currentAmount?: string;
    bidIncrementAmount?: string;
    time: string;
    endsAt?: string;
    status?: string;
    fiveMinuteRuleEnabled?: boolean;
    sellerName: string;
    sellerRating: number | string | null;
    sellerReviewCount?: number;
    buyNowPrice?: string | null;
    buyNowAmount?: string | null;
    isClosed?: boolean;
    userIsOutbid?: boolean;
    sellerProfilePath?: string;
    imageUrl?: string;
    statusLabel?: string;
    bidCount?: number;
    canBid?: boolean;
    isFeatured?: boolean;
    personalStatus?: "leading" | "outbid" | "watched" | "exited";
    topBidId?: number | null;
    canWithdraw?: boolean;
    withdrawalBlockReason?: string | null;
    participationNote?: string | null;
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
  const { isAuthenticated } = useAuth();
  const initialCurrentCents = moneyToCents(item.currentAmount);
  const incrementCents = moneyToCents(item.bidIncrementAmount);
  const [displayPrice, setDisplayPrice] = useState(item.price);
  const [nextBidAmount, setNextBidAmount] = useState(initialCurrentCents !== null && incrementCents !== null ? centsToAmount(initialCurrentCents + incrementCents) : "");
  const [isActionPending, setIsActionPending] = useState(false);
  const [isLocallyClosed, setIsLocallyClosed] = useState(Boolean(item.isClosed));
  const [actionMessage, setActionMessage] = useState("");
  const [personalStatus, setPersonalStatus] = useState(item.personalStatus);
  const parsedSellerRating = typeof item.sellerRating === "number"
    ? item.sellerRating
    : Number.parseFloat(String(item.sellerRating ?? "").replace(",", "."));
  const sellerRating = Number.isFinite(parsedSellerRating) && parsedSellerRating >= 0 && parsedSellerRating <= 5
    ? parsedSellerRating
    : null;
  const filledStars = sellerRating === null ? 0 : Math.round(sellerRating);

  useEffect(() => {
    const currentCents = moneyToCents(item.currentAmount);
    const stepCents = moneyToCents(item.bidIncrementAmount);
    setDisplayPrice(item.price);
    setNextBidAmount(currentCents !== null && stepCents !== null ? centsToAmount(currentCents + stepCents) : "");
    setIsLocallyClosed(Boolean(item.isClosed));
  }, [item.bidIncrementAmount, item.currentAmount, item.isClosed, item.price]);

  useEffect(() => setPersonalStatus(item.personalStatus), [item.personalStatus]);

  const exitAuction = async () => {
    if (!item.topBidId || isActionPending || !item.canWithdraw) return;
    const confirmed = window.confirm("Biztosan kiszállsz ebből az aukcióból?\n\nA legutolsó licited semmissé válik, kiesik az aukció számításából, és ez az aukció többé nem lesz licitálható számodra.");
    if (!confirmed) return;
    setIsActionPending(true);
    setActionMessage("");
    try {
      const result = await withdrawAuctionBid(item.topBidId, "leave_auction", null);
      setDisplayPrice(formatMoney(result.current_price));
      setPersonalStatus("exited");
      setActionMessage("Kiszálltál az aukcióból. Ezen az aukción többé nem licitálhatsz.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "A kiszállás nem sikerült.");
    } finally {
      setIsActionPending(false);
    }
  };

  const submitQuickAction = async (amount: string, isBuyNow = false) => {
    if (!isAuthenticated) {
      navigate(`/login?next=${encodeURIComponent(detailPath)}`);
      return;
    }
    if (!amount || isActionPending) return;
    setIsActionPending(true);
    setActionMessage("");
    try {
      const bid = await placeAuctionBid(Number(item.id), amount);
      setDisplayPrice(formatMoney(bid.amount));
      const amountCents = moneyToCents(bid.amount);
      if (amountCents !== null && incrementCents !== null) setNextBidAmount(centsToAmount(amountCents + incrementCents));
      const closed = Boolean(bid.reaches_buy_now);
      setIsLocallyClosed(closed);
      setActionMessage(closed || isBuyNow ? "Megnyerted az aukciót villámáron." : `A licit sikeresen rögzítve: ${formatMoney(bid.amount)}.`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "A művelet nem sikerült.");
    } finally {
      setIsActionPending(false);
    }
  };

  return (
    <article
      aria-label={`${item.title} aukció${personalStatus ? `, ${personalStatus === "leading" ? "te vezetsz" : personalStatus === "outbid" ? "rád licitáltak" : personalStatus === "watched" ? "figyelt aukció" : "kiszálltál"}` : ""}`}
      className={`auction-card auction-card-${index + 1}${isLocallyClosed ? " auction-card-closed" : ""}${item.isFeatured ? " auction-card-featured" : ""}${personalStatus ? ` auction-card-personal-${personalStatus}` : ""}`}
      role="link"
      tabIndex={0}
      onClick={(event) => { if (!(event.target as HTMLElement).closest("a,button,input,select,textarea")) navigate(detailPath); }}
      onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) { event.preventDefault(); navigate(detailPath); } }}
    >
      <div className="auction-image">
        <SafeImage src={item.imageUrl} alt={item.title} loading="lazy" decoding="async" width={700} height={700} />
      </div>
      {showTimer && item.endsAt && item.status
        ? <AuctionCountdown className="auction-time" endsAt={item.endsAt} status={item.status} fiveMinuteRuleEnabled={item.fiveMinuteRuleEnabled} fallback={item.time} />
        : showTimer ? <div className="auction-time">{item.time}</div> : null}
      {item.userIsOutbid && <div className="auction-alert">Rád licitáltak</div>}
      {personalStatus ? <div className={`auction-personal-badge is-${personalStatus}`}>{personalStatus === "leading" ? "Te vezetsz" : personalStatus === "outbid" ? "Rád licitáltak" : personalStatus === "watched" ? "Figyelőlistán" : "Kiszálltál"}</div> : null}

      <div className="auction-content">
        {item.isFeatured ? <span className="vip-featured-badge">VIP KIEMELT</span> : null}
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
                <span className={starIndex < filledStars ? "star is-filled" : "star is-empty"} aria-hidden="true" key={starIndex}>{starIndex < filledStars ? "★" : "☆"}</span>
              ))}
            </span>
          </span>
        </div>
        <span>{priceLabel}</span>
        <strong>{displayPrice}</strong>
        {item.buyNowPrice ? <small className="auction-buy-now-price">Villámár: {formatMoney(item.buyNowPrice)}</small> : null}
        <small>Licitlépcső: {item.step}</small>
        {typeof item.bidCount === "number" ? <small>{item.bidCount} licit</small> : null}

        <div className="auction-actions">
          {showBidActions ? personalStatus === "leading" ? <button className="button button-secondary" type="button" disabled={isActionPending || !item.canWithdraw} title={item.withdrawalBlockReason ?? undefined} onClick={() => void exitAuction()}>{isActionPending ? "Feldolgozás..." : "Kiszállok"}</button> : !isLocallyClosed && item.canBid !== false && personalStatus !== "exited" ? <>
            <button className="button button-secondary" type="button" disabled={isActionPending || !nextBidAmount} onClick={() => void submitQuickAction(nextBidAmount)}>{isActionPending ? "Feldolgozás..." : "Licitálok"}</button>
            {item.buyNowAmount ? <button className="button button-lightning" type="button" disabled={isActionPending} onClick={() => void submitQuickAction(item.buyNowAmount ?? "", true)}>⚡ Lecsapom</button> : null}
          </> : <Link className="button button-secondary" to={detailPath}>Aukció megnyitása</Link> : null}
        </div>
        {actionMessage ? <p className="form-message auction-action-message" role="status" aria-live="polite">{actionMessage}</p> : null}
        {!actionMessage && item.participationNote ? <p className="form-message auction-action-message">{item.participationNote}</p> : null}
      </div>
    </article>
  );
}
