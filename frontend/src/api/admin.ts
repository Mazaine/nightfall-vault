import { apiRequest } from "./client";

export type AdminStats = {
  total_auctions: number;
  active_auctions: number;
  today_auctions: number;
  sold_auctions: number;
  open_reports: number;
  total_users: number;
  new_users: number;
};

export type AdminUser = {
  id: number;
  email: string;
  username: string;
  full_name: string;
  role: "user" | "tester" | "admin";
  is_active: boolean;
  is_email_verified: boolean;
  created_at: string;
  updated_at: string;
  total_bids: number;
  active_bids: number;
  withdrawn_bids: number;
  bid_withdrawal_count: number;
  bid_withdrawal_warning_level: number;
  bid_withdrawal_first_warning_sent_at: string | null;
  last_bid_withdrawal_at: string | null;
  bid_withdrawal_disabled_until: string | null;
  bid_withdrawal_permanently_disabled: boolean;
};

export type AuditLogEntry = {
  id: number;
  action: string;
  user_id: number | null;
  auction_id: number | null;
  created_at: string;
  path: string | null;
  method: string | null;
  status_code: number | null;
  metadata_json: Record<string, unknown> | null;
};

export type AuditLogPage = {
  items: AuditLogEntry[];
  limit: number;
  offset: number;
};

export function getAdminStats() {
  return apiRequest<AdminStats>("/api/admin/stats");
}

export function updateBidWithdrawalRestriction(userId: number, payload: { disabled_until: string | null; permanently_disabled: boolean; reason: string }) {
  return apiRequest<AdminUser>(`/api/admin/moderation/users/${userId}/bid-withdrawal-restriction`, {
    method: "PUT", body: JSON.stringify(payload),
  });
}

export function listAdminUsers() {
  return apiRequest<AdminUser[]>("/api/admin/users");
}

export function searchAdminUsers(query: string) {
  return apiRequest<AdminUser[]>(`/api/admin/users/search?query=${encodeURIComponent(query)}`);
}

export function updateAdminUser(userId: number, payload: Partial<Pick<AdminUser, "role" | "is_active" | "is_email_verified">>) {
  return apiRequest<AdminUser>(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function updateTesterRole(userId: number, role: "user" | "tester", confirmation: string) {
  return apiRequest<AdminUser>(`/api/admin/users/${userId}/role`, {
    method: "PATCH", body: JSON.stringify({ role, confirmation }),
  });
}

export async function listAuditLogs() {
  return apiRequest<AuditLogPage>("/api/admin/audit-logs?limit=100");
}

export type DemoAuctionStatus = {
  batch_key: string | null; status: string; regular_count: number; featured_count: number;
  total_auctions: number; image_count: number; media_variant_count: number; bid_count: number;
  demo_user_count: number; created_at: string | null; completed_at: string | null; deleted_at: string | null;
  created_by_admin: string | null; error_message: string | null;
};
export type DemoAuctionPreview = { regular_count: number; featured_count: number; total_auctions: number; image_count: number; media_variant_count: number; expected_bid_count: number; categories: string[]; earliest_end_at: string; latest_end_at: string; buy_now_count: number; five_minute_rule_count: number; demo_user_count: number; };
export type DemoCleanupPreview = { batch_key: string; auctions: number; images: number; media_files: number; bids: number; watchlist_items: number; notifications: number; transactions: number; messages: number; reviews: number; bid_exclusions: number; reports: number; demo_users: number; };
export type DemoOperationResult = { action: string; batch_key: string | null; status: string; regular_count: number; featured_count: number; total_auctions: number; image_count: number; bid_count: number; deleted_records: number; };

export const getDemoAuctionStatus = () => apiRequest<DemoAuctionStatus>("/api/admin/demo-auctions/status");
export const previewDemoAuctions = (regular_count: number, featured_count: number) => apiRequest<DemoAuctionPreview>("/api/admin/demo-auctions/preview", { method: "POST", body: JSON.stringify({ regular_count, featured_count }) });
export const createDemoAuctions = (regular_count: number, featured_count: number, confirmation: string) => apiRequest<DemoOperationResult>("/api/admin/demo-auctions/create", { method: "POST", body: JSON.stringify({ regular_count, featured_count, confirmation }) });
export const resetDemoAuctions = (regular_count: number, featured_count: number, confirmation: string) => apiRequest<DemoOperationResult>("/api/admin/demo-auctions/reset", { method: "POST", body: JSON.stringify({ regular_count, featured_count, confirmation }) });
export const previewDemoCleanup = (batch_key?: string | null) => apiRequest<DemoCleanupPreview>("/api/admin/demo-auctions/cleanup-preview", { method: "POST", body: JSON.stringify({ batch_key: batch_key ?? null }) });
export const cleanupDemoAuctions = (batch_key: string | null, confirmation: string) => apiRequest<DemoOperationResult>("/api/admin/demo-auctions", { method: "DELETE", body: JSON.stringify({ batch_key, confirmation }) });
