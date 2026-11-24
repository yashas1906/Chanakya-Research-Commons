"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { followUser, getMyFollowedMembers, unfollowUser } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

/**
 * The members the signed-in member follows, shared by every Follow button (posts, threads, search,
 * profiles, suggestions) so they all agree. Loaded once per member, updated optimistically.
 */
type State = { userId: string | null; ids: Set<string>; status: "idle" | "loading" | "ready" };

let state: State = { userId: null, ids: new Set(), status: "idle" };
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => state;
const SERVER: State = { userId: null, ids: new Set(), status: "idle" };
const serverSnapshot = () => SERVER;

/** Record a follow change made elsewhere (e.g. the profile page's own button). */
export function noteMemberFollow(memberId: string, following: boolean) {
  const ids = new Set(state.ids);
  if (following) ids.add(memberId);
  else ids.delete(memberId);
  set({ ids });
}

export function useMemberFollows() {
  const { user } = useAuth();
  const userId = user?.user_id ?? null;
  const current = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  useEffect(() => {
    if (!userId) {
      if (state.userId !== null) set({ userId: null, ids: new Set(), status: "idle" });
      return;
    }
    if (state.userId === userId && state.status !== "idle") return;
    set({ userId, ids: new Set(), status: "loading" });
    getMyFollowedMembers()
      .then((ids) => {
        if (state.userId === userId) set({ ids: new Set(ids), status: "ready" });
      })
      .catch(() => {
        if (state.userId === userId) set({ status: "ready" });
      });
  }, [userId]);

  const isFollowing = useCallback((memberId: string) => current.ids.has(memberId), [current.ids]);

  const toggle = useCallback(async (memberId: string) => {
    const following = state.ids.has(memberId);
    noteMemberFollow(memberId, !following);
    try {
      await (following ? unfollowUser(memberId) : followUser(memberId));
    } catch (error) {
      noteMemberFollow(memberId, following);
      throw error;
    }
    return !following;
  }, []);

  return { isFollowing, toggle, ready: current.status === "ready", count: current.ids.size, myId: userId };
}
