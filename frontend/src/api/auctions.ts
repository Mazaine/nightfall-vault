import { API_BASE_URL, apiRequest } from "./client";

export type AuctionStatus = "draft" | "scheduled" | "active" | "ended" | "sold" | "unsold" | "cancelled" | "suspended";
export type AuctionCondition = "fresh" | "like_new" | "played" | "damaged" | "worn" | "misprint";

export type AuctionImage = {
  id: number;
  auction_id: number;
  storage_key: string;
  original_filename: string;
  content_type: string;
  file_size: number;
  position: number;
  is_cover: boolean;
  created_at: string;
};

export type AuctionUser = {
  id: number;
  username: string;
  full_name: string;
};

export type Auction = {
  id: number;
  seller_id: number;
  title: string;
  description?: string;
  category: string;
  condition: AuctionCondition;
  status: AuctionStatus;
  starting_price: string;
  bid_increment: string;
  current_price: string;
  buy_now_enabled: boolean;
  buy_now_price: string | null;
  starts_at: string;
  ends_at: string;
  five_minute_rule_enabled: boolean;
  winner_id: number | null;
  highest_bid_id: number | null;
  deleted_at?: string | null;
  moderated_at?: string | null;
  moderation_reason?: string | null;
  seller?: AuctionUser | null;
  winner?: AuctionUser | null;
  images: AuctionImage[];
  can_chat?: boolean;
  can_review?: boolean;
  is_owner?: boolean;
  bid_count?: number;
};

export type AuctionCreatePayload = {
  title: string;
  description: string;
  category: string;
  condition: AuctionCondition;
  starting_price: string;
  bid_increment: string;
  buy_now_enabled: boolean;
  buy_now_price: string | null;
  starts_at: string;
  ends_at: string;
  five_minute_rule_enabled: boolean;
  seller_declaration_accepted: boolean;
};

export type AuctionMessage = {
  id: number;
  sender_id: number;
  message: string;
  created_at: string;
};

export type AuctionReview = {
  id: number;
  auction_id: number;
  reviewer_id: number;
  reviewed_user_id: number;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer?: AuctionUser | null;
  reviewed_user?: AuctionUser | null;
};

export type AuctionBid = {
  id: number;
  auction_id?: number;
  amount: string;
  created_at: string;
  bidder_label: string;
  is_highest: boolean;
  reaches_buy_now?: boolean;
};

export type AuctionRealtimeSnapshot = {
  auction_id: number;
  status: AuctionStatus;
  current_price: string;
  highest_bid_id: number | null;
  bid_count: number;
  winner_id: number | null;
  ends_at: string;
  bids: AuctionBid[];
};

export type MyBidAuction = {
  auction: Auction;
  my_highest_bid: string;
  is_leading: boolean;
  has_won: boolean;
  is_outbid: boolean;
};

export type NotificationItem = {
  id: number;
  auction_id: number | null;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export type WatchlistItem = {
  id: number;
  auction: Auction;
  created_at: string;
};

export type AuctionListParams = {
  category?: string;
  condition?: string;
  status?: string;
  min_price?: string;
  max_price?: string;
  min_bids?: string;
  max_bids?: string;
  buy_now?: boolean | "";
  soon_ending?: boolean;
  new_only?: boolean;
  sort?: string;
  limit?: number;
  offset?: number;
};

export type AuctionPage = {
  items: Auction[];
  total: number;
  limit: number;
  offset: number;
};

export type AuctionReviewPage = {
  items: AuctionReview[];
  total: number;
  limit: number;
  offset: number;
};

function toQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function listAuctions(params: AuctionListParams = {}) {
  return apiRequest<AuctionPage>(`/api/auctions${toQuery(params)}`, { authenticated: false });
}

export function getAuction(auctionId: string | number) {
  return apiRequest<Auction>(`/api/auctions/${auctionId}`, { authenticated: false });
}

export function listMyAuctions() {
  return apiRequest<Auction[]>("/api/auctions/me");
}

export function listMyBidAuctions() {
  return apiRequest<MyBidAuction[]>("/api/auctions/my-bids");
}

export function listMyNotifications() {
  return apiRequest<NotificationItem[]>("/api/notifications");
}

export function getUnreadNotificationCount() {
  return apiRequest<{ unread_count: number }>("/api/notifications/unread-count");
}

export function markNotificationRead(notificationId: number) {
  return apiRequest<NotificationItem>(`/api/notifications/${notificationId}/read`, { method: "POST" });
}

export function markAllNotificationsRead() {
  return apiRequest<{ updated: number }>("/api/notifications/mark-all-read", { method: "POST" });
}

export function listWatchlist() {
  return apiRequest<WatchlistItem[]>("/api/watchlist");
}

export function addWatchlistItem(auctionId: number) {
  return apiRequest<WatchlistItem>(`/api/watchlist/${auctionId}`, { method: "POST" });
}

export function removeWatchlistItem(auctionId: number) {
  return apiRequest<void>(`/api/watchlist/${auctionId}`, { method: "DELETE" });
}

export function listAdminAuctions() {
  return apiRequest<Auction[]>("/api/admin/auctions");
}

export function suspendAdminAuction(auctionId: number, reason: string) {
  return apiRequest<{ id: number; status: AuctionStatus }>(`/api/admin/auctions/${auctionId}/suspend`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function restoreAdminAuction(auctionId: number, reason: string) {
  return apiRequest<{ id: number; status: AuctionStatus }>(`/api/admin/auctions/${auctionId}/restore`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function deleteAdminAuction(auctionId: number, reason: string) {
  return apiRequest<{ id: number; status: AuctionStatus }>(`/api/admin/auctions/${auctionId}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
}

export function createAuction(payload: AuctionCreatePayload) {
  return apiRequest<Auction>("/api/auctions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAuction(auctionId: number, payload: Partial<AuctionCreatePayload>) {
  return apiRequest<Auction>(`/api/auctions/${auctionId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function uploadAuctionImage(auctionId: number, file: File, isCover: boolean) {
  const formData = new FormData();
  formData.append("image", file);
  return apiRequest<AuctionImage>(`/api/auctions/${auctionId}/images?is_cover=${isCover ? "true" : "false"}`, {
    method: "POST",
    body: formData,
  });
}

export function activateAuction(auctionId: number) {
  return apiRequest<{ id: number; status: AuctionStatus }>(`/api/auctions/${auctionId}/activate`, {
    method: "POST",
  });
}

export function cancelAuction(auctionId: number) {
  return apiRequest<{ id: number; status: AuctionStatus }>(`/api/auctions/${auctionId}/cancel`, {
    method: "POST",
  });
}

export function listAuctionBids(auctionId: number) {
  return apiRequest<AuctionBid[]>(`/api/auctions/${auctionId}/bids`, { authenticated: false });
}

export function placeAuctionBid(auctionId: number, amount: string) {
  return apiRequest<AuctionBid>(`/api/auctions/${auctionId}/bids`, {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
}

export function auctionStreamUrl(auctionId: number | string) {
  return `${API_BASE_URL}/api/auctions/${auctionId}/stream`;
}

export function listAuctionMessages(auctionId: number) {
  return apiRequest<AuctionMessage[]>(`/api/auctions/${auctionId}/messages`);
}

export function createAuctionMessage(auctionId: number, message: string) {
  return apiRequest<AuctionMessage>(`/api/auctions/${auctionId}/messages`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export function listAuctionReviews(auctionId: number, params: { limit?: number; offset?: number; sort?: string } = {}) {
  return apiRequest<AuctionReviewPage>(`/api/auctions/${auctionId}/reviews${toQuery(params)}`, { authenticated: false });
}

export function createAuctionReview(auctionId: number, rating: number, comment: string) {
  return apiRequest<AuctionReview>(`/api/auctions/${auctionId}/reviews`, {
    method: "POST",
    body: JSON.stringify({ rating, comment }),
  });
}
