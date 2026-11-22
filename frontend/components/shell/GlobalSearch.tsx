"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { cx } from "@/lib/format";

export function GlobalSearch() {
  const pathname = usePathname();
  const router = useRouter();
  const desktopRef = useRef<HTMLInputElement>(null);
  const mobileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const readQuery = () => setQuery(new URLSearchParams(window.location.search).get("q") ?? "");
    readQuery();
    window.addEventListener("popstate", readQuery);
    return () => window.removeEventListener("popstate", readQuery);
  }, [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        desktopRef.current?.blur();
        mobileRef.current?.blur();
        setMobileOpen(false);
        return;
      }
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault();
      setMobileOpen(true);
      window.setTimeout(() => {
        const mobile = window.matchMedia("(max-width: 767px)").matches;
        (mobile ? mobileRef.current : desktopRef.current)?.focus();
      }, 0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    router.push(`/search?q=${encodeURIComponent(value)}`);
    setMobileOpen(false);
  };

  return (
    <div className="min-w-0 md:flex-1">
      <form role="search" onSubmit={submit} className="relative hidden w-full max-w-[430px] md:block">
        <Search aria-hidden className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <input
          ref={desktopRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search papers, people, discussions…"
          aria-label="Search papers, people and discussions"
          className="input h-10 pl-9 pr-9"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-stone-200 bg-canvas px-1.5 py-0.5 text-label text-stone-500">/</kbd>
      </form>
      <button
        type="button"
        onClick={() => setMobileOpen((open) => !open)}
        className="rounded-full p-2 text-stone-600 hover:bg-sunken md:hidden"
        aria-label={mobileOpen ? "Close search" : "Open search"}
        aria-expanded={mobileOpen}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
      </button>
      <form role="search" onSubmit={submit} className={cx("px-4 pb-3 md:hidden", !mobileOpen && "hidden")}>
        <input
          ref={mobileRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search papers, people, discussions…"
          aria-label="Search papers, people and discussions"
          className="input h-11"
        />
      </form>
    </div>
  );
}
