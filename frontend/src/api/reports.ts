import { apiRequest } from "./client";

export type ReportTargetType = "auction" | "user";
export type ReportStatus = "open" | "under_review" | "resolved" | "dismissed";
export type ReportPriority = "low" | "normal" | "high" | "urgent";

export type ReportRead = {
  id: number;
  target_type: ReportTargetType;
  auction_id: number | null;
  auction_title?: string | null;
  reported_username?: string | null;
  auction?: { id: number; title: string; status: string } | null;
  reported_user?: { username: string; full_name: string } | null;
  reason: string;
  details: string | null;
  status: ReportStatus;
  public_resolution: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type ReportPage = {
  items: ReportRead[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminReportRead = ReportRead & {
  reporter_username: string;
  reporter?: { username: string; full_name: string } | null;
  priority: ReportPriority;
  assigned_admin_username: string | null;
  admin_note: string | null;
};

export type AdminReportPage = {
  items: AdminReportRead[];
  total: number;
  limit: number;
  offset: number;
};

export const auctionReportReasons = [
  { value: "counterfeit", label: "Hamis vagy hamisítványgyanús tétel" },
  { value: "prohibited_item", label: "Tiltott tétel" },
  { value: "misleading_description", label: "Félrevezető leírás" },
  { value: "copyright_content", label: "Jogsértőnek tűnő tartalom" },
  { value: "spam", label: "Kéretlen tartalom" },
  { value: "offensive_content", label: "Sértő tartalom" },
  { value: "suspicious_seller", label: "Gyanús eladó" },
  { value: "other", label: "Egyéb" },
];

export const userReportReasons = [
  { value: "harassment", label: "Zaklatás" },
  { value: "suspected_fraud", label: "Csalásgyanús viselkedés" },
  { value: "spam", label: "Kéretlen tartalom" },
  { value: "offensive_behavior", label: "Sértő viselkedés" },
  { value: "auction_policy_violation", label: "Aukciós szabálysértés" },
  { value: "impersonation", label: "Megszemélyesítés" },
  { value: "other", label: "Egyéb" },
];

function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const value = search.toString();
  return value ? `?${value}` : "";
}

export function createAuctionReport(auctionId: number, reason: string, details: string) {
  return apiRequest<ReportRead>(`/api/reports/auctions/${auctionId}`, {
    method: "POST",
    body: JSON.stringify({ reason, details }),
  });
}

export function createUserReport(username: string, reason: string, details: string) {
  return apiRequest<ReportRead>(`/api/reports/users/${encodeURIComponent(username)}`, {
    method: "POST",
    body: JSON.stringify({ reason, details }),
  });
}

export function listMyReports(params: { limit?: number; offset?: number; status?: string } = {}) {
  return apiRequest<ReportPage>(`/api/reports/me${query(params)}`);
}

export function getMyReport(reportId: number) {
  return apiRequest<ReportRead>(`/api/reports/me/${reportId}`);
}

export function listAdminReports(params: Record<string, string | number | undefined> = {}) {
  return apiRequest<AdminReportPage>(`/api/admin/reports${query(params)}`);
}

export function getAdminReport(reportId: number) {
  return apiRequest<AdminReportRead>(`/api/admin/reports/${reportId}`);
}

export function updateAdminReportStatus(reportId: number, status: ReportStatus, public_resolution?: string) {
  return apiRequest<AdminReportRead>(`/api/admin/reports/${reportId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status, public_resolution }),
  });
}

export function updateAdminReportPriority(reportId: number, priority: ReportPriority) {
  return apiRequest<AdminReportRead>(`/api/admin/reports/${reportId}/priority`, {
    method: "PUT",
    body: JSON.stringify({ priority }),
  });
}

export function updateAdminReportNote(reportId: number, admin_note: string) {
  return apiRequest<AdminReportRead>(`/api/admin/reports/${reportId}/note`, {
    method: "PUT",
    body: JSON.stringify({ admin_note }),
  });
}
