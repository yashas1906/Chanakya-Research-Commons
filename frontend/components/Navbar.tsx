"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, Home, Menu, MessageSquareText, Newspaper, PlugZap, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { AccountMenu } from "@/components/shell/AccountMenu";
import { GlobalSearch } from "@/components/shell/GlobalSearch";
import { ApiError, getMembers } from "@/lib/api";
import { cx } from "@/lib/format";
import { useAsync } from "@/lib/hooks";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/feed", label: "Feed", icon: Newspaper },
  { href: "/library", label: "Library", icon: BookOpen },
  { href: "/assistant", label: "RAG Assistant", icon: MessageSquareText },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const [mobileMenu, setMobileMenu] = useState(false);
  const health = useAsync((signal) => getMembers(1, signal), []);
  const nav = (
    <nav aria-label="Primary" className="flex flex-col gap-1 xl:flex-row xl:items-center xl:gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            onClick={() => setMobileMenu(false)}
            className={cx("relative flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-ui font-medium transition-colors hover:bg-sunken xl:h-16 xl:rounded-none", active ? "text-ink" : "text-stone-600 hover:text-ink")}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.7} />
            <span>{label}</span>
            <span aria-hidden className={cx("absolute inset-x-3 bottom-0 hidden h-0.5 rounded-full bg-ink xl:block", active ? "scale-x-100" : "scale-x-0")} />
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-canvas/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Chanakya Research Commons home">
            <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink font-serif text-lg italic text-canvas">C</span>
            <span className="hidden leading-tight lg:block">
              <span className="block whitespace-nowrap font-serif text-[16px] tracking-tight text-ink">Chanakya Research Commons</span>
              <span className="block text-label font-medium tracking-eyebrow text-stone-500">Chanakya University</span>
            </span>
          </Link>
          <div className="hidden min-w-0 flex-1 xl:block">{nav}</div>
          <GlobalSearch />
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button type="button" className="rounded-full p-2 text-stone-600 hover:bg-sunken xl:hidden" onClick={() => setMobileMenu((v) => !v)} aria-label={mobileMenu ? "Close navigation" : "Open navigation"} aria-expanded={mobileMenu}>
              {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <AccountMenu />
          </div>
        </div>
        {mobileMenu && <div className="border-t border-stone-200 px-4 py-2 xl:hidden">{nav}</div>}
      </header>
      {health.error && (
        <div role="alert" className="border-b border-terracotta-200 bg-terracotta-50">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-meta text-terracotta-700 sm:px-6 lg:px-8">
            <PlugZap className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">{health.error instanceof ApiError ? health.error.message : "The CRC API is unavailable."}</span>
            <button type="button" onClick={health.reload} className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"><RefreshCw className="h-3.5 w-3.5" />Retry</button>
          </div>
        </div>
      )}
    </>
  );
}
