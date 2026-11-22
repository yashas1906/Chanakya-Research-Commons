"use client";

import { useEffect, useRef } from "react";
import { CornerDownLeft, Loader2, Search, X } from "lucide-react";

/**
 * Centered, distraction-free search field. Press "/" anywhere to focus it
 * (ignored while typing in another field).
 */
export function SearchBar({
  value,
  onChange,
  onSubmit,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  loading?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (typing) return;
      e.preventDefault();
      ref.current?.focus();
      ref.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tooShort = value.trim().length > 0 && value.trim().length < 2;

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim().length >= 2) onSubmit(value.trim());
      }}
      className="mx-auto w-full max-w-3xl"
    >
      <div className="group flex items-center gap-3 rounded-2xl border border-stone-200/90 bg-paper px-5 py-3.5 transition-colors duration-150 focus-within:border-stone-400 hover:border-stone-300">
        {loading ? (
          <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin text-stone-400" />
        ) : (
          <Search className="h-[18px] w-[18px] shrink-0 text-stone-400" strokeWidth={1.75} />
        )}
        <input
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search papers, scholars and discussions across Chanakya…"
          aria-label="Search the research commons"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[17px] text-ink placeholder:text-stone-400 focus:outline-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              ref.current?.focus();
            }}
            aria-label="Clear search"
            className="rounded-md p-1 text-stone-400 transition-colors hover:bg-sunken hover:text-stone-700"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {value.trim().length >= 2 ? (
          <button type="submit" className="btn-primary shrink-0 py-1.5" aria-label="Search">
            Search <CornerDownLeft className="h-3 w-3 opacity-70" />
          </button>
        ) : (
          <kbd className="hidden shrink-0 rounded-md border border-stone-200 bg-sunken px-1.5 py-0.5 font-sans text-meta font-medium text-stone-500 sm:block">
            /
          </kbd>
        )}
      </div>
      {tooShort && <p className="mt-2 text-center text-meta text-stone-500">Type at least two characters to search.</p>}
    </form>
  );
}
