"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { DOMAINS, MAX_POST_DOMAINS } from "@/lib/domains";
import { cx } from "@/lib/format";

/**
 * Pick one to three research domains for a post from a fixed dropdown list.
 * The list is the same for everyone, so the feed's Domains filter never fills with one-off tags.
 */
export function DomainSelect({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const full = value.length >= MAX_POST_DOMAINS;

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  useEffect(() => {
    if (!open) setFilter("");
  }, [open]);

  const options = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return DOMAINS.filter((d) => !q || d.toLowerCase().includes(q));
  }, [filter]);

  const toggle = (domain: string) => {
    if (value.includes(domain)) onChange(value.filter((d) => d !== domain));
    else if (!full) onChange([...value, domain]);
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="input flex min-h-11 w-full flex-wrap items-center gap-1.5 py-1.5">
        {value.map((domain) => (
          <span key={domain} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-2.5 pr-1 text-meta font-medium text-brand-700">
            {domain}
            <button type="button" onClick={() => toggle(domain)} className="rounded-full p-0.5 hover:bg-brand-100" aria-label={`Remove domain ${domain}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex min-w-[10rem] flex-1 items-center justify-between gap-2 text-left text-ui text-stone-400 hover:text-stone-600"
        >
          {value.length === 0 ? `Choose a research domain (up to ${MAX_POST_DOMAINS})` : full ? "Change domains" : "Add another domain"}
          <ChevronDown className={cx("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-stone-200 bg-paper shadow-pop animate-fade">
          <div className="flex items-center gap-2 border-b border-stone-100 px-3">
            <Search className="h-4 w-4 shrink-0 text-stone-400" />
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter domains…"
              aria-label="Filter domains"
              className="h-10 min-w-0 flex-1 border-0 bg-transparent text-ui text-ink placeholder:text-stone-400 focus:outline-none"
            />
            <span className="num shrink-0 text-label text-stone-500">{value.length}/{MAX_POST_DOMAINS}</span>
          </div>
          <ul role="listbox" aria-multiselectable="true" aria-label="Research domains" className="crc-scroll max-h-64 overflow-y-auto py-1">
            {options.map((domain) => {
              const selected = value.includes(domain);
              const disabled = !selected && full;
              return (
                <li key={domain} role="option" aria-selected={selected} aria-disabled={disabled}>
                  <button
                    type="button"
                    onClick={() => toggle(domain)}
                    disabled={disabled}
                    className={cx(
                      "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-meta transition",
                      selected ? "font-semibold text-brand-700" : "text-stone-700",
                      disabled ? "cursor-not-allowed opacity-40" : "hover:bg-stone-100",
                    )}
                  >
                    <span className={cx("flex h-4 w-4 shrink-0 items-center justify-center rounded border", selected ? "border-brand-600 bg-brand-600 text-white" : "border-stone-300 bg-paper")}>
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                    {domain}
                  </button>
                </li>
              );
            })}
            {options.length === 0 && <li className="px-3 py-3 text-meta text-stone-500">No domain matches “{filter.trim()}”.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
