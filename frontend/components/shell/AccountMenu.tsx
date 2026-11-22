"use client";

import { useState } from "react";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { LoginModal } from "@/components/auth/LoginModal";
import { Avatar } from "@/components/ui/Section";
import { RoleBadge } from "@/components/ui/RoleBadge";

export function AccountMenu() {
  const { user, promptLogin, logout } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      {!user ? (
        <button type="button" onClick={promptLogin} className="btn-primary h-10 px-4">Sign in</button>
      ) : (
        <>
          <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-full p-1.5 pr-2.5 hover:bg-sunken" aria-expanded={open} aria-label="Account menu">
            <Avatar name={user.full_name} size={32} />
            <span className="hidden max-w-32 text-left sm:block">
              <span className="block truncate text-ui font-medium leading-5 text-ink">{user.full_name}</span>
              <RoleBadge role={user.role} />
            </span>
            <ChevronDown className="hidden h-4 w-4 text-stone-500 sm:block" />
          </button>
          {open && (
            <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-stone-200 bg-paper p-2 shadow-lg">
              <div className="px-3 py-2">
                <p className="text-ui font-medium text-ink">{user.full_name}</p>
                <p className="mt-0.5 text-meta text-stone-500">{user.department}</p>
              </div>
              <button type="button" onClick={() => { setOpen(false); promptLogin(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-ui text-stone-700 hover:bg-sunken">
                <UserRound className="h-4 w-4" /> Switch account
              </button>
              <button type="button" onClick={() => { setOpen(false); logout(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-ui text-stone-700 hover:bg-sunken">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          )}
        </>
      )}
      <LoginModal />
    </div>
  );
}
