import { apiAssetUrl } from "../api/client";
import type { Auction } from "../api/auctions";
import { formatMoney, formatRemainingTime } from "./format";

export function toAuctionCardItem(auction: Auction) {
  const sellerName = auction.seller?.full_name ?? auction.seller?.username ?? "Eladó";
  const coverImage = auction.images.find((image) => image.is_cover) ?? auction.images[0];
  return {
    id: auction.id,
    title: auction.title,
    type: auction.category,
    price: formatMoney(auction.current_price ?? auction.starting_price),
    step: formatMoney(auction.bid_increment),
    time: formatRemainingTime(auction.ends_at, auction.status),
    sellerName,
    sellerRating: auction.seller_average_rating ?? null,
    sellerReviewCount: auction.seller_review_count ?? 0,
    sellerProfilePath: auction.seller?.username ? `/users/${auction.seller.username}` : undefined,
    buyNowPrice: auction.buy_now_enabled ? auction.buy_now_price : null,
    isClosed: ["ended", "sold", "unsold", "cancelled", "suspended"].includes(auction.status),
    imageUrl: apiAssetUrl(coverImage?.list_storage_key ?? coverImage?.storage_key),
    statusLabel: auction.status === "scheduled" ? "Hamarosan indul" : auction.status === "active" ? "Aktív" : auction.status,
    bidCount: auction.bid_count ?? 0,
    canBid: auction.status === "active",
  };
}
