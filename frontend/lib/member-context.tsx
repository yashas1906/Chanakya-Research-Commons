"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getMembers } from "@/lib/api";
import type { Member } from "@/types/crc";

interface MemberContextValue {
  members: Member[];
  current: Member | null;
  setCurrentId: (id: string) => void;
  status: "loading" | "ready" | "error";
  error: unknown;
  retry: () => void;
}

const MemberContext = createContext<MemberContextValue | null>(null);
const STORAGE_KEY = "crc.acting-member";

/**
 * The backend has no auth yet; like the prototype, the UI "acts as" a chosen member
 * so saves, posts, feed ranking and recommendations have an identity.
 */
export function MemberProvider({ children }: { children: React.ReactNode }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [currentId, setId] = useState<string | null>(null);
  const [status, setStatus] = useState<MemberContextValue["status"]>("loading");
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setStatus("loading");
    getMembers(60, ctrl.signal)
      .then((list) => {
        setMembers(list);
        let stored: string | null = null;
        try {
          stored = window.localStorage.getItem(STORAGE_KEY);
        } catch {
          /* storage unavailable */
        }
        setId(list.find((m) => m.user_id === stored)?.user_id ?? list[0]?.user_id ?? null);
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e);
        setStatus("error");
      });
    return () => ctrl.abort();
  }, [tick]);

  const setCurrentId = useCallback((id: string) => {
    setId(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<MemberContextValue>(
    () => ({
      members,
      current: members.find((m) => m.user_id === currentId) ?? null,
      setCurrentId,
      status,
      error,
      retry: () => setTick((t) => t + 1),
    }),
    [members, currentId, setCurrentId, status, error],
  );

  return <MemberContext.Provider value={value}>{children}</MemberContext.Provider>;
}

export function useMember(): MemberContextValue {
  const ctx = useContext(MemberContext);
  if (!ctx) throw new Error("useMember must be used inside <MemberProvider>");
  return ctx;
}
