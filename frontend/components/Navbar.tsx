"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  BookOpen,
  Home,
  MessageSquareText,
  Newspaper,
  Plus,
  Search,
  X,
} from "lucide-react";
import { AccountMenu } from "@/components/shell/AccountMenu";
import { GlobalSearch } from "@/components/shell/GlobalSearch";
import { useAuth } from "@/context/AuthContext";
import { cx } from "@/lib/format";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/feed", label: "Feed", icon: Newspaper },
  { href: "/library", label: "Library", icon: BookOpen },
  { href: "/assistant", label: "Assistant", icon: MessageSquareText },
] as const;

// Analytics is part of the admin dashboard, so only admins get this icon.
const ADMIN_NAV = {
  href: "/admin?section=analytics",
  label: "Analytics",
  icon: BarChart3,
} as const;

const isActive = (pathname: string, href: string) => {
  const path = href.split("?")[0];
  return path === "/" ? pathname === "/" : pathname.startsWith(path);
};

/** Label that appears under an icon on hover/keyboard focus, so the bar can stay icon-only. */
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 -translate-y-1 whitespace-nowrap rounded-md bg-ink px-2.5 py-1 text-label font-medium text-paper opacity-0 shadow-pop transition duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
    >
      {children}
    </span>
  );
}

const iconButton = (active: boolean) =>
  cx(
    "group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition duration-150 sm:h-10 sm:w-10",
    active
      ? "bg-brand-600 text-white shadow-lift"
      : "text-stone-500 hover:bg-brand-50 hover:text-brand-600",
  );

/** One slim row: logo · icon navigation · search icon · create · account. Search opens a panel below. */
export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, promptLogin } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => setSearchOpen(false), [pathname]);

  // "/" opens search from anywhere; Esc or a click outside the header closes it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSearchOpen(false);
        return;
      }
      if (
        event.key !== "/" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return;
      event.preventDefault();
      setSearchOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!headerRef.current?.contains(event.target as Node))
        setSearchOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [searchOpen]);

  const create = () => {
    if (!user) {
      promptLogin("login");
      return;
    }
    router.push("/feed?compose=1");
  };

  return (
    <>
      <header
        ref={headerRef}
        className="sticky top-0 z-40 border-b border-stone-200 bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85"
      >
        {/* Three columns: logo | centred icon group | account. Equal side columns keep the icons truly centred. */}
        <div className="mx-auto grid h-16 w-full max-w-[1520px] grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 sm:gap-4 sm:px-6">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-3 justify-self-start"
            aria-label="Chanakya Research Commons home"
          >
            <span
              aria-hidden
              className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-deep font-display text-[22px] font-bold leading-none text-white"
            >
              C
              <span className="absolute inset-x-2 bottom-1.5 h-[2px] rounded-full bg-saffron-300" />
            </span>
            <span className="hidden leading-none lg:block">
              <span className="block font-display text-[18px] text-ink">
                Chanakya
              </span>
              <span className="mt-1 block text-[12px] font-medium tracking-wide text-stone-500">
                Research Commons
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-0.5 sm:gap-1.5">
            <nav
              aria-label="Primary"
              className="flex items-center gap-0.5 sm:gap-1.5"
            >
              {[...NAV, ...(user?.role === "admin" ? [ADMIN_NAV] : [])].map(
                ({ href, label, icon: Icon }) => {
                  const active = isActive(pathname, href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-label={label}
                      aria-current={active ? "page" : undefined}
                      className={iconButton(active)}
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.9} />
                      <Tip>{label}</Tip>
                    </Link>
                  );
                },
              )}
            </nav>
            <span
              aria-hidden
              className="mx-1 hidden h-6 w-px bg-stone-200 sm:block"
            />
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label={searchOpen ? "Close search" : "Search"}
              aria-expanded={searchOpen}
              className={iconButton(searchOpen)}
            >
              {searchOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Search className="h-5 w-5" />
              )}
              <Tip>{searchOpen ? "Close search" : "Search  /"}</Tip>
            </button>
            <button
              type="button"
              onClick={create}
              aria-label="Create a post"
              className={iconButton(false)}
            >
              <Plus className="h-5 w-5" />
              <Tip>Create a post</Tip>
            </button>
          </div>

          <div className="flex items-center justify-self-end">
            <AccountMenu />
          </div>
        </div>

        {searchOpen && (
          <div className="animate-fade border-t border-stone-100 bg-paper px-3 py-3 sm:px-6">
            <div className="mx-auto flex max-w-[720px] justify-center">
              <GlobalSearch autoFocus />
            </div>
          </div>
        )}
      </header>
    </>
  );
}
