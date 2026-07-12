import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import { login as loginRequest, type AuthUser } from "./api/auth";
import { AUTH_TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from "./api/client";

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
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
    };
  } catch {
    return null;
  }
}

function storeSession(token: string, user: AuthUser) {
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

function clearSession() {
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(USER_STORAGE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isAuthenticated: user !== null,
    isAdmin: user?.role === "admin",
    login: async (email: string, password: string) => {
      const response = await loginRequest(email, password);
      storeSession(response.access_token, response.user);
      setUser(response.user);
      return response.user;
    },
    logout: () => {
      clearSession();
      setUser(null);
    },
  }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
