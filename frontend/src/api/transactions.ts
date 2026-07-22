import { apiRequest } from "./client";

export type TransactionStatus = "transaction_open" | "completed" | "reviewed" | "archived";

export type AuctionTransaction = {
  id: number;
  auction_id: number;
  status: TransactionStatus;
  seller_completed_at: string | null;
  buyer_completed_at: string | null;
  completed_at: string | null;
  review_deadline: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  role: "seller" | "buyer";
  own_completed_at: string | null;
  partner_completed_at: string | null;
  can_confirm: boolean;
  can_review: boolean;
  auction: { id: number; title: string; finalized_at: string | null };
  partner: { username: string; full_name: string };
};

export type TransactionPage = { items: AuctionTransaction[]; total: number; limit: number; offset: number };

export function listTransactions(status = "", limit = 20) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set("status", status);
  const query = `?${params.toString()}`;
  return apiRequest<TransactionPage>(`/api/transactions${query}`);
}

export function confirmTransactionCompletion(transactionId: number) {
  return apiRequest<AuctionTransaction>(`/api/transactions/${transactionId}/confirm-completion`, { method: "POST" });
}
