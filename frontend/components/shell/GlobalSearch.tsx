"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Clock, CornerDownLeft, Search, TrendingUp, X } from "lucide-react";
import { cx } from "@/lib/format";

const RECENT_KEY = "crc.recent-searches";
const SUGGESTIONS = ["graph neural networks", "federated learning", "protein structure prediction", "contract law and AI", "CRISPR gene editing"];

interface Scope {
  label: string;
  placeholder: string;
}

/** On Library and Feed the one search bar filters that page live; on every other page it searches everything. */
function scopeFor(pathname: string): Scope | null {
  if (pathname.startsWith("/library")) return { label: "Library", placeholder: "Search the library" };
  if (pathname === "/feed") return { label: "Feed", placeholder: "Search discussions" };
  return null;
}

function readRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

function writeRecent(items: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, 5)));
  } catch {
    /* storage unavailable */
  }
}

export function GlobalSearch({ autoFocus = false }: { autoFocus?: boolean } = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  const scope = scopeFor(pathname);
  const scoped = !!scope && !dismissed;

  // Keep the box in step with ?q= when the route changes, and restore the scope chip.
  useEffect(() => {
    setQuery(new URLSearchParams(window.location.search).get("q") ?? "");
    setDismissed(false);
    setOpen(false);
  }, [pathname]);

  useEffect(() => setRecent(readRecent()), [open]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const applyScoped = useCallback((value: string) => {
    const params = new URLSearchParams(window.location.search);
    if (value.trim()) params.set("q", value.trim());
    else params.delete("q");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router]);

  const goGlobal = useCallback((value: string) => {
    const term = value.trim();
    if (!term) return;
    writeRecent([term, ...readRecent().filter((item) => item.toLowerCase() !== term.toLowerCase())]);
    setOpen(false);
    inputRef.current?.blur();
    router.push(`/search?q=${encodeURIComponent(term)}`);
  }, [router]);

  // "/" focuses the bar from anywhere; Esc closes it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
        return;
      }
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onChange = (value: string) => {
    setQuery(value);
    if (!scoped) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => applyScoped(value), 220);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (scoped) {
      window.clearTimeout(timer.current);
      applyScoped(query);
      setOpen(false);
      inputRef.current?.blur();
    } else {
      goGlobal(query);
    }
  };

  const trimmed = query.trim();

  return (
    <div ref={rootRef} className="relative w-full max-w-[640px]">
      <form
        role="search"
        onSubmit={submit}
        className={cx(
          "flex h-10 items-center gap-2 rounded-lg border px-3.5 transition duration-150",
          open ? "border-brand-500 bg-paper ring-4 ring-brand-100" : "border-stone-200 bg-stone-100 hover:border-stone-300 hover:bg-paper",
        )}
      >
        <Search aria-hidden className="h-4 w-4 shrink-0 text-stone-500" />
        {scoped && scope && (
          <button
            type="button"
            onClick={() => {
              setDismissed(true);
              inputRef.current?.focus();
            }}
            title="Search everywhere instead"
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-2.5 pr-1.5 text-label font-semibold text-brand-700 transition hover:bg-brand-100"
          >
            In {scope.label}
            <X className="h-3 w-3" aria-hidden />
            <span className="sr-only">Search everywhere instead</span>
          </button>
        )}
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          type="search"
          value={query}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.shiftKey && scoped) {
              event.preventDefault();
              goGlobal(query);
            }
          }}
          placeholder={scoped && scope ? scope.placeholder : "Search papers, people and discussions"}
          aria-label="Search"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-ui text-ink placeholder:text-stone-500 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            className="rounded-full p-1 text-stone-500 hover:bg-stone-200 hover:text-ink"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <kbd className="hidden rounded border border-stone-300 bg-paper px-1.5 py-0.5 text-label font-medium text-stone-500 sm:block">/</kbd>
        )}
      </form>

      {open && (
        <div
          onMouseDown={(event) => event.preventDefault()}
          className="absolute inset-x-0 top-full z-50 mt-2 animate-pop overflow-hidden rounded-2xl border border-stone-200 bg-paper p-2 shadow-pop"
        >
          {trimmed ? (
            <button type="button" onClick={() => goGlobal(trimmed)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-stone-100">
              <Search className="h-4 w-4 shrink-0 text-brand-600" />
              <span className="min-w-0 flex-1 truncate text-ui text-ink">
                Search everywhere for <span className="font-semibold">“{trimmed}”</span>
              </span>
              <span className="hidden items-center gap-1 text-label text-stone-500 sm:inline-flex">
                {scoped ? "Shift" : ""} <CornerDownLeft className="h-3 w-3" />
              </span>
            </button>
          ) : (
            <>
              {recent.length > 0 && (
                <div className="mb-1">
                  <div className="flex items-center justify-between px-3 pb-1 pt-1.5">
                    <p className="text-label font-semibold uppercase tracking-wider text-stone-500">Recent</p>
                    <button
                      type="button"
                      onClick={() => {
                        writeRecent([]);
                        setRecent([]);
                      }}
                      className="text-label font-semibold text-brand-600 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                  {recent.map((item) => (
                    <button key={item} type="button" onClick={() => goGlobal(item)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-stone-100">
                      <Clock className="h-4 w-4 shrink-0 text-stone-400" />
                      <span className="truncate text-ui text-ink">{item}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="px-3 pb-1 pt-1.5 text-label font-semibold uppercase tracking-wider text-stone-500">Explore</p>
              {SUGGESTIONS.map((item) => (
                <button key={item} type="button" onClick={() => goGlobal(item)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-stone-100">
                  <TrendingUp className="h-4 w-4 shrink-0 text-stone-400" />
                  <span className="truncate text-ui text-ink">{item}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
