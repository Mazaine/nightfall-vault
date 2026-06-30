import { apiClient } from "./client";
import type { MessageResponse, NewsletterMe, NewsletterSubscribeRequest } from "../types";

export async function getMyNewsletterStatus(): Promise<NewsletterMe> {
  const response = await apiClient.get<NewsletterMe>("/api/newsletter/me");
  return response.data;
}

export async function updateMyNewsletterStatus(isActive: boolean): Promise<NewsletterMe> {
  const response = await apiClient.patch<NewsletterMe>("/api/newsletter/me", {
    is_active: isActive,
  });
  return response.data;
}

export async function subscribeNewsletter(payload: NewsletterSubscribeRequest): Promise<MessageResponse> {
  const response = await apiClient.post<MessageResponse>("/api/newsletter/subscribe", {
    email: payload.email,
    full_name: payload.full_name ?? null,
    source: "manual",
    captcha_token: payload.captcha_token ?? null,
  });
  return response.data;
}
