export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
export const AUTH_TOKEN_STORAGE_KEY = "webshop_template_auth_token";
export const USER_STORAGE_KEY = "nightfall_user";
export const SESSION_EXPIRED_EVENT = "nightfall-session-expired";

type RequestOptions = RequestInit & {
  authenticated?: boolean;
};

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiAssetUrl(storageKey: string | null | undefined) {
  if (!storageKey) {
    return "";
  }
  return `${API_BASE_URL.replace(/\/$/, "")}/uploads/${storageKey}`;
}

export function getStoredToken() {
  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);

  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const token = getStoredToken();
  if (options.authenticated !== false && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    cache: options.authenticated === false ? options.cache : "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = typeof errorBody?.detail === "string"
      ? errorBody.detail
      : errorBody?.detail?.message ?? errorBody?.message ?? "A kérés nem sikerült.";
    if (response.status === 401 && options.authenticated !== false) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { message } }));
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
