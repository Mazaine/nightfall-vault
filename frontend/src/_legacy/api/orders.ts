import { apiClient } from "./client";
import type { Order, OrderDetail } from "../types";

export async function getMyOrders(): Promise<Order[]> {
  const response = await apiClient.get<Order[]>("/api/orders/me");
  return response.data;
}

export async function getMyOrder(orderId: number): Promise<OrderDetail> {
  const response = await apiClient.get<OrderDetail>(`/api/orders/me/${orderId}`);
  return response.data;
}

