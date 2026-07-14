import { apiRequest } from "./client";

export type TransactionStatus = "awaiting_arrangement" | "in_progress" | "completed" | "disputed" | "cancelled";

export type AuctionTransaction = {
  id: number;
  auction_id: number;
  auction_title: string;
  auction_image_key: string | null;
  amount: string;
  status: TransactionStatus;
  role: "seller" | "buyer";
  counterparty: { username: string; full_name: string };
  seller_confirmed: boolean;
  buyer_confirmed: boolean;
  can_confirm: boolean;
  can_dispute: boolean;
  dispute_reason: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export function listMyTransactions() {
  return apiRequest<AuctionTransaction[]>("/api/transactions");
}

export function confirmTransaction(transactionId: number) {
  return apiRequest<AuctionTransaction>(`/api/transactions/${transactionId}/confirm`, { method: "POST" });
}

export function openTransactionDispute(transactionId: number, reason: string) {
  return apiRequest<AuctionTransaction>(`/api/transactions/${transactionId}/disputes`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
