import { apiClient } from "./client";
import type { Category } from "../types";

export async function getActiveCategories(): Promise<Category[]> {
  const response = await apiClient.get<Category[]>("/api/categories");
  return response.data;
}
