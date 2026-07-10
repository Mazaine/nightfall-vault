import { apiClient } from "./client";
import type { Product } from "../types";

export async function getProducts(params?: { search?: string; category_slug?: string; subcategory_slug?: string; show_sale_only?: boolean }): Promise<Product[]> {
  const response = await apiClient.get<Product[]>("/api/products", { params });
  return response.data;
}

export async function getFeaturedProducts(): Promise<Product[]> {
  const response = await apiClient.get<Product[]>("/api/products/featured");
  return response.data;
}

export async function getProduct(slug: string): Promise<Product> {
  const response = await apiClient.get<Product>(`/api/products/${slug}`);
  return response.data;
}
