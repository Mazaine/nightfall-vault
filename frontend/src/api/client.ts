export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
export const AUTH_TOKEN_STORAGE_KEY = "nightfall_auth_token";
export const USER_STORAGE_KEY = "nightfall_user";
export const SESSION_EXPIRED_EVENT = "nightfall-session-expired";
const LEGACY_AUTH_TOKEN_STORAGE_KEY = "webshop_template_auth_token";

type RequestOptions = RequestInit & {
  authenticated?: boolean;
};

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiAssetUrl(apiUrl: string | null | undefined) {
  if (!apiUrl) {
    return "";
  }
  if (/^https?:\/\//i.test(apiUrl)) {
    return apiUrl;
  }
  return `${API_BASE_URL.replace(/\/$/, "")}/${apiUrl.replace(/^\//, "")}`;
}

export function getStoredToken() {
  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_AUTH_TOKEN_STORAGE_KEY);
}

function normalizeValidationMessage(value: unknown) {
  const message = String(value ?? "").trim();
  if (!message) return "Hibás érték.";
  if (/field required|required field/i.test(message)) return "A mező kitöltése kötelező.";
  const minimum = message.match(/at least (\d+) characters?/i);
  if (minimum) return `Legalább ${minimum[1]} karakter szükséges.`;
  const maximum = message.match(/at most (\d+) characters?/i);
  if (maximum) return `Legfeljebb ${maximum[1]} karakter adható meg.`;
  if (/valid email|email address|value is not a valid email/i.test(message)) return "Érvényes e-mail-címet adj meg.";
  if (/valid integer|valid number|parsing input/i.test(message)) return "Érvényes számot adj meg.";
  if (/greater than|less than|input should be/i.test(message)) return "Az érték kívül esik a megengedett tartományon.";
  if (/validation error|value error|invalid value/i.test(message)) return "Hibás érték.";
  return message;
}

function normalizeFieldErrors(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  if (Array.isArray(value)) {
    return Object.fromEntries(value.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const field = "field" in item ? String(item.field) : "request";
      const message = "message" in item ? normalizeValidationMessage(item.message) : "Hibás érték.";
      return [[field, message]];
    }));
  }
  return Object.fromEntries(Object.entries(value).map(([field, message]) => [field, normalizeValidationMessage(message)]));
}

function normalizeApiErrorMessage(value: unknown, status: number) {
  const message = typeof value === "string" ? value.trim() : "";
  const technicalMessage = /failed to fetch|networkerror|load failed|internal server error|unprocessable entity|validation error|unauthorized|forbidden|not found|traceback|exception|sql|cannot read propert|\bundefined\b|\bnull\b/i;

  if (message && !technicalMessage.test(message)) return message;
  if (status === 401) return "A munkameneted lejárt. Jelentkezz be újra.";
  if (status === 403) return "Nincs jogosultságod ehhez a művelethez.";
  if (status === 404) return "A keresett adat nem található.";
  if (status === 409) return "A művelet az adat jelenlegi állapota miatt nem végezhető el.";
  if (status === 422) return "Ellenőrizd a megadott adatokat.";
  if (status >= 500) return "A kiszolgáló átmenetileg nem érhető el. Próbáld újra később.";
  return "Nem sikerült kapcsolódni a kiszolgálóhoz. Ellenőrizd a kapcsolatot, majd próbáld újra.";
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

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      cache: options.authenticated === false ? options.cache : "no-store",
    });
  } catch {
    throw new ApiError(normalizeApiErrorMessage(null, 0), 0);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const rawMessage = typeof errorBody?.detail === "string"
      ? errorBody.detail
      : errorBody?.detail?.message ?? errorBody?.message ?? "A kérés nem sikerült.";
    const message = normalizeApiErrorMessage(rawMessage, response.status);
    const fieldErrors = normalizeFieldErrors(errorBody?.detail?.errors ?? errorBody?.errors);
    if (response.status === 401 && options.authenticated !== false) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { message } }));
    }
    throw new ApiError(message, response.status, fieldErrors);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
