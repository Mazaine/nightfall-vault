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

export type MessageResponse = { message: string };

export type RegisterRequest = {
  email: string;
  username: string;
  full_name: string;
  password: string;
  confirm_password: string;
  accepted_terms: boolean;
  accepted_privacy: boolean;
  subscribed_newsletter?: boolean;
  captcha_token?: string | null;
};

export async function login(email: string, password: string, captchaToken?: string | null) {
  const response = await apiRequest<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, captcha_token: captchaToken ?? null }),
    authenticated: false,
  });
  return response;
}

export async function register(payload: RegisterRequest) {
  return apiRequest<MessageResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
    authenticated: false,
  });
}

export async function getMe() {
  return apiRequest<AuthUser>("/api/auth/me");
}

export async function forgotPassword(email: string, captchaToken?: string | null) {
  return apiRequest<MessageResponse>("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email, captcha_token: captchaToken ?? null }),
    authenticated: false,
  });
}

export async function resendVerification(email: string, captchaToken?: string | null) {
  return apiRequest<MessageResponse>("/api/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email, captcha_token: captchaToken ?? null }),
    authenticated: false,
  });
}

export async function resetPassword(token: string, newPassword: string, confirmPassword: string) {
  return apiRequest<MessageResponse>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password: newPassword, confirm_password: confirmPassword }),
    authenticated: false,
  });
}

export async function verifyEmail(token: string) {
  const query = new URLSearchParams({ token });
  return apiRequest<MessageResponse>(`/api/auth/verify-email?${query.toString()}`, { authenticated: false });
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
