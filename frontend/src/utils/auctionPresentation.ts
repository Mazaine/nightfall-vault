import { apiAssetUrl } from "../api/client";
import type { Auction } from "../api/auctions";
import { formatAuctionStatus, formatMoney, formatRemainingTime } from "./format";
import { hkkCardImageUrl } from "./hkk";

export function toAuctionCardItem(auction: Auction) {
  const sellerName = auction.seller?.full_name ?? auction.seller?.username ?? "Eladó";
  const coverImage = auction.images.find((image) => image.is_cover) ?? auction.images[0];
  const bundleItems = auction.bundle_items ?? [];
  return {
    id: auction.id,
    listingType: auction.listing_type ?? "auction",
    sellerId: auction.seller_id,
    title: auction.title,
    type: auction.category,
    price: formatMoney(auction.listing_type === "fixed" ? auction.buy_now_price ?? auction.current_price : auction.current_price ?? auction.starting_price),
    step: formatMoney(auction.bid_increment),
    currentAmount: auction.current_price ?? auction.starting_price,
    bidIncrementAmount: auction.bid_increment,
    time: formatRemainingTime(auction.ends_at, auction.status),
    endsAt: auction.ends_at,
    status: auction.status,
    condition: auction.condition,
    fiveMinuteRuleEnabled: auction.five_minute_rule_enabled,
    sellerName,
    sellerRating: auction.seller_average_rating ?? null,
    sellerReviewCount: auction.seller_review_count ?? 0,
    sellerProfilePath: auction.seller?.username ? `/users/${auction.seller.username}` : undefined,
    buyNowPrice: auction.buy_now_enabled ? auction.buy_now_price : null,
    buyNowAmount: auction.buy_now_enabled ? auction.buy_now_price : null,
    isClosed: ["ended", "sold", "unsold", "cancelled", "suspended"].includes(auction.status),
    imageUrl: coverImage
      ? apiAssetUrl(coverImage.list_url ?? coverImage.thumbnail_url ?? coverImage.url)
      : auction.vault_external_card_id ? hkkCardImageUrl(auction.vault_external_card_id, null) : "",
    listingFormat: auction.listing_format ?? "single",
    bundleItemCount: bundleItems.length,
    bundleCopyCount: bundleItems.reduce((sum, item) => sum + item.quantity, 0),
    montageImages: !coverImage && bundleItems.length ? bundleItems.slice(0, 4).map((item) => hkkCardImageUrl(item.external_card_id, item.image_url)) : [],
    statusLabel: formatAuctionStatus(auction.status),
    bidCount: auction.bid_count ?? 0,
    canBid: auction.status === "active",
    isFeatured: auction.is_featured ?? false,
    isDemo: auction.is_demo ?? false,
    personalStatus: auction.viewer_personal_status ?? (auction.viewer_is_leading ? "leading" as const : undefined),
    topBidId: auction.viewer_top_bid_id,
    canWithdraw: auction.viewer_can_withdraw,
    withdrawalBlockReason: auction.viewer_withdrawal_block_reason,
    isWatched: auction.viewer_is_watched ?? auction.viewer_personal_status === "watched",
  };
}
