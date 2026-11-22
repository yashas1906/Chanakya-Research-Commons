"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, MessageSquareText, Newspaper, Search, PlugZap, RefreshCw } from "lucide-react";
import { MemberSwitcher } from "@/components/shell/MemberSwitcher";
import { useMember } from "@/lib/member-context";
import { ApiError } from "@/lib/api";
import { cx } from "@/lib/format";

const NAV = [
  { href: "/", label: "Search", icon: Search },
  { href: "/feed", label: "Feed", icon: Newspaper },
  { href: "/library", label: "Library", icon: BookOpen },
  { href: "/assistant", label: "Assistant", icon: MessageSquareText },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
] as const;

export function Header() {
  const pathname = usePathname();
  const { status, error, retry } = useMember();

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-stone-200/90 bg-canvas/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-6 px-5 lg:px-8">
          <Link href="/" className="group flex shrink-0 items-center gap-3" aria-label="Chanakya Research Commons — home">
            <span
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-md bg-ink font-serif text-[17px] italic leading-none text-canvas"
            >
              C
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="block font-serif text-[17px] tracking-tight text-ink">Chanakya Research Commons</span>
              <span className="block text-[10.5px] font-medium uppercase tracking-eyebrow text-stone-500">
                Chanakya University
              </span>
            </span>
          </Link>

          <nav aria-label="Primary" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "relative flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-[13.5px] font-medium transition-colors duration-150",
                    active ? "text-ink" : "text-stone-500 hover:text-stone-900",
                  )}
                >
                  <Icon className="h-[15px] w-[15px]" strokeWidth={1.75} />
                  <span className="hidden md:inline">{label}</span>
                  <span
                    aria-hidden
                    className={cx(
                      "absolute inset-x-3 -bottom-[13px] h-0.5 origin-center rounded-full bg-ink transition-transform duration-200",
                      active ? "scale-x-100" : "scale-x-0",
                    )}
                  />
                </Link>
              );
            })}
          </nav>

          <MemberSwitcher />
        </div>
      </header>

      {status === "error" && (
        <div role="alert" className="border-b border-terracotta-200 bg-terracotta-50">
          <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-5 py-2 text-[12.5px] text-terracotta-700 lg:px-8">
            <PlugZap className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">
              {error instanceof ApiError ? error.message : "Could not load members."}
            </span>
            <button type="button" onClick={retry} className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </div>
        </div>
      )}
    </>
  );
}
