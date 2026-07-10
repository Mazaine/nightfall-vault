import { apiClient } from "./client";
import type { AdminStats, NewsletterBulkSendResponse, NewsletterCampaign, NewsletterCampaignPayload, NewsletterSubscriber, NewsletterSubscriberPayload, Order, OrderDetail, OrderStatus, ProductAdmin, ProductCreatePayload, ProductUpdatePayload, ShippingMethod, ShippingMethodPayload, StockAdjustmentPayload, StockMovement, User, UserAdminUpdatePayload } from "../types";

export async function getAdminStats(): Promise<AdminStats> { return (await apiClient.get<AdminStats>("/api/admin/stats")).data; }
export async function getAdminShippingMethods(): Promise<ShippingMethod[]> { return (await apiClient.get<ShippingMethod[]>("/api/admin/shipping/methods")).data; }
export async function createAdminShippingMethod(payload: ShippingMethodPayload): Promise<ShippingMethod> { return (await apiClient.post<ShippingMethod>("/api/admin/shipping/methods", payload)).data; }
export async function updateAdminShippingMethod(methodId: number, payload: Partial<ShippingMethodPayload>): Promise<ShippingMethod> { return (await apiClient.patch<ShippingMethod>(`/api/admin/shipping/methods/${methodId}`, payload)).data; }
export async function deleteAdminShippingMethod(methodId: number): Promise<ShippingMethod> { return (await apiClient.delete<ShippingMethod>(`/api/admin/shipping/methods/${methodId}`)).data; }
export async function getAdminNewsletterCampaigns(): Promise<NewsletterCampaign[]> { return (await apiClient.get<NewsletterCampaign[]>("/api/admin/newsletters/campaigns")).data; }
export async function createAdminNewsletterCampaign(payload: NewsletterCampaignPayload): Promise<NewsletterCampaign> { return (await apiClient.post<NewsletterCampaign>("/api/admin/newsletters/campaigns", payload)).data; }
export async function updateAdminNewsletterCampaign(campaignId: number, payload: Partial<NewsletterCampaignPayload>): Promise<NewsletterCampaign> { return (await apiClient.patch<NewsletterCampaign>(`/api/admin/newsletters/campaigns/${campaignId}`, payload)).data; }
export async function deleteAdminNewsletterCampaign(campaignId: number): Promise<NewsletterCampaign> { return (await apiClient.delete<NewsletterCampaign>(`/api/admin/newsletters/campaigns/${campaignId}`)).data; }
export async function sendAdminNewsletterTest(campaignId: number, testEmail: string): Promise<NewsletterCampaign> { return (await apiClient.post<NewsletterCampaign>(`/api/admin/newsletters/campaigns/${campaignId}/send-test`, { test_email: testEmail })).data; }
export async function sendAdminNewsletterBulk(campaignId: number, payload: { subscriber_ids?: number[]; send_to_all?: boolean }): Promise<NewsletterBulkSendResponse> { return (await apiClient.post<NewsletterBulkSendResponse>(`/api/admin/newsletters/campaigns/${campaignId}/send`, payload)).data; }
export async function getAdminNewsletterSubscribers(): Promise<NewsletterSubscriber[]> { return (await apiClient.get<NewsletterSubscriber[]>("/api/admin/newsletters/subscribers")).data; }
export async function createAdminNewsletterSubscriber(payload: NewsletterSubscriberPayload): Promise<NewsletterSubscriber> { return (await apiClient.post<NewsletterSubscriber>("/api/admin/newsletters/subscribers", payload)).data; }
export async function updateAdminNewsletterSubscriber(subscriberId: number, payload: Partial<NewsletterSubscriberPayload>): Promise<NewsletterSubscriber> { return (await apiClient.patch<NewsletterSubscriber>(`/api/admin/newsletters/subscribers/${subscriberId}`, payload)).data; }
export async function deleteAdminNewsletterSubscriber(subscriberId: number): Promise<NewsletterSubscriber> { return (await apiClient.delete<NewsletterSubscriber>(`/api/admin/newsletters/subscribers/${subscriberId}`)).data; }
export async function getAdminProducts(): Promise<ProductAdmin[]> { return (await apiClient.get<ProductAdmin[]>("/api/admin/products")).data; }
export async function getAdminUsers(): Promise<User[]> { return (await apiClient.get<User[]>("/api/admin/users")).data; }
export async function searchAdminUsers(query: string): Promise<User[]> { return (await apiClient.get<User[]>("/api/admin/users/search", { params: { query } })).data; }
export async function updateAdminUser(userId: number, payload: UserAdminUpdatePayload): Promise<User> { return (await apiClient.patch<User>(`/api/admin/users/${userId}`, payload)).data; }
export async function deleteAdminUser(userId: number): Promise<User> { return (await apiClient.delete<User>(`/api/admin/users/${userId}`)).data; }
export async function getAdminOrders(params: { search?: string; status?: OrderStatus | "" }): Promise<Order[]> { return (await apiClient.get<Order[]>("/api/admin/orders", { params })).data; }
export async function getAdminOrder(orderId: number): Promise<OrderDetail> { return (await apiClient.get<OrderDetail>(`/api/admin/orders/${orderId}`)).data; }
export async function updateAdminOrderStatus(orderId: number, status: OrderStatus): Promise<OrderDetail> { return (await apiClient.patch<OrderDetail>(`/api/admin/orders/${orderId}/status`, { status })).data; }
export async function createAdminProduct(payload: ProductCreatePayload): Promise<ProductAdmin> { return (await apiClient.post<ProductAdmin>("/api/admin/products", payload)).data; }
export async function updateAdminProduct(productId: number, payload: ProductUpdatePayload): Promise<ProductAdmin> { return (await apiClient.patch<ProductAdmin>(`/api/admin/products/${productId}`, payload)).data; }
export async function getAdminStockMovements(): Promise<StockMovement[]> { return (await apiClient.get<StockMovement[]>("/api/admin/stock-movements")).data; }
export async function getAdminProductStockMovements(productId: number): Promise<StockMovement[]> { return (await apiClient.get<StockMovement[]>(`/api/admin/products/${productId}/stock-movements`)).data; }
export async function adjustAdminProductStock(productId: number, payload: StockAdjustmentPayload): Promise<ProductAdmin> { return (await apiClient.post<ProductAdmin>(`/api/admin/products/${productId}/stock-adjust`, payload)).data; }
export async function deactivateAdminProduct(productId: number): Promise<ProductAdmin> { return (await apiClient.delete<ProductAdmin>(`/api/admin/products/${productId}`)).data; }
export async function uploadAdminProductImage(file: File): Promise<string> { const formData = new FormData(); formData.append("image", file); return (await apiClient.post<{ image_url: string }>("/api/admin/products/images", formData, { headers: { "Content-Type": "multipart/form-data" } })).data.image_url; }
