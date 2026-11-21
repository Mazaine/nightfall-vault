import { apiRequest, API_BASE_URL, getStoredToken } from "./client";
export type StockSource = { id: number; name: string; mapping: Record<string, string> };
export type StockItem = { id: number; name: string; card_id: string | null; graphic_type: string; edition: string; condition: string; free: number; reserved: number; pending: number; price: number; retro: boolean; status: string; version: string; link: { source_id: number } | null };
export type ImportRow = { index?: number; line: number; state: string; action?: string; target_id?: number; desired_free?: number; before?: { free: number; buy_now_price: string; reserved: number; status: string; link: { source_id: number } | null }; values: Record<string, string | number | boolean>; issues: string[]; existing?: { id: number; title: string; free: number }[]; candidates?: CatalogCard[] };
export type CatalogCard = { external_card_id: string; card_name: string; edition: string | null; image_url: string | null };
export type StockOperation = { id: number; kind: string; status: string; total: number; visible_total?: number; rows: ImportRow[]; counts: Record<string, number>; version: string; changes_count: number; context: { full_source?: boolean; full_allowed?: boolean; reconciled?: boolean; missing?: { id: number; name: string }[] } };
export type MappingNeeded = { needs_mapping: true; headers: string[]; mapping: Record<string, string>; header_row: number };
const base = "/api/inventory";
export const stockSources = () => apiRequest<StockSource[]>(`${base}/sources`);
export const saveStockSource = (name: string, id?: number) => apiRequest<StockSource>(`${base}/sources${id ? `/${id}` : ""}`, { method: id ? "PATCH" : "POST", body: JSON.stringify({ name }) });
export const stockItems = (params: URLSearchParams) => apiRequest<{ total: number; items: StockItem[]; limits?: { max_bytes: number; max_rows: number } }>(`${base}?${params}`);
export const uploadStock = (data: FormData) => apiRequest<StockOperation | MappingNeeded>(`${base}/preview`, { method: "POST", body: data });
export const stockOperation = (id: number, offset = 0, pendingOnly = false) => apiRequest<StockOperation>(`${base}/operations/${id}?${new URLSearchParams({ offset: String(offset), pending_only: String(pendingOnly) })}`);
export const stockHistory = (page = 1) => apiRequest<{ id: number; kind: string; status: string; created_at: string }[]>(`${base}/operations?page=${page}`);
export const editStockRow = (id: number, index: number, data: unknown) => apiRequest<StockOperation>(`${base}/operations/${id}/rows/${index}`, { method: "PATCH", body: JSON.stringify(data) });
export const resolveStock = (id: number) => apiRequest<StockOperation>(`${base}/operations/${id}/resolve`, { method: "POST" });
export const searchStockCatalog = (query: string) => apiRequest<CatalogCard[]>(`${base}/catalog?${new URLSearchParams({ query })}`);
export const applyStock = (op: StockOperation, selected: number[] | null, confirmMissing = false) => apiRequest<StockOperation>(`${base}/operations/${op.id}/apply`, { method: "POST", body: JSON.stringify({ selected, version: op.version, confirmed: true, confirm_missing: confirmMissing }) });
export const bulkStock = (data: unknown) => apiRequest<StockOperation>(`${base}/bulk/preview`, { method: "POST", body: JSON.stringify(data) });
export const undoStockPreview = (id: number) => apiRequest<{ can_undo: boolean; conflicts: number[]; count: number; token: string }>(`${base}/operations/${id}/undo`);
export const undoStock = (id: number, token: string) => apiRequest(`${base}/operations/${id}/undo`, { method: "POST", body: JSON.stringify({ token, confirmed: true }) });
export async function exportStock(params: URLSearchParams) {
  const response = await fetch(`${API_BASE_URL}${base}/export?${params}`, { credentials: "include", headers: { Authorization: `Bearer ${getStoredToken()}` }, cache: "no-store" });
  if (!response.ok) throw new Error("Az export nem sikerült. Ellenőrizd a kijelölést és a bejelentkezést.");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a"); link.href = url; link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] || "nightfall-inventory.csv"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
