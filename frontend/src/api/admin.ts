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
  role: "user" | "admin";
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

export async function listAuditLogs() {
  return apiRequest<AuditLogPage>("/api/admin/audit-logs?limit=100");
}
