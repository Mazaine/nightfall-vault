import { apiClient } from "./client";
import type { AvailableShippingMethodsResponse } from "../types";

export type ShippingQuoteItem = {
  product_id: number;
  quantity: number;
};

export async function getAvailableShippingMethods(
  items: ShippingQuoteItem[],
): Promise<AvailableShippingMethodsResponse> {
  const response = await apiClient.post<AvailableShippingMethodsResponse>(
    "/api/shipping/available-methods",
    { items },
  );
  return response.data;
}
