import { apiRequest } from "./client";

export type BlockRead = {
  username: string;
  full_name: string;
  blocked_at: string;
  id?: number;
  blocked_username?: string;
  blocked_full_name?: string;
  created_at?: string;
};

export type BlockStatusRead = {
  username: string;
  is_blocked: boolean;
  is_blocked_by_user: boolean;
};

export function blockUser(username: string) {
  return apiRequest<BlockRead>(`/api/blocks/${encodeURIComponent(username)}`, { method: "POST" });
}

export function unblockUser(username: string) {
  return apiRequest<void>(`/api/blocks/${encodeURIComponent(username)}`, { method: "DELETE" });
}

export function listBlocks() {
  return apiRequest<BlockRead[]>("/api/blocks");
}

export function getBlockStatus(username: string) {
  return apiRequest<BlockStatusRead>(`/api/blocks/${encodeURIComponent(username)}/status`);
}
