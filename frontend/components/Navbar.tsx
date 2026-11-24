"use client";

import { AccountMenu } from "@/components/shell/AccountMenu";
import { GlobalSearch } from "@/components/shell/GlobalSearch";

/** Slim top bar: just search and account. Navigation lives in the left icon rail (<Sidebar>). */
export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
      <div className="mx-auto flex h-16 w-full max-w-[1520px] items-center gap-3 px-3 sm:gap-4 sm:px-6">
        <div className="flex min-w-0 flex-1 justify-center">
          <GlobalSearch />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
