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
  seller?: AuctionUser | null;
  winner?: AuctionUser | null;
  images: AuctionImage[];
  can_chat?: boolean;
  can_review?: boolean;
  is_owner?: boolean;
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
  reviewer_id: number;
  reviewed_user_id: number;
  rating: number;
  comment: string | null;
  created_at: string;
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

export function listAuctions() {
  return apiRequest<Auction[]>("/api/auctions", { authenticated: false });
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
  return apiRequest<NotificationItem[]>("/api/auctions/notifications");
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

export function createAuctionReview(auctionId: number, rating: number, comment: string) {
  return apiRequest<AuctionReview>(`/api/auctions/${auctionId}/reviews`, {
    method: "POST",
    body: JSON.stringify({ rating, comment }),
  });
}
