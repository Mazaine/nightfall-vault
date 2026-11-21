import type { ReactNode } from "react";
import { Link } from "react-router";
import { CardImageZoom } from "./CardImageZoom";
import { SafeImage } from "./SafeImage";
import { HomeCountdown } from "../pages/home/HomeCountdown";

export type AuctionLivePanelProps = {
  title: string;
  detailPath: string;
  imageUrl?: string | null;
  zoomImageUrl?: string | null;
  sellerName: string;
  sellerRating?: number | string | null;
  condition: string;
  price: string;
  bidCount: number;
  status: string;
  endsAt: string;
  fiveMinuteRuleEnabled: boolean;
  mainAction: ReactNode;
  secondaryAction?: ReactNode;
  watchAction?: ReactNode;
  isFeatured?: boolean;
  isDemo?: boolean;
};

/** Shared horizontal auction presentation for the homepage and the marketplace. */
export function AuctionLivePanel({
  title, detailPath, imageUrl, zoomImageUrl, sellerName, sellerRating, condition,
  price, bidCount, status, endsAt, fiveMinuteRuleEnabled, mainAction, secondaryAction,
  watchAction, isFeatured, isDemo,
}: AuctionLivePanelProps) {
  const rawRating = Number.parseFloat(String(sellerRating ?? "").replace(",", "."));
  const rating = Number.isFinite(rawRating) && rawRating >= 0 && rawRating <= 5
    ? rawRating.toLocaleString("hu-HU", { maximumFractionDigits: 1 })
    : null;
  const active = status === "active";
  const ended = !active && status !== "scheduled";
  return <article className="nv-bid-card" aria-label={`${title} aukció`}>
    <div className="nv-bid-image">
      <Link className="nv-bid-cover" to={detailPath} aria-label={`Aukció képe: ${title}`}>
        {imageUrl ? <SafeImage src={imageUrl} alt={title} loading="lazy" decoding="async" width={350} height={490} /> : <span className="nv-no-image">Kép nélkül</span>}
      </Link>
      {(zoomImageUrl || imageUrl) && <CardImageZoom src={zoomImageUrl || imageUrl || ""} alt={title} />}
    </div>
    <div className="nv-bid-body">
      <div className="nv-bid-header">
        <Link className="nv-bid-title" to={detailPath}>{title}</Link>
        {watchAction}
      </div>
      {(isFeatured || isDemo) && <div className="nv-bid-tags">
        {isFeatured && <span className="vip-featured-badge">VIP KIEMELT</span>}
        {isDemo && <span className="demo-auction-badge">TESZT AUKCIÓ</span>}
      </div>}
      <div className="nv-bid-seller">Eladó: {sellerName} · {rating === null ? "Még nincs értékelés" : `${rating} ★`} · {condition}</div>
      <div className="nv-bid-current">
        <div><small>{ended ? "UTOLSÓ LICIT" : active ? "JELENLEGI LICIT" : "KIKIÁLTÁSI ÁR"}</small><strong>{price}</strong></div>
        <span className="nv-bid-count">{bidCount} licit</span>
      </div>
      <div className="nv-bid-timer-row">
        <div>
          <small>{ended ? "ÁLLAPOT" : active ? "ZÁRÁSIG" : "INDULÁSRA VÁR"}</small>
          {active && fiveMinuteRuleEnabled && <span className="nv-bid-shield" title="Új licitnél érvényes az ötperces licitvédelem">5 perces védelem</span>}
        </div>
        {ended ? <span className="nv-clock-pending">Lezárult</span> : <HomeCountdown endsAt={endsAt} status={status} />}
      </div>
      <div className="nv-bid-progress" aria-hidden="true"><span /></div>
      <div className="nv-bid-actions">{mainAction}{secondaryAction}</div>
    </div>
  </article>;
}
