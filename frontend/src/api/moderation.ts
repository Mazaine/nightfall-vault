import { apiRequest } from "./client";

export type ModerationActionType = "warning" | "auction_creation_ban" | "bidding_ban" | "chat_ban" | "temporary_ban" | "permanent_ban";
export type ModerationUser = { id: number; username: string; full_name: string };
export type ModerationAction = { id: number; target_user_id: number; target_user: ModerationUser; action_type: ModerationActionType; reason: string; internal_note: string | null; starts_at: string; expires_at: string | null; revoked_at: string | null; created_at: string };
export type UserStrike = { id: number; user_id: number; user: ModerationUser; reason: string; severity: string; issued_at: string; expires_at: string | null; revoked_at: string | null };
export type ModerationOverview = { actions: ModerationAction[]; strikes: UserStrike[] };

export function getModerationOverview() { return apiRequest<ModerationOverview>("/api/admin/moderation"); }
export function createModerationAction(payload: { target_user_id: number; action_type: ModerationActionType; reason: string; internal_note?: string; expires_at?: string | null }) {
  return apiRequest<ModerationAction>("/api/admin/moderation/actions", { method: "POST", body: JSON.stringify(payload) });
}
export function createUserStrike(payload: { target_user_id: number; reason: string; severity: string; expires_at?: string | null }) {
  return apiRequest<UserStrike>("/api/admin/moderation/strikes", { method: "POST", body: JSON.stringify(payload) });
}
export function revokeModerationAction(id: number) { return apiRequest<ModerationAction>(`/api/admin/moderation/actions/${id}/revoke`, { method: "POST" }); }
export function revokeUserStrike(id: number) { return apiRequest<UserStrike>(`/api/admin/moderation/strikes/${id}/revoke`, { method: "POST" }); }
