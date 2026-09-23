"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, clearTokens, getAccessToken, setTokens } from "./apiClient";

export interface PlatformActor {
  id: string;
  fullName: string;
  role: "SUPER_ADMIN" | "SUPPORT_ADMIN";
}

interface AuthContextValue {
  actor: PlatformActor | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ACTOR_STORAGE_KEY = "tezkassa_admin_actor";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [actor, setActor] = useState<PlatformActor | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(ACTOR_STORAGE_KEY) : null;
    if (stored && getAccessToken()) {
      setActor(JSON.parse(stored));
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<{ accessToken: string; refreshToken: string; actor: { id: string; fullName: string; role: string } }>(
      "/v1/auth/login",
      { email, password },
    );
    setTokens(result.accessToken, result.refreshToken);
    const platformActor: PlatformActor = { id: result.actor.id, fullName: result.actor.fullName, role: result.actor.role as never };
    window.localStorage.setItem(ACTOR_STORAGE_KEY, JSON.stringify(platformActor));
    setActor(platformActor);
    router.push("/dashboard");
  }, [router]);

  const logout = useCallback(() => {
    clearTokens();
    window.localStorage.removeItem(ACTOR_STORAGE_KEY);
    setActor(null);
    router.push("/login");
  }, [router]);

  return <AuthContext.Provider value={{ actor, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
