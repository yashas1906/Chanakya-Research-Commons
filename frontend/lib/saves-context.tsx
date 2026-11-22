"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSaves, removeSavedPaper, savePaper } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type { SavedPaper } from "@/types/crc";

interface SavesContextValue {
  saves: SavedPaper[];
  savedIds: ReadonlySet<string>;
  status: "idle" | "loading" | "ready" | "error";
  error: unknown;
  /** Saves a paper for the authenticated member, then refreshes the shelf. Throws on failure. */
  save: (paperId: string, notes?: string, collectionId?: string | null) => Promise<void>;
  remove: (paperId: string) => Promise<void>;
  refresh: () => void;
}

const SavesContext = createContext<SavesContextValue | null>(null);

/** One shelf of papers saved by the authenticated member. */
export function SavesProvider({ children }: { children: React.ReactNode }) {
  const { user, status: authStatus } = useAuth();
  const [saves, setSaves] = useState<SavedPaper[]>([]);
  const [status, setStatus] = useState<SavesContextValue["status"]>("idle");
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const userId = user?.user_id ?? null;

  useEffect(() => {
    if (authStatus === "loading") return;
    if (!userId) {
      setSaves([]);
      setStatus("idle");
      return;
    }
    const ctrl = new AbortController();
    setStatus("loading");
    getSaves(userId, ctrl.signal)
      .then((list) => {
        setSaves(list);
        setError(null);
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e);
        setStatus("error");
      });
    return () => ctrl.abort();
  }, [userId, authStatus, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const save = useCallback(
    async (paperId: string, notes = "", collectionId?: string | null) => {
      if (!userId) throw new Error("Sign in to save papers.");
      await savePaper(userId, paperId, notes, collectionId);
      setTick((t) => t + 1);
    },
    [userId],
  );
  const remove = useCallback(async (paperId: string) => {
    if (!userId) throw new Error("Sign in to remove saved papers.");
    const previous = saves;
    setSaves((current) => current.filter((paper) => paper.paper_id !== paperId));
    try {
      await removeSavedPaper(paperId);
      setTick((t) => t + 1);
    } catch (error) {
      setSaves(previous);
      throw error;
    }
  }, [userId, saves]);

  const value = useMemo<SavesContextValue>(
    () => ({ saves, savedIds: new Set(saves.map((s) => s.paper_id)), status, error, save, remove, refresh }),
    [saves, status, error, save, remove, refresh],
  );

  return <SavesContext.Provider value={value}>{children}</SavesContext.Provider>;
}

export function useSaves(): SavesContextValue {
  const ctx = useContext(SavesContext);
  if (!ctx) throw new Error("useSaves must be used inside <SavesProvider>");
  return ctx;
}
