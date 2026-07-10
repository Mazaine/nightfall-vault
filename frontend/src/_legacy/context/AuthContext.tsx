import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { getMe, login as loginRequest, register as registerRequest } from "../api/auth";
import { AUTH_TOKEN_STORAGE_KEY } from "../api/client";
import type { MessageResponse, User } from "../types";

type AuthContextValue = {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, captchaToken?: string | null) => Promise<User>;
  register: (
    email: string,
    username: string,
    fullName: string,
    password: string,
    confirmPassword: string,
    acceptedTerms: boolean,
    acceptedPrivacy: boolean,
    subscribedNewsletter: boolean,
    captchaToken?: string | null,
  ) => Promise<MessageResponse>;
  logout: () => void;
  refreshMe: () => Promise<User | null>;
};

type AuthProviderProps = {
  children: React.ReactNode;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(AUTH_TOKEN_STORAGE_KEY),
  );
  const [isLoading, setIsLoading] = useState(true);

  const clearAuthState = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const storeAuthState = useCallback((accessToken: string, authenticatedUser: User) => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, accessToken);
    setToken(accessToken);
    setUser(authenticatedUser);
  }, []);

  const refreshMe = useCallback(async () => {
    const storedToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);

    if (!storedToken) {
      clearAuthState();
      return null;
    }

    try {
      const currentUser = await getMe();
      setToken(storedToken);
      setUser(currentUser);
      return currentUser;
    } catch {
      clearAuthState();
      return null;
    }
  }, [clearAuthState]);

  useEffect(() => {
    refreshMe().finally(() => setIsLoading(false));
  }, [refreshMe]);

  const login = useCallback(
    async (email: string, password: string, captchaToken?: string | null) => {
      const authResponse = await loginRequest({ email, password, captcha_token: captchaToken ?? null });
      storeAuthState(authResponse.access_token, authResponse.user);
      return authResponse.user;
    },
    [storeAuthState],
  );

  const register = useCallback(
    async (
      email: string,
      username: string,
      fullName: string,
      password: string,
      confirmPassword: string,
      acceptedTerms: boolean,
      acceptedPrivacy: boolean,
      subscribedNewsletter = false,
      captchaToken?: string | null,
    ) => {
      return registerRequest({
        email,
        username,
        full_name: fullName,
        password,
        confirm_password: confirmPassword,
        accepted_terms: acceptedTerms,
        accepted_privacy: acceptedPrivacy,
        subscribed_newsletter: subscribedNewsletter,
        captcha_token: captchaToken ?? null,
      });
    },
    [],
  );

  const logout = useCallback(() => {
    clearAuthState();
  }, [clearAuthState]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: user !== null && token !== null,
      isLoading,
      login,
      register,
      logout,
      refreshMe,
    }),
    [isLoading, login, logout, refreshMe, register, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
