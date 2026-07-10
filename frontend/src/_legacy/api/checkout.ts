import { apiClient } from "./client";
import type { OrderCreatePayload, OrderDetail } from "../types";

export async function createCheckoutOrder(payload: OrderCreatePayload): Promise<OrderDetail> {
  const response = await apiClient.post<OrderDetail>("/api/checkout", payload);
  return response.data;
}
