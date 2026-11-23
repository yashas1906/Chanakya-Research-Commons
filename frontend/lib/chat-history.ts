import type { Citation } from "@/types/crc";

/** One finished question/answer exchange, as stored for the history list. */
export interface SavedTurn {
  id: number;
  question: string;
  libraryOnly: boolean;
  paperId: string | null;
  answer: string;
  citations: Citation[];
  degraded: boolean;
  general: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  turns: SavedTurn[];
}

const MAX_CONVERSATIONS = 60;
const MAX_TURNS = 40;

/** History is kept in this browser, separately for each signed-in member. */
export const historyKey = (userId: string | null | undefined) => `crc.assistant.chats.v1.${userId ?? "guest"}`;

export function loadConversations(key: string): Conversation[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as Conversation[])
      .filter((c) => c && typeof c.id === "string" && Array.isArray(c.turns) && c.turns.length > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveConversations(key: string, conversations: Conversation[]) {
  const trimmed = conversations.slice(0, MAX_CONVERSATIONS);
  try {
    window.localStorage.setItem(key, JSON.stringify(trimmed));
  } catch {
    // Storage full or blocked: keep the newest half and try once more, otherwise give up quietly.
    try {
      window.localStorage.setItem(key, JSON.stringify(trimmed.slice(0, Math.ceil(trimmed.length / 2))));
    } catch {
      /* history simply won't persist */
    }
  }
}

export const newConversationId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function titleFrom(question: string): string {
  const t = question.replace(/\s+/g, " ").trim();
  return t.length > 64 ? `${t.slice(0, 61).trimEnd()}…` : t || "New chat";
}

export function upsertConversation(list: Conversation[], id: string, turns: SavedTurn[]): Conversation[] {
  const kept = turns.slice(-MAX_TURNS);
  const now = Date.now();
  const existing = list.find((c) => c.id === id);
  const next: Conversation = existing
    ? { ...existing, turns: kept, updatedAt: now }
    : { id, title: titleFrom(kept[0]?.question ?? ""), createdAt: now, updatedAt: now, turns: kept };
  return [next, ...list.filter((c) => c.id !== id)];
}

export type HistoryGroup = "Today" | "Yesterday" | "Previous 7 days" | "Older";

export function groupConversations(list: Conversation[], now = new Date()): Array<{ label: HistoryGroup; items: Conversation[] }> {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const buckets: Record<HistoryGroup, Conversation[]> = { Today: [], Yesterday: [], "Previous 7 days": [], Older: [] };
  for (const c of list) {
    if (c.updatedAt >= startOfToday) buckets.Today.push(c);
    else if (c.updatedAt >= startOfToday - day) buckets.Yesterday.push(c);
    else if (c.updatedAt >= startOfToday - 7 * day) buckets["Previous 7 days"].push(c);
    else buckets.Older.push(c);
  }
  return (Object.keys(buckets) as HistoryGroup[]).filter((k) => buckets[k].length > 0).map((label) => ({ label, items: buckets[label] }));
}
