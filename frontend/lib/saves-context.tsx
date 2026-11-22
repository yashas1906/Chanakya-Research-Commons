"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSaves, savePaper } from "@/lib/api";
import { useMember } from "@/lib/member-context";
import type { SavedPaper } from "@/types/crc";

interface SavesContextValue {
  saves: SavedPaper[];
  savedIds: ReadonlySet<string>;
  status: "idle" | "loading" | "ready" | "error";
  error: unknown;
  /** Saves a paper for the acting member, then refreshes the shelf. Throws on failure. */
  save: (paperId: string, notes?: string) => Promise<void>;
  refresh: () => void;
}

const SavesContext = createContext<SavesContextValue | null>(null);

/** One shelf of "papers the acting member saved", shared by Search, Library and the drawers. */
export function SavesProvider({ children }: { children: React.ReactNode }) {
  const { current } = useMember();
  const [saves, setSaves] = useState<SavedPaper[]>([]);
  const [status, setStatus] = useState<SavesContextValue["status"]>("idle");
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const userId = current?.user_id ?? null;

  useEffect(() => {
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
  }, [userId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const save = useCallback(
    async (paperId: string, notes = "") => {
      if (!userId) throw new Error("Choose a member to save as first.");
      await savePaper(userId, paperId, notes);
      setTick((t) => t + 1);
    },
    [userId],
  );

  const value = useMemo<SavesContextValue>(
    () => ({ saves, savedIds: new Set(saves.map((s) => s.paper_id)), status, error, save, refresh }),
    [saves, status, error, save, refresh],
  );

  return <SavesContext.Provider value={value}>{children}</SavesContext.Provider>;
}

export function useSaves(): SavesContextValue {
  const ctx = useContext(SavesContext);
  if (!ctx) throw new Error("useSaves must be used inside <SavesProvider>");
  return ctx;
}
