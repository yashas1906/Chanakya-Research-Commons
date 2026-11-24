"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

const MAX_TAGS = 6;
const clean = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Topics as chips. Enter, comma or Tab adds the typed topic; Backspace on an empty box removes the last one.
 * Suggestions come from topics already used on the Commons, so posts share tags instead of near-duplicates.
 */
export function TagInput({ value, onChange, suggestions = [] }: { value: string[]; onChange: (next: string[]) => void; suggestions?: string[] }) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);

  const add = (raw: string) => {
    const tag = clean(raw);
    setDraft("");
    if (!tag || value.includes(tag) || value.length >= MAX_TAGS) return;
    onChange([...value, tag]);
  };

  const matches = useMemo(() => {
    const q = clean(draft);
    const pool = [...new Set(suggestions.map(clean))].filter((t) => t && !value.includes(t));
    return (q ? pool.filter((t) => t.includes(q)) : pool).slice(0, 6);
  }, [draft, suggestions, value]);

  return (
    <div className="relative">
      <div className="input flex min-h-11 flex-wrap items-center gap-1.5 py-1.5">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-2.5 pr-1 text-meta font-medium text-brand-700">
            {tag}
            <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))} className="rounded-full p-0.5 hover:bg-brand-100" aria-label={`Remove topic ${tag}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            const next = e.target.value;
            if (next.endsWith(",")) add(next.slice(0, -1));
            else setDraft(next);
          }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || (e.key === "Tab" && draft.trim())) && draft.trim()) {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (draft.trim()) add(draft);
          }}
          disabled={value.length >= MAX_TAGS}
          placeholder={value.length >= MAX_TAGS ? "Up to 6 topics" : value.length ? "Add another topic" : "Topics, e.g. data mining, graph neural networks"}
          aria-label="Topics"
          className="min-w-[10rem] flex-1 border-0 bg-transparent p-0 text-ui text-ink placeholder:text-stone-400 focus:outline-none"
        />
      </div>
      {focused && matches.length > 0 && value.length < MAX_TAGS && (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-stone-200 bg-paper py-1 shadow-pop" role="listbox" aria-label="Topic suggestions">
          {matches.map((tag) => (
            <li key={tag}>
              {/* onMouseDown so the pick lands before the input's blur closes the list. */}
              <button type="button" onMouseDown={(e) => { e.preventDefault(); add(tag); }} className="w-full px-3 py-1.5 text-left text-meta text-stone-700 hover:bg-stone-100">
                {tag}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
