"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Plus, X } from "lucide-react";
import { AccountMenu } from "@/components/shell/AccountMenu";
import { GlobalSearch } from "@/components/shell/GlobalSearch";
import { useAuth } from "@/context/AuthContext";
import { cx } from "@/lib/format";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/feed", label: "Feed" },
  { href: "/library", label: "Library" },
  { href: "/assistant", label: "Assistant" },
  { href: "/analytics", label: "Analytics" },
] as const;

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

/** One straight line: logo · navigation · search · create · account. Below `lg` the links fold into a menu. */
export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, promptLogin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const create = () => {
    if (!user) {
      promptLogin("login");
      return;
    }
    router.push("/feed?compose=1");
  };

  return (
    <header className="sticky top-0 z-40 bg-brand-900 shadow-[0_1px_0_rgba(210,166,73,0.45),0_8px_24px_-14px_rgba(7,35,26,0.7)]">
      <div className="mx-auto flex h-16 w-full max-w-[1520px] items-center gap-2 px-3 sm:gap-4 sm:px-6">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white lg:hidden"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="Chanakya Research Commons home">
          <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-md bg-saffron-400 font-display text-[21px] font-bold leading-none text-brand-900 shadow-[inset_0_-2px_0_rgba(7,35,26,0.18)]">
            C
          </span>
          <span className="hidden leading-tight xl:block">
            <span className="block font-display text-[18px] text-white">Chanakya</span>
            <span className="block text-[10.5px] font-semibold uppercase tracking-[0.18em] text-saffron-300">Research Commons</span>
          </span>
        </Link>

        <nav aria-label="Primary" className="ml-1 hidden h-full items-stretch lg:flex">
          {NAV.map(({ href, label }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex items-center px-3.5 text-ui font-medium transition-colors duration-150",
                  active ? "text-white" : "text-white/65 hover:text-white",
                )}
              >
                {label}
                <span aria-hidden className={cx("absolute inset-x-3.5 bottom-0 h-[3px] rounded-t-full bg-saffron-400 transition-opacity duration-150", active ? "opacity-100" : "opacity-0")} />
              </Link>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-1 justify-end lg:justify-center">
          <GlobalSearch />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={create}
            className="hidden h-9 items-center gap-1.5 rounded-full border border-white/30 px-4 text-ui font-semibold text-white transition hover:bg-white/10 xl:inline-flex"
            aria-label="Create a post"
          >
            <Plus className="h-4 w-4" /> Create
          </button>
          <AccountMenu />
        </div>
      </div>

      {menuOpen && (
        <nav aria-label="Primary" className="animate-fade border-t border-white/10 bg-brand-800 px-3 pb-3 pt-2 lg:hidden">
          {NAV.map(({ href, label }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex items-center justify-between rounded-lg px-3 py-3 text-body font-medium transition",
                  active ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/5 hover:text-white",
                )}
              >
                {label}
                {active && <span aria-hidden className="h-2 w-2 rounded-full bg-saffron-400" />}
              </Link>
            );
          })}
          <button type="button" onClick={create} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-3 text-left text-body font-medium text-saffron-300 hover:bg-white/5">
            <Plus className="h-4 w-4" /> Create a post
          </button>
        </nav>
      )}
    </header>
  );
}
