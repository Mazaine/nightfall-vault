import { apiRequest } from "./client";

export type VipStatus = {
  is_vip: boolean;
  vip_expires_at: string | null;
  active_auction_limit: number | null;
  active_auction_count: number;
  featured_auctions: boolean;
  message?: string;
};

export type VipCodeBatch = {
  batch_id: string;
  duration_months: 1 | 3;
  quantity: number;
  created_at: string;
  codes: Array<{ code: string; duration_months: 1 | 3 }>;
};

export type VipCodeAdminItem = {
  id: number;
  code: string | null;
  masked_code: string;
  duration_months: 1 | 3;
  batch_id: string;
  created_at: string;
  redeemed_at: string | null;
  redeemed_by_username: string | null;
};

export const getVipStatus = () => apiRequest<VipStatus>("/api/membership");

export const activateVipCode = (code: string) => apiRequest<VipStatus>("/api/membership/activate", {
  method: "POST",
  body: JSON.stringify({ code }),
});

export const generateVipCodes = (quantity: 10 | 50 | 100 | 150 | 200 | 500, durationMonths: 1 | 3) =>
  apiRequest<VipCodeBatch>("/api/admin/vip-codes/generate", {
    method: "POST",
    body: JSON.stringify({ quantity, duration_months: durationMonths }),
  });

export const getAdminVipCodes = () => apiRequest<VipCodeAdminItem[]>("/api/admin/vip-codes?limit=5000");
