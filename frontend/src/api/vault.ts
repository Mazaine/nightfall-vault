import { apiRequest } from "./client";

export type VaultFolder = { id: number; name: string; capacity: number; position: number; color: string | null; used_slots: number };
export type PrintVariant = "normal" | "foil" | "fa" | "gfa";
export type VaultCard = {
  id: number; external_card_id: string; card_name: string; image_url: string | null; edition: string | null;
  card_type: string | null; subtype: string | null; color: string | null; rarity: string | null; quantity: number;
  folder_id: number | null; wanted: boolean; wanted_quantity: number; offer_count: number; print_variant: PrintVariant;
};
export type PublicTradeCard = VaultCard & { owner_id: number; owner_username: string };
export type VaultSummary = {
  total_collection_capacity: number; assigned_collection_capacity: number; free_collection_capacity: number;
  used_collection_slots: number; trade_capacity: number; used_trade_slots: number; vp_balance: number; vault_unlimited?: boolean; folders: VaultFolder[];
};
export type HkkCard = Pick<VaultCard, "external_card_id" | "card_name" | "image_url" | "edition" | "card_type" | "subtype" | "color" | "rarity"> & { source_token: string };
export type HkkRarity = "common" | "uncommun" | "rare" | "ultrarare";
export type HkkEdition = { id: string; name: string };
export type HkkEditionPreview = { edition: HkkEdition; count: number; cards: HkkCard[] };
export type HkkEditionImportResult = { edition: HkkEdition; total_cards: number; added_cards: number; updated_cards: number; skipped_cards: number };
export type PointTransaction = { id: number; amount: number; reason: string; reference_type: string | null; reference_id: string | null; created_at: string };
export type PointHistory = { balance: number; items: PointTransaction[] };
export type VaultTrade = {
  id: number; requester_id: number; requester_username: string; requester_display_name: string; owner_id: number; owner_username: string; owner_display_name: string; status: string; reviewed_by_current_user: boolean;
  requester_confirmed_at: string | null; owner_confirmed_at: string | null; completed_at: string | null; card: VaultCard;
  messages: { id: number; sender_id: number; sender_username: string; sender_display_name: string; message: string; created_at: string }[];
};
export type VaultCardLoan = {
  id: number; collection_card_id: number | null; external_card_id: string; card_name: string; print_variant: PrintVariant;
  quantity: number; borrower_name: string; borrower_user_id: number | null; lent_at: string; due_at: string | null;
  note: string | null; status: "active" | "returned" | "cancelled"; returned_at: string | null; created_at: string;
};

export const getVaultSummary = () => apiRequest<VaultSummary>("/api/vault/summary", { authenticated: true });
export const createVaultFolder = (payload: { name: string; capacity: number; color?: string | null }) => apiRequest<VaultFolder>("/api/vault/folders", { method: "POST", authenticated: true, body: JSON.stringify(payload) });
export const updateVaultFolder = (id: number, payload: Partial<Pick<VaultFolder, "name" | "capacity" | "color">>) => apiRequest<VaultFolder>(`/api/vault/folders/${id}`, { method: "PATCH", authenticated: true, body: JSON.stringify(payload) });
export const deleteVaultFolder = (id: number, options: { moveToFolderId?: number; deleteContents?: boolean } = {}) => {
  const search = new URLSearchParams();
  if (options.moveToFolderId) search.set("move_to_folder_id", String(options.moveToFolderId));
  if (options.deleteContents) search.set("delete_contents", "true");
  return apiRequest<void>(`/api/vault/folders/${id}${search.size ? `?${search}` : ""}`, { method: "DELETE", authenticated: true });
};
export const reorderVaultFolders = (folder_ids: number[]) => apiRequest<VaultFolder[]>("/api/vault/folders/reorder", { method: "PUT", authenticated: true, body: JSON.stringify({ folder_ids }) });
export const listVaultCards = (params: { folderId?: number; query?: string; wanted?: boolean } = {}) => {
  const search = new URLSearchParams();
  if (params.folderId) search.set("folder_id", String(params.folderId));
  if (params.query) search.set("query", params.query);
  if (params.wanted !== undefined) search.set("wanted", String(params.wanted));
  return apiRequest<VaultCard[]>(`/api/vault/cards?${search}`, { authenticated: true });
};
export const addVaultCard = (card: HkkCard, folder_id: number, quantity: number, print_variant: PrintVariant = "normal") => apiRequest<VaultCard>("/api/vault/cards", { method: "POST", authenticated: true, body: JSON.stringify({ ...card, folder_id, quantity, print_variant }) });
export const addWantedCard = (card: HkkCard, folder_id: number, print_variant: PrintVariant = "normal") => apiRequest<VaultCard>("/api/vault/cards/wanted", { method: "POST", authenticated: true, body: JSON.stringify({ ...card, folder_id, print_variant }) });
export const updateVaultCard = (id: number, payload: { quantity?: number; folder_id?: number; print_variant?: PrintVariant }) => apiRequest<VaultCard>(`/api/vault/cards/${id}`, { method: "PATCH", authenticated: true, body: JSON.stringify(payload) });
export const setVaultWanted = (id: number, wanted: boolean, quantity?: number) => apiRequest<VaultCard>(`/api/vault/cards/${id}/wanted`, { method: "PUT", authenticated: true, body: JSON.stringify({ wanted, quantity }) });
export const deleteVaultCard = (id: number) => apiRequest<void>(`/api/vault/cards/${id}`, { method: "DELETE", authenticated: true });
export const searchHkk = (query: string, editionId?: string) => {
  const search = new URLSearchParams();
  if (query.trim()) search.set("q", query.trim());
  if (editionId) search.set("edition_id", editionId);
  return apiRequest<HkkCard[]>(`/api/vault/hkk/search?${search}`, { authenticated: true });
};
export const listHkkEditions = () => apiRequest<HkkEdition[]>("/api/vault/hkk/editions", { authenticated: true });
export const previewHkkEdition = (editionId: string) => apiRequest<HkkEditionPreview>(`/api/vault/hkk/editions/${encodeURIComponent(editionId)}/cards`, { authenticated: true });
export const importHkkEdition = (payload: { edition_id: string; folder_id: number; quantity: number; missing_only: boolean; rarities: HkkRarity[] }) => apiRequest<HkkEditionImportResult>("/api/vault/hkk/editions/import", { method: "POST", authenticated: true, body: JSON.stringify(payload) });
export const listTradeCards = () => apiRequest<PublicTradeCard[]>("/api/vault/trade", { authenticated: true });
export const addTradeCard = (card: HkkCard, quantity: number, print_variant: PrintVariant = "normal") => apiRequest<PublicTradeCard>("/api/vault/trade", { method: "POST", authenticated: true, body: JSON.stringify({ ...card, quantity, print_variant }) });
export const updateTradeCard = (id: number, payload: { quantity: number; print_variant?: PrintVariant }) => apiRequest<PublicTradeCard>(`/api/vault/trade/${id}`, { method: "PATCH", authenticated: true, body: JSON.stringify(payload) });
export const deleteTradeCard = (id: number) => apiRequest<void>(`/api/vault/trade/${id}`, { method: "DELETE", authenticated: true });
export const listMatches = () => apiRequest<VaultCard[]>("/api/vault/matches", { authenticated: true });
export const listMatchingOffers = (cardId: number) => apiRequest<PublicTradeCard[]>(`/api/vault/cards/${cardId}/offers`, { authenticated: true });
export const getPublicTradeFolder = (username: string, query = "") => apiRequest<PublicTradeCard[]>(`/api/vault/public/${encodeURIComponent(username)}${query ? `?query=${encodeURIComponent(query)}` : ""}`);
export const getPointHistory = () => apiRequest<PointHistory>("/api/vault/points", { authenticated: true });
export const buyVaultCapacity = () => apiRequest<VaultSummary>("/api/vault/points/buy-capacity", { method: "POST", authenticated: true });
export const listNegotiations = () => apiRequest<VaultTrade[]>("/api/vault/negotiations", { authenticated: true });
export const expressTradeInterest = (cardId: number) => apiRequest<VaultTrade>(`/api/vault/trade/${cardId}/interest`, { method: "POST", authenticated: true });
export const postTradeMessage = (tradeId: number, message: string) => apiRequest<VaultTrade>(`/api/vault/negotiations/${tradeId}/messages`, { method: "POST", authenticated: true, body: JSON.stringify({ message }) });
export const confirmVaultTrade = (tradeId: number) => apiRequest<VaultTrade>(`/api/vault/negotiations/${tradeId}/confirm`, { method: "POST", authenticated: true });
export const reviewVaultTrade = (tradeId: number, rating: number, comment?: string) => apiRequest<{ id: number }>(`/api/vault/negotiations/${tradeId}/reviews`, { method: "POST", authenticated: true, body: JSON.stringify({ rating, comment: comment || null }) });
export const listCardLoans = () => apiRequest<VaultCardLoan[]>("/api/vault/loans", { authenticated: true });
export const createCardLoan = (cardId: number, payload: { quantity: number; borrower_name: string; lent_at: string; due_at?: string | null; note?: string | null }) => apiRequest<VaultCardLoan>(`/api/vault/cards/${cardId}/loans`, { method: "POST", authenticated: true, body: JSON.stringify(payload) });
export const returnCardLoan = (loanId: number) => apiRequest<VaultCardLoan>(`/api/vault/loans/${loanId}/return`, { method: "POST", authenticated: true });
