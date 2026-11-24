"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { followTopic, getMyFollowedTopics, unfollowTopic } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

/**
 * The signed-in member's followed topics (F1), shared by every Follow button on the page.
 * One small module-level store: loaded once per member, updated optimistically on follow / unfollow.
 */
type State = { userId: string | null; topics: string[]; status: "idle" | "loading" | "ready" };

let state: State = { userId: null, topics: [], status: "idle" };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  emit();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => state;
const serverSnapshot = (): State => ({ userId: null, topics: [], status: "idle" });

const key = (topic: string) => topic.trim().toLowerCase();

export function useTopicFollows() {
  const { user } = useAuth();
  const userId = user?.user_id ?? null;
  const current = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  useEffect(() => {
    if (!userId) {
      if (state.userId !== null || state.topics.length) set({ userId: null, topics: [], status: "idle" });
      return;
    }
    if (state.userId === userId && state.status !== "idle") return;
    set({ userId, topics: [], status: "loading" });
    getMyFollowedTopics()
      .then((topics) => {
        if (state.userId === userId) set({ topics, status: "ready" });
      })
      .catch(() => {
        if (state.userId === userId) set({ status: "ready" });
      });
  }, [userId]);

  const isFollowing = useCallback((topic: string) => current.topics.some((t) => key(t) === key(topic)), [current.topics]);

  const toggle = useCallback(async (topic: string) => {
    const following = state.topics.some((t) => key(t) === key(topic));
    const previous = state.topics;
    set({ topics: following ? previous.filter((t) => key(t) !== key(topic)) : [topic.trim(), ...previous] });
    try {
      await (following ? unfollowTopic(topic.trim()) : followTopic(topic.trim()));
    } catch (error) {
      set({ topics: previous });
      throw error;
    }
    return !following;
  }, []);

  return { topics: current.topics, ready: current.status === "ready", isFollowing, toggle, signedIn: !!userId };
}
