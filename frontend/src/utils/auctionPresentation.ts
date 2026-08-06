import { apiAssetUrl } from "../api/client";
import type { Auction } from "../api/auctions";
import { formatAuctionStatus, formatMoney, formatRemainingTime } from "./format";

export function toAuctionCardItem(auction: Auction) {
  const sellerName = auction.seller?.full_name ?? auction.seller?.username ?? "Eladó";
  const coverImage = auction.images.find((image) => image.is_cover) ?? auction.images[0];
  return {
    id: auction.id,
    sellerId: auction.seller_id,
    title: auction.title,
    type: auction.category,
    price: formatMoney(auction.current_price ?? auction.starting_price),
    step: formatMoney(auction.bid_increment),
    currentAmount: auction.current_price ?? auction.starting_price,
    bidIncrementAmount: auction.bid_increment,
    time: formatRemainingTime(auction.ends_at, auction.status),
    endsAt: auction.ends_at,
    status: auction.status,
    fiveMinuteRuleEnabled: auction.five_minute_rule_enabled,
    sellerName,
    sellerRating: auction.seller_average_rating ?? null,
    sellerReviewCount: auction.seller_review_count ?? 0,
    sellerProfilePath: auction.seller?.username ? `/users/${auction.seller.username}` : undefined,
    buyNowPrice: auction.buy_now_enabled ? auction.buy_now_price : null,
    buyNowAmount: auction.buy_now_enabled ? auction.buy_now_price : null,
    isClosed: ["ended", "sold", "unsold", "cancelled", "suspended"].includes(auction.status),
    imageUrl: apiAssetUrl(coverImage?.list_url ?? coverImage?.thumbnail_url ?? coverImage?.url),
    statusLabel: formatAuctionStatus(auction.status),
    bidCount: auction.bid_count ?? 0,
    canBid: auction.status === "active",
    isFeatured: auction.is_featured ?? false,
    personalStatus: auction.viewer_personal_status ?? (auction.viewer_is_leading ? "leading" as const : undefined),
    topBidId: auction.viewer_top_bid_id,
    canWithdraw: auction.viewer_can_withdraw,
    withdrawalBlockReason: auction.viewer_withdrawal_block_reason,
    isWatched: auction.viewer_is_watched ?? auction.viewer_personal_status === "watched",
  };
}
