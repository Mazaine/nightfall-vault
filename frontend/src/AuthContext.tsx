import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { getMe, login as loginRequest, type AuthUser } from "./api/auth";
import { AUTH_TOKEN_STORAGE_KEY, SESSION_EXPIRED_EVENT, USER_STORAGE_KEY } from "./api/client";

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  login: (email: string, password: string, captchaToken?: string | null) => Promise<AuthUser>;
  logout: () => void;
  refreshMe: () => Promise<AuthUser | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): AuthUser | null {
  if (typeof window === "undefined") {
    return null;
  }
  const rawUser = window.localStorage.getItem(USER_STORAGE_KEY);
  if (!rawUser) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawUser) as Partial<AuthUser> & { fullName?: string; name?: string; isAdmin?: boolean };
    if (!parsed.email) {
      return null;
    }
    return {
      id: Number(parsed.id ?? 0),
      email: parsed.email,
      username: parsed.username ?? parsed.email.split("@", 1)[0],
      full_name: parsed.full_name ?? parsed.fullName ?? parsed.name ?? parsed.email,
      role: parsed.role === "admin" || parsed.isAdmin ? "admin" : "user",
      is_vip: Boolean(parsed.is_vip),
      vip_expires_at: parsed.vip_expires_at ?? null,
    };
  } catch {
    return null;
  }
}

function storeSession(token: string, user: AuthUser) {
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  window.localStorage.removeItem("webshop_template_auth_token");
  window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

function clearSession() {
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem("webshop_template_auth_token");
  window.localStorage.removeItem(USER_STORAGE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());
  const [isLoading, setIsLoading] = useState(true);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  const refreshMe = async () => {
    if (!window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) && !window.localStorage.getItem("webshop_template_auth_token")) {
      setUser(null);
      setIsLoading(false);
      return null;
    }
    try {
      const currentUser = await getMe();
      setUser(currentUser);
      window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(currentUser));
      return currentUser;
    } catch {
      clearSession();
      setUser(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshMe();
  }, []);

  useEffect(() => {
    const handleExpiredSession = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      clearSession();
      setUser(null);
      setIsLoading(false);
      setSessionMessage(detail?.message ?? "A munkamenet lejárt. Kérlek, jelentkezz be újra.");
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpiredSession);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpiredSession);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isAuthenticated: user !== null,
    isAdmin: user?.role === "admin",
    isLoading,
    login: async (email: string, password: string, captchaToken?: string | null) => {
      const response = await loginRequest(email, password, captchaToken);
      storeSession(response.access_token, response.user);
      setUser(response.user);
      setSessionMessage(null);
      return response.user;
    },
    logout: () => {
      clearSession();
      setUser(null);
      setSessionMessage(null);
    },
    refreshMe,
  }), [isLoading, user]);

  return (
    <AuthContext.Provider value={value}>
      {sessionMessage ? <div className="session-expired-banner">{sessionMessage}</div> : null}
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
