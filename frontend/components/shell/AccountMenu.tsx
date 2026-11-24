"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BookMarked, ChevronDown, LogOut, ShieldCheck, UserRound, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Section";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { cx } from "@/lib/format";

export function AccountMenu() {
  const { user, status, promptLogin, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
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

  if (!user) {
    return (
      <div className={cx("flex shrink-0 items-center gap-2", status === "loading" && "opacity-0")}>
        <button type="button" onClick={() => promptLogin("login")} className="inline-flex h-9 items-center justify-center rounded-full border border-white/30 px-4 text-ui font-semibold text-white transition hover:bg-white/10">Log in</button>
        <button type="button" onClick={() => promptLogin("register")} className="hidden h-9 items-center justify-center rounded-full bg-saffron-400 px-4 text-ui font-semibold text-ink shadow-sm transition hover:bg-saffron-300 active:scale-[0.98] sm:inline-flex">Sign up</button>
      </div>
    );
  }

  const row = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-ui text-stone-700 transition hover:bg-stone-100 hover:text-ink";

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cx("flex items-center gap-2 rounded-full border border-transparent p-1 pr-1 transition hover:bg-white/10 xl:pr-2.5", open && "border-white/20 bg-white/10")}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
      >
        <Avatar name={user.full_name} size={32} />
        <span className="hidden max-w-36 text-left xl:block">
          <span className="block truncate text-meta font-semibold leading-4 text-white">{user.full_name}</span>
          <span className="block text-label capitalize leading-4 text-white/60">{user.role}</span>
        </span>
        <ChevronDown className={cx("hidden h-4 w-4 text-white/60 transition-transform xl:block", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-72 animate-pop rounded-2xl border border-stone-200 bg-paper p-2 shadow-pop">
          <div className="flex items-center gap-3 rounded-xl bg-stone-50 p-3">
            <Avatar name={user.full_name} size={44} />
            <div className="min-w-0">
              <p className="truncate font-display text-ui text-ink">{user.full_name}</p>
              <p className="truncate text-label text-stone-500">{user.department}</p>
              <div className="mt-1"><RoleBadge role={user.role} /></div>
            </div>
          </div>
          <div className="mt-2 space-y-0.5">
            {user.role === "admin" && (
              <Link href="/admin" role="menuitem" onClick={() => setOpen(false)} className={cx(row, "font-semibold text-brand-900 bg-saffron-100/60 hover:bg-saffron-200/60")}>
                <ShieldCheck className="h-4 w-4 text-brand-900" /> Admin dashboard
              </Link>
            )}
            <Link href={`/u/${user.user_id}`} role="menuitem" onClick={() => setOpen(false)} className={row}><UserRound className="h-4 w-4" /> View profile</Link>
            <Link href="/library?tab=saves" role="menuitem" onClick={() => setOpen(false)} className={row}><BookMarked className="h-4 w-4" /> Saved papers</Link>
            <button type="button" role="menuitem" onClick={() => { setOpen(false); promptLogin("login"); }} className={row}><Users className="h-4 w-4" /> Switch account</button>
            <div className="my-1 border-t border-stone-100" />
            <button type="button" role="menuitem" onClick={() => { setOpen(false); logout(); }} className={row}><LogOut className="h-4 w-4" /> Log out</button>
          </div>
        </div>
      )}
    </div>
  );
}
