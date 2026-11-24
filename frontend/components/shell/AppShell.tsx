"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { PlugZap, RefreshCw } from "lucide-react";
import { AuthModal } from "@/components/auth/AuthModal";
import { Navbar } from "@/components/Navbar";
import { FilterRail } from "@/components/shell/FilterRail";
import { ShellContext } from "@/components/shell/SidebarSlot";
import { ApiError, getMembers } from "@/lib/api";
import { useAsync } from "@/lib/hooks";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Only these two pages have filters, so only they get a left column.
  const hasRail = pathname === "/feed" || pathname === "/library";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const health = useAsync((signal) => getMembers(1, signal), []);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const shell = useMemo(() => ({ sidebarOpen, openSidebar, closeSidebar }), [sidebarOpen, openSidebar, closeSidebar]);

  // The backend loads ML models on startup, so the first check often fails. Keep the banner up and
  // retry quietly every few seconds until the API answers, then hide it on its own.
  const { data: healthData, error: healthError, loading: healthLoading, reload: reloadHealth } = health;
  const [apiDown, setApiDown] = useState<unknown>(null);
  useEffect(() => {
    if (healthError != null) setApiDown(healthError);
    else if (!healthLoading && healthData != null) setApiDown(null);
  }, [healthError, healthLoading, healthData]);
  useEffect(() => {
    if (apiDown == null) return;
    const id = window.setInterval(reloadHealth, 5000);
    return () => window.clearInterval(id);
  }, [apiDown, reloadHealth]);

  useEffect(() => setSidebarOpen(false), [pathname]);
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  return (
    <ShellContext.Provider value={shell}>
      <Navbar />
      {apiDown != null && (
        <div role="alert" className="border-b border-terracotta-200 bg-terracotta-50">
          <div className="flex items-center gap-3 px-4 py-2 text-meta text-terracotta-700 sm:px-6">
            <PlugZap className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">{apiDown instanceof ApiError ? apiDown.message : "The CRC API is unavailable."} Retrying automatically…</span>
            <button type="button" onClick={reloadHealth} className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
              <RefreshCw className="h-3.5 w-3.5" />Retry
            </button>
          </div>
        </div>
      )}
      <div className="mx-auto flex w-full max-w-[1520px]">
        {hasRail && <FilterRail />}
        <main id="main" className="min-w-0 flex-1 px-4 pb-20 pt-5 sm:px-6 xl:px-8 xl:pt-6">
          <div key={pathname} className="mx-auto w-full max-w-[1120px] animate-rise">{children}</div>
        </main>
      </div>
      <AuthModal />
    </ShellContext.Provider>
  );
}
