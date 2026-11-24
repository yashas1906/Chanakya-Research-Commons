"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { SIDEBAR_SLOT_ID, useShell } from "@/components/shell/SidebarSlot";
import { cx } from "@/lib/format";

/**
 * Left column that only exists on Feed and Library. Pages fill the slot with their filters through
 * <SidebarPortal>; if nothing fills it (e.g. Library → Collections) the whole column disappears.
 * Below `xl` it becomes a slide-in drawer opened by the "Filters" button.
 */
export function FilterRail() {
  const { sidebarOpen, closeSidebar } = useShell();
  return (
    <>
      {sidebarOpen && <div aria-hidden className="fixed inset-0 z-40 animate-fade bg-black/50 xl:hidden" onClick={closeSidebar} />}
      <aside
        aria-label="Filters"
        className={cx(
          "fixed inset-y-0 left-0 z-50 flex w-[300px] -translate-x-full flex-col overflow-y-auto overscroll-contain border-r border-stone-200 bg-paper transition-transform duration-200 ease-out",
          "xl:sticky xl:top-16 xl:z-10 xl:h-[calc(100dvh-4rem)] xl:w-[264px] xl:shrink-0 xl:translate-x-0 xl:self-start",
          "[&:has(#crc-sidebar-slot:empty)]:hidden",
          sidebarOpen && "translate-x-0 shadow-pop xl:shadow-none",
        )}
      >
        <div className="flex h-16 items-center justify-between bg-deep px-4 xl:hidden">
          <span className="flex items-center gap-2 font-display text-[17px] text-white"><SlidersHorizontal className="h-4 w-4 text-saffron-300" /> Filters</span>
          <button type="button" onClick={closeSidebar} className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Close filters">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div id={SIDEBAR_SLOT_ID} className="pb-6" />
      </aside>
    </>
  );
}
