"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, Home, MessageSquareText, Newspaper, UserRound, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { SIDEBAR_SLOT_ID, useShell } from "@/components/shell/SidebarSlot";
import { cx } from "@/lib/format";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/feed", label: "Feed", icon: Newspaper },
  { href: "/library", label: "Library", icon: BookOpen },
  { href: "/assistant", label: "RAG Assistant", icon: MessageSquareText },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { sidebarOpen, closeSidebar } = useShell();
  const profileHref = user ? `/u/${user.user_id}` : null;

  const item = (href: string, label: string, Icon: typeof Home, active: boolean) => (
    <Link
      key={href + label}
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={closeSidebar}
      className={cx(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-ui font-medium transition duration-150",
        active ? "bg-brand-50 text-brand-700" : "text-stone-700 hover:bg-stone-100 hover:text-ink",
      )}
    >
      <span aria-hidden className={cx("absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-brand-600 transition-opacity", active ? "opacity-100" : "opacity-0")} />
      <Icon className={cx("h-[18px] w-[18px] shrink-0 transition-transform duration-150 group-hover:scale-110", active ? "text-brand-600" : "text-stone-500")} strokeWidth={1.9} />
      {label}
    </Link>
  );

  return (
    <>
      {sidebarOpen && <div aria-hidden className="fixed inset-0 z-40 animate-fade bg-slate-900/40 xl:hidden" onClick={closeSidebar} />}
      <aside
        aria-label="Sidebar"
        className={cx(
          "fixed inset-y-0 left-0 z-50 flex w-[290px] -translate-x-full flex-col overflow-y-auto border-r border-stone-200 bg-paper transition-transform duration-200 ease-out",
          "xl:sticky xl:top-14 xl:z-10 xl:h-[calc(100dvh-3.5rem)] xl:w-[256px] xl:shrink-0 xl:translate-x-0 xl:self-start",
          sidebarOpen && "translate-x-0 shadow-pop xl:shadow-none",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-stone-100 px-4 xl:hidden">
          <span className="font-display text-[16px] text-ink">Menu</span>
          <button type="button" onClick={closeSidebar} className="rounded-full p-2 text-stone-500 hover:bg-stone-100" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="Primary" className="space-y-0.5 p-3">
          {NAV.map(({ href, label, icon }) => item(href, label, icon, href === "/" ? pathname === "/" : pathname.startsWith(href)))}
          {profileHref && item(profileHref, "My profile", UserRound, pathname.startsWith("/u/") && pathname.endsWith(user?.user_id ?? "—"))}
        </nav>

        {/* Pages (Feed, Library …) render their filters here via <SidebarPortal>. */}
        <div id={SIDEBAR_SLOT_ID} className="border-t border-stone-100 empty:hidden" />

        <p className="mt-auto px-5 pb-5 pt-6 text-label leading-relaxed text-stone-400">
          Chanakya Research Commons
          <br />
          Chanakya University, Bangalore
        </p>
      </aside>
    </>
  );
}
