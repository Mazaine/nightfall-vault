import { apiRequest } from "./client";
import type { AuctionListParams } from "./auctions";

export type SavedSearch = AuctionListParams & {
  id: number;
  name: string;
  query?: string;
  created_at: string;
};

export type SavedSearchCreate = AuctionListParams & { name: string };

export function createSavedSearch(payload: SavedSearchCreate) {
  const { q, ...filters } = payload;
  return apiRequest<SavedSearch>("/api/searches", { method: "POST", body: JSON.stringify({ ...filters, query: q }) });
}

export function listSavedSearches() {
  return apiRequest<SavedSearch[]>("/api/searches");
}

export function deleteSavedSearch(searchId: number) {
  return apiRequest<void>(`/api/searches/${searchId}`, { method: "DELETE" });
}
