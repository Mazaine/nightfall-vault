import { apiRequest } from "./client";

export type AuthUser = {
  id: number;
  email: string;
  username: string;
  full_name: string;
  role: "user" | "admin";
};

export type LoginResponse = {
  access_token: string;
  token_type: "bearer";
  user: AuthUser;
};

export async function login(email: string, password: string) {
  const response = await apiRequest<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    authenticated: false,
  });
  return response;
}

export async function register(fullName: string, email: string, password: string) {
  const username = email.split("@", 1)[0].replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
  return apiRequest<{ message: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      username,
      full_name: fullName,
      password,
      confirm_password: password,
      accepted_terms: true,
      accepted_privacy: true,
      subscribed_newsletter: false,
    }),
    authenticated: false,
  });
}

export type NotificationPreferences = {
  notify_in_app: boolean;
  notify_email_outbid: boolean;
  notify_email_auction_result: boolean;
  notify_email_moderation: boolean;
};

export async function getNotificationPreferences() {
  return apiRequest<NotificationPreferences>("/api/auth/me/notification-preferences");
}

export async function updateNotificationPreferences(payload: NotificationPreferences) {
  return apiRequest<NotificationPreferences>("/api/auth/me/notification-preferences", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
