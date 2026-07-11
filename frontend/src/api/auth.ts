import { apiRequest, AUTH_TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from "./client";

export type AuthUser = {
  id: number;
  email: string;
  username: string;
  full_name: string;
  role: "user" | "admin";
};

type LoginResponse = {
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
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, response.access_token);
  window.localStorage.setItem(
    USER_STORAGE_KEY,
    JSON.stringify({
      email: response.user.email,
      fullName: response.user.full_name,
      name: response.user.full_name || response.user.username,
      role: response.user.role,
      isAdmin: response.user.role === "admin",
    }),
  );
  return response.user;
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
