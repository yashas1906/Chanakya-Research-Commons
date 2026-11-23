"use client";

import { useMemo, useState } from "react";
import { MessageSquare, Plus, Search, Trash2, X } from "lucide-react";
import { groupConversations, type Conversation } from "@/lib/chat-history";
import { cx } from "@/lib/format";

/** The list of earlier chats, grouped by day. Used both as the desktop side panel and the mobile drawer. */
export function ChatHistory({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onClear,
  onClose,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  /** Present in the drawer only. */
  onClose?: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(needle) || c.turns.some((t) => t.question.toLowerCase().includes(needle)));
  }, [conversations, filter]);
  const groups = useMemo(() => groupConversations(visible), [visible]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <h2 className="font-display text-[17px] text-ink">Chat history</h2>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onNew} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-600 px-3 text-meta font-semibold text-white transition hover:bg-brand-700">
            <Plus className="h-3.5 w-3.5" /> New
          </button>
          {onClose && (
            <button type="button" onClick={onClose} className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Close history">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {conversations.length > 5 && (
        <label className="mx-4 mb-2 flex h-9 items-center gap-2 rounded-full border border-stone-200 bg-sunken px-3 text-stone-500 focus-within:border-brand-500 focus-within:bg-paper">
          <Search className="h-3.5 w-3.5 shrink-0" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search chats" aria-label="Search chats" className="min-w-0 flex-1 bg-transparent text-meta text-ink placeholder:text-stone-400 focus:outline-none" />
        </label>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <MessageSquare className="mx-auto h-6 w-6 text-stone-300" />
            <p className="mt-2 text-meta font-medium text-stone-600">No chats yet</p>
            <p className="mt-1 text-label leading-relaxed text-stone-500">Your conversations are saved here, in this browser, so you can come back to them.</p>
          </div>
        ) : groups.length === 0 ? (
          <p className="px-4 py-8 text-center text-meta text-stone-500">No chats match “{filter}”.</p>
        ) : (
          groups.map((group) => (
            <section key={group.label} className="mt-2 first:mt-0" aria-label={group.label}>
              <h3 className="px-2.5 pb-1 pt-2 text-label font-semibold uppercase tracking-[0.12em] text-stone-400">{group.label}</h3>
              <ul className="space-y-0.5">
                {group.items.map((c) => {
                  const active = c.id === activeId;
                  return (
                    <li key={c.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => onSelect(c.id)}
                        aria-current={active ? "true" : undefined}
                        className={cx(
                          "flex w-full flex-col rounded-lg py-2 pl-3 pr-9 text-left transition duration-150",
                          active ? "bg-brand-50 text-brand-800" : "text-stone-700 hover:bg-stone-100",
                        )}
                      >
                        <span className={cx("truncate text-meta", active ? "font-semibold" : "font-medium")}>{c.title}</span>
                        <span className="num text-label text-stone-400">{c.turns.length} {c.turns.length === 1 ? "question" : "questions"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(c.id)}
                        aria-label={`Delete chat: ${c.title}`}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-stone-400 opacity-100 transition hover:bg-terracotta-50 hover:text-terracotta-600 focus-visible:opacity-100 xl:opacity-0 xl:group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      {conversations.length > 0 && (
        <div className="border-t border-stone-100 px-4 py-2.5">
          {confirmClear ? (
            <div className="flex items-center justify-between gap-2 text-meta">
              <span className="text-stone-600">Delete all chats?</span>
              <span className="flex gap-1.5">
                <button type="button" onClick={() => setConfirmClear(false)} className="rounded-full px-2.5 py-1 font-semibold text-stone-600 hover:bg-stone-100">Cancel</button>
                <button type="button" onClick={() => { onClear(); setConfirmClear(false); }} className="rounded-full bg-terracotta-600 px-2.5 py-1 font-semibold text-white hover:bg-terracotta-700">Delete</button>
              </span>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmClear(true)} className="text-meta font-medium text-stone-500 hover:text-terracotta-600">Clear all history</button>
          )}
        </div>
      )}
    </div>
  );
}
