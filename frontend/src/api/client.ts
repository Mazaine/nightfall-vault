export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
export const AUTH_TOKEN_STORAGE_KEY = "webshop_template_auth_token";
export const USER_STORAGE_KEY = "nightfall_user";

type RequestOptions = RequestInit & {
  authenticated?: boolean;
};

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
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = typeof errorBody?.detail === "string"
      ? errorBody.detail
      : errorBody?.detail?.message ?? errorBody?.message ?? "A kérés nem sikerült.";
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}
