import { apiRequest } from "./client";
import type { Auction } from "./auctions";

export type PublicAuctionSummary = Pick<Auction, "id" | "title" | "category" | "condition" | "status" | "current_price" | "buy_now_enabled" | "buy_now_price" | "ends_at"> & {
  bid_count: number;
};

export type PublicReview = {
  id: number;
  auction_id: number;
  auction_title: string;
  reviewer_username: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

export type PublicReviewPage = {
  items: PublicReview[];
  total: number;
  limit: number;
  offset: number;
};

export type PublicUserProfile = {
  username: string;
  full_name: string;
  created_at: string;
  stats: {
    positive_reviews: number;
    negative_reviews: number;
    average_rating: number | null;
    active_auctions: number;
    closed_auctions: number;
    successful_sales: number;
    sold_auctions: number;
    won_auctions: number;
    total_bids: number;
    successful_bids: number;
    lost_bids: number;
    success_rate: number;
    follower_count: number;
    following_count: number;
  };
  active_auctions: PublicAuctionSummary[];
  closed_auctions: PublicAuctionSummary[];
  recent_reviews: PublicReview[];
  is_followed: boolean;
  is_blocked: boolean;
  is_blocked_by_user: boolean;
};

export type FollowedSeller = {
  username: string;
  full_name: string;
  followed_at: string;
  active_auctions: number;
  average_rating: number | null;
};

function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const value = search.toString();
  return value ? `?${value}` : "";
}

export function getPublicUserProfile(username: string) {
  return apiRequest<PublicUserProfile>(`/api/users/${encodeURIComponent(username)}`, { authenticated: false });
}

export function listPublicUserReviews(username: string, params: { limit?: number; offset?: number; sort?: string } = {}) {
  return apiRequest<PublicReviewPage>(`/api/users/${encodeURIComponent(username)}/reviews${query(params)}`, { authenticated: false });
}

export function followSeller(username: string) {
  return apiRequest<FollowedSeller>("/api/follow", {
    method: "POST",
    body: JSON.stringify({ username }),
  });
}

export function unfollowSeller(username: string) {
  return apiRequest<void>("/api/follow", {
    method: "DELETE",
    body: JSON.stringify({ username }),
  });
}

export function listFollowing() {
  return apiRequest<FollowedSeller[]>("/api/following");
}
