"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, Plus } from "lucide-react";
import { AccountMenu } from "@/components/shell/AccountMenu";
import { GlobalSearch } from "@/components/shell/GlobalSearch";
import { useShell } from "@/components/shell/SidebarSlot";
import { useAuth } from "@/context/AuthContext";

/** One straight line: menu · logo · search · actions · account. Navigation lives in the left sidebar. */
export function Navbar() {
  const router = useRouter();
  const { user, promptLogin } = useAuth();
  const { openSidebar } = useShell();

  const create = () => {
    if (!user) {
      promptLogin("login");
      return;
    }
    router.push("/feed?compose=1");
  };

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-stone-200 bg-paper">
      <div className="flex h-full items-center gap-2 px-3 sm:gap-3 sm:px-5">
        <button type="button" onClick={openSidebar} className="rounded-full p-2 text-stone-600 transition hover:bg-stone-100 xl:hidden" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>

        <Link href="/" className="flex shrink-0 items-center gap-2.5 xl:w-[216px]" aria-label="Chanakya Research Commons home">
          <span aria-hidden className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-display text-[17px] leading-none text-white">
            C
            <span className="absolute -bottom-0.5 left-1.5 right-1.5 h-[3px] rounded-full bg-saffron-400" />
          </span>
          <span className="hidden leading-tight md:block">
            <span className="block font-display text-[15px] text-ink">Chanakya</span>
            <span className="block text-label font-medium text-stone-500">Research Commons</span>
          </span>
        </Link>

        <div className="flex min-w-0 flex-1 justify-center">
          <GlobalSearch />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={create} className="btn hidden h-9 md:inline-flex" aria-label="Create a post">
            <Plus className="h-4 w-4" /> Create
          </button>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
