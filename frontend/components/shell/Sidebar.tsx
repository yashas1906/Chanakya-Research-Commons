"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, BookOpen, Home, MessageSquareText, Newspaper, Plus, UserRound } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { cx } from "@/lib/format";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/feed", label: "Feed", icon: Newspaper },
  { href: "/library", label: "Library", icon: BookOpen },
  { href: "/assistant", label: "Assistant", icon: MessageSquareText },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
] as const;

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

/** A label that slides out beside an icon on hover/focus, so the rail can stay icon-only. */
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 -translate-x-1 whitespace-nowrap rounded-md bg-ink px-2.5 py-1 text-meta font-medium text-paper opacity-0 shadow-pop transition duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
    >
      {children}
    </span>
  );
}

const itemClass = (active: boolean) =>
  cx(
    "group relative flex h-11 w-11 items-center justify-center rounded-xl transition duration-150",
    active ? "bg-brand-600 text-white shadow-lift" : "text-stone-500 hover:bg-brand-50 hover:text-brand-600",
  );

/** Slim, always-visible icon rail on the left. Labels appear as tooltips. */
export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, promptLogin } = useAuth();
  const profileHref = user ? `/u/${user.user_id}` : null;
  const onProfile = !!user && pathname === `/u/${user.user_id}`;

  const create = () => {
    if (!user) {
      promptLogin("login");
      return;
    }
    router.push("/feed?compose=1");
  };

  return (
    <aside
      aria-label="Primary navigation"
      className="sticky top-0 z-30 flex h-dvh w-[60px] shrink-0 flex-col items-center border-r border-stone-200 bg-paper py-3 sm:w-[72px]"
    >
      <Link href="/" className="group relative mb-4 flex" aria-label="Chanakya Research Commons home">
        <span aria-hidden className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-deep font-display text-[22px] font-bold leading-none text-white">
          C
          <span className="absolute inset-x-2 bottom-1.5 h-[2px] rounded-full bg-saffron-300" />
        </span>
        <Tip>Chanakya Research Commons</Tip>
      </Link>

      <nav aria-label="Primary" className="flex flex-col items-center gap-1.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} aria-label={label} aria-current={active ? "page" : undefined} className={itemClass(active)}>
              <Icon className="h-5 w-5" strokeWidth={1.9} />
              <Tip>{label}</Tip>
            </Link>
          );
        })}
      </nav>

      <div className="my-3 h-px w-8 bg-stone-200" />

      <button type="button" onClick={create} aria-label="Create a post" className="group relative flex h-11 w-11 items-center justify-center rounded-xl border border-dashed border-brand-300 text-brand-600 transition hover:border-brand-600 hover:bg-brand-50">
        <Plus className="h-5 w-5" />
        <Tip>Create a post</Tip>
      </button>

      {profileHref && (
        <Link href={profileHref} aria-label="My profile" aria-current={onProfile ? "page" : undefined} className={cx(itemClass(onProfile), "mt-auto")}>
          <UserRound className="h-5 w-5" strokeWidth={1.9} />
          <Tip>My profile &amp; settings</Tip>
        </Link>
      )}
    </aside>
  );
}
