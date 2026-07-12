import { apiRequest } from "./client";

export type AuditLogEntry = {
  id: number;
  action: string;
  user_id: number | null;
  auction_id: number | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export async function listAuditLogs() {
  return apiRequest<AuditLogEntry[]>("/api/admin/audit-logs?limit=100");
}
