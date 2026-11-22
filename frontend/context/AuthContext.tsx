"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, getMe, login as loginRequest } from "@/lib/api";
import type { AuthUser, Role } from "@/types/crc";

const STORAGE_KEY = "crc.auth.token";
const ROLE_RANK: Record<Role, number> = { student: 1, faculty: 2, researcher: 2, admin: 3 };

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  status: "loading" | "anonymous" | "authenticated";
  login: (identifier: string, passcode: string) => Promise<void>;
  logout: () => void;
  can: (minimum: Role) => boolean;
  loginOpen: boolean;
  promptLogin: () => void;
  closeLogin: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");
  const [loginOpen, setLoginOpen] = useState(false);

  const clearSession = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage may be disabled; memory state still clears.
    }
    setUser(null);
    setToken(null);
    setStatus("anonymous");
  }, []);

  useEffect(() => {
    let active = true;
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      saved = null;
    }
    if (!saved) {
      setStatus("anonymous");
      return;
    }
    setToken(saved);
    getMe()
      .then((me) => {
        if (!active) return;
        setUser(me);
        setStatus("authenticated");
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          clearSession();
        } else {
          setStatus("anonymous");
        }
      });
    return () => {
      active = false;
    };
  }, [clearSession]);

  useEffect(() => {
    const onExpired = () => {
      if (!token) return;
      clearSession();
      window.dispatchEvent(new CustomEvent("crc:toast", { detail: "Session expired. Please sign in again." }));
    };
    window.addEventListener("crc:auth-expired", onExpired);
    return () => window.removeEventListener("crc:auth-expired", onExpired);
  }, [clearSession, token]);

  const login = useCallback(async (identifier: string, passcode: string) => {
    const result = await loginRequest(identifier, passcode);
    try {
      window.localStorage.setItem(STORAGE_KEY, result.token);
    } catch {
      throw new Error("Unable to store your session in this browser.");
    }
    setToken(result.token);
    setUser(result.user);
    setStatus("authenticated");
    setLoginOpen(false);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    window.dispatchEvent(new CustomEvent("crc:toast", { detail: "You’ve signed out." }));
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    token,
    status,
    login,
    logout,
    can: (minimum) => !!user && ROLE_RANK[user.role] >= ROLE_RANK[minimum],
    loginOpen,
    promptLogin: () => setLoginOpen(true),
    closeLogin: () => setLoginOpen(false),
  }), [user, token, status, login, logout, loginOpen]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
