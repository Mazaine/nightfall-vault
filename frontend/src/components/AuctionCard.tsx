import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { addWatchlistItem, placeAuctionBid, removeWatchlistItem, withdrawAuctionBid } from "../api/auctions";
import { useAuth } from "../AuthContext";
import { useNotifications } from "../NotificationContext";
import { formatMoney } from "../utils/format";
import { disableBidConfirmation, isBidConfirmationDisabled } from "../utils/bidConfirmation";
import { AuctionCountdown } from "./AuctionCountdown";
import { BidConfirmationDialog } from "./BidDialogs";
import { SafeImage } from "./SafeImage";

function moneyToCents(value: string | null | undefined) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function centsToAmount(cents: number) {
  return (cents / 100).toFixed(2);
}

function formatCardMoney(value: string | number) {
  return typeof value === "string" && /\bFt\s*$/.test(value.trim()) ? value : formatMoney(value);
}

type AuctionCardProps = {
  item: {
    id: string | number;
    sellerId?: number;
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
    isDemo?: boolean;
    personalStatus?: "leading" | "outbid" | "watched" | "exited";
    topBidId?: number | null;
    canWithdraw?: boolean;
    withdrawalBlockReason?: string | null;
    participationNote?: string | null;
    isWatched?: boolean;
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
  const { isAuthenticated, user } = useAuth();
  const { showToast } = useNotifications();
  const initialCurrentCents = moneyToCents(item.currentAmount);
  const incrementCents = moneyToCents(item.bidIncrementAmount);
  const [displayPrice, setDisplayPrice] = useState(item.price);
  const [nextBidAmount, setNextBidAmount] = useState(initialCurrentCents !== null && incrementCents !== null ? centsToAmount(initialCurrentCents + incrementCents) : "");
  const [isActionPending, setIsActionPending] = useState(false);
  const [isLocallyClosed, setIsLocallyClosed] = useState(Boolean(item.isClosed));
  const [actionMessage, setActionMessage] = useState("");
  const [personalStatus, setPersonalStatus] = useState(item.personalStatus);
  const [topBidId, setTopBidId] = useState(item.topBidId);
  const [canWithdraw, setCanWithdraw] = useState(Boolean(item.canWithdraw));
  const [pendingBid, setPendingBid] = useState<{ amount: string; isBuyNow: boolean } | null>(null);
  const [isWatched, setIsWatched] = useState(Boolean(item.isWatched));
  const [isWatchPending, setIsWatchPending] = useState(false);
  const parsedSellerRating = typeof item.sellerRating === "number"
    ? item.sellerRating
    : Number.parseFloat(String(item.sellerRating ?? "").replace(",", "."));
  const sellerRating = Number.isFinite(parsedSellerRating) && parsedSellerRating >= 0 && parsedSellerRating <= 5
    ? parsedSellerRating
    : null;
  const filledStars = sellerRating === null ? 0 : Math.round(sellerRating);
  const canUseQuickBid = !isLocallyClosed && item.canBid !== false && personalStatus !== "leading" && personalStatus !== "exited";
  const showOpenAction = showBidActions && personalStatus !== "leading" && !canUseQuickBid;

  useEffect(() => {
    const currentCents = moneyToCents(item.currentAmount);
    const stepCents = moneyToCents(item.bidIncrementAmount);
    setDisplayPrice(item.price);
    setNextBidAmount(currentCents !== null && stepCents !== null ? centsToAmount(currentCents + stepCents) : "");
    setIsLocallyClosed(Boolean(item.isClosed));
  }, [item.bidIncrementAmount, item.currentAmount, item.isClosed, item.price]);

  useEffect(() => {
    setPersonalStatus(item.personalStatus);
    setTopBidId(item.topBidId);
    setCanWithdraw(Boolean(item.canWithdraw));
  }, [item.canWithdraw, item.personalStatus, item.topBidId]);

  useEffect(() => setIsWatched(Boolean(item.isWatched)), [item.isWatched]);

  const toggleWatchlist = async () => {
    if (!isAuthenticated) {
      navigate(`/login?next=${encodeURIComponent(detailPath)}`);
      return;
    }
    if (isWatchPending) return;
    const previous = isWatched;
    setIsWatchPending(true);
    setIsWatched(!previous);
    setActionMessage("");
    try {
      if (previous) await removeWatchlistItem(Number(item.id));
      else await addWatchlistItem(Number(item.id));
      if (personalStatus === "watched" && previous) setPersonalStatus(undefined);
      else if (!personalStatus && !previous) setPersonalStatus("watched");
      showToast({ title: previous ? "Figyelés kikapcsolva" : "Figyelőlistára mentve", message: previous ? "Az aukció lekerült a figyelőlistádról." : "Az aukció felkerült a figyelőlistádra.", targetUrl: detailPath });
    } catch (error) {
      setIsWatched(previous);
      setActionMessage(error instanceof Error ? error.message : "A figyelőlista módosítása nem sikerült.");
    } finally {
      setIsWatchPending(false);
    }
  };

  const exitAuction = async () => {
    if (!topBidId || isActionPending || !canWithdraw) return;
    const confirmed = window.confirm("Biztosan kiszállsz ebből az aukcióból?\n\nA legutolsó licited semmissé válik, kiesik az aukció számításából, és ez az aukció többé nem lesz licitálható számodra.");
    if (!confirmed) return;
    setIsActionPending(true);
    setActionMessage("");
    try {
      const result = await withdrawAuctionBid(topBidId, "leave_auction", null);
      setDisplayPrice(formatMoney(result.current_price));
      setPersonalStatus("exited");
      setCanWithdraw(false);
      showToast({ title: "Kiszálltál az aukcióból", message: "Ezen az aukción többé nem licitálhatsz.", targetUrl: detailPath });
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
      setTopBidId(bid.id);
      setCanWithdraw(!closed);
      setPersonalStatus(closed ? undefined : "leading");
      showToast({
        title: closed || isBuyNow ? "Sikeres villámvásárlás" : "Sikeres licit",
        message: closed || isBuyNow ? "Megnyerted az aukciót villámáron." : `Az új aktuális licit ${formatMoney(bid.amount)}.`,
        targetUrl: detailPath,
      });
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "A művelet nem sikerült.");
    } finally {
      setIsActionPending(false);
    }
  };

  const requestQuickAction = async (amount: string, isBuyNow = false) => {
    if (!isAuthenticated) {
      navigate(`/login?next=${encodeURIComponent(detailPath)}`);
      return;
    }
    if (!isBuyNow && isBidConfirmationDisabled()) {
      await submitQuickAction(amount);
      return;
    }
    setPendingBid({ amount, isBuyNow });
  };

  const confirmPendingBid = async (disableFuture: boolean) => {
    if (!pendingBid || isActionPending) return;
    const selected = pendingBid;
    if (!selected.isBuyNow && disableFuture) disableBidConfirmation();
    await submitQuickAction(selected.amount, selected.isBuyNow);
    setPendingBid(null);
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
      {personalStatus ? <div className={`auction-personal-badge is-${personalStatus}`}>{personalStatus === "leading" ? "Te vezetsz" : personalStatus === "outbid" ? "Túllicitáltak" : personalStatus === "watched" ? "Figyelőlistán" : "Kiszálltál"}</div> : null}

      <div className="auction-content">
        <div className="auction-card-badges" aria-hidden={!item.isFeatured && !item.isDemo}>
          {item.isFeatured ? <span className="vip-featured-badge">VIP KIEMELT</span> : null}
          {item.isDemo ? <span className="demo-auction-badge">TESZT AUKCIÓ</span> : null}
        </div>
        <h3>
          <Link className="auction-title-link" to={detailPath}>
            {item.title}
          </Link>
        </h3>
        <p>{item.type}</p>
        <div className="auction-card-status-row">
          {item.statusLabel ? <span className="status-badge">Állapot: {item.statusLabel}</span> : null}
          {!isLocallyClosed && user?.id !== item.sellerId ? (
            <button className={`auction-watchlist-toggle${isWatched ? " is-active" : ""}`} type="button" aria-pressed={isWatched} disabled={isWatchPending} onClick={() => void toggleWatchlist()}>
              <span aria-hidden="true">{isWatched ? "★" : "☆"}</span>
              {isWatchPending ? "Mentés…" : isWatched ? "Figyelem" : "Figyelőlistára"}
            </button>
          ) : null}
        </div>
        <div className="seller-meta">
          <span className="seller-identity">Eladó: {item.sellerProfilePath ? <Link className="seller-profile-link" to={item.sellerProfilePath}>{item.sellerName}</Link> : item.sellerName}</span>
          <span className="seller-rating-line">
            {sellerRating === null ? <span>Még nincs értékelés</span> : <>
            <span
              className="star-rating"
              aria-label={`${sellerRating.toLocaleString("hu-HU")} csillag az 5-ből, ${item.sellerReviewCount ?? 0} értékelés`}
              title={`${sellerRating.toLocaleString("hu-HU")} / 5`}
            >
              {Array.from({ length: 5 }, (_, starIndex) => (
                <span className={starIndex < filledStars ? "star is-filled" : "star is-empty"} aria-hidden="true" key={starIndex}>{starIndex < filledStars ? "★" : "☆"}</span>
              ))}
            </span>
            <strong className="seller-rating-value">{sellerRating.toLocaleString("hu-HU", { maximumFractionDigits: 1 })}</strong>
            </>}
          </span>
        </div>
        <div className="auction-commerce-block">
          <div className="auction-price-action-row">
            <div className="auction-price-copy">
              <span>{priceLabel}</span>
              <strong>{displayPrice}</strong>
            </div>
            {showBidActions && personalStatus === "leading" ? (
              <button className="button button-secondary" type="button" disabled={isActionPending || !canWithdraw} title={item.withdrawalBlockReason ?? undefined} onClick={() => void exitAuction()}>{isActionPending ? "Feldolgozás..." : "Kiszállok"}</button>
            ) : showBidActions && canUseQuickBid ? (
              <button className="button button-secondary" type="button" disabled={isActionPending || !nextBidAmount} onClick={() => void requestQuickAction(nextBidAmount)}>{isActionPending ? "Feldolgozás..." : "Licitálok"}</button>
            ) : null}
          </div>

          <div className="auction-price-action-row auction-buy-now-row">
            <div className="auction-price-copy">
              <span>Villámár</span>
              <strong className={item.buyNowPrice ? "auction-buy-now-price" : "auction-buy-now-empty"}>{item.buyNowPrice ? formatCardMoney(item.buyNowPrice) : "Nincs"}</strong>
            </div>
            {item.buyNowPrice && showBidActions && canUseQuickBid && item.buyNowAmount ? <button className="button button-lightning" type="button" disabled={isActionPending} onClick={() => void requestQuickAction(item.buyNowAmount ?? "", true)}>⚡ Lecsapom</button> : null}
          </div>

          <div className="auction-bid-meta">
            <small>Licitlépcső: {item.step}</small>
            {typeof item.bidCount === "number" ? <small>{item.bidCount} licit</small> : null}
          </div>
        </div>
        <div className="auction-actions-slot">{showOpenAction ? <div className="auction-actions"><Link className="button button-secondary" to={detailPath}>Aukció megnyitása</Link></div> : null}</div>
        {actionMessage ? <p className="form-message auction-action-message" role="status" aria-live="polite">{actionMessage}</p> : null}
      </div>
      {pendingBid ? <BidConfirmationDialog amountLabel={formatMoney(pendingBid.amount)} isBuyNow={pendingBid.isBuyNow} busy={isActionPending} onClose={() => { if (!isActionPending) setPendingBid(null); }} onConfirm={(disableFuture) => void confirmPendingBid(disableFuture)} /> : null}
    </article>
  );
}
