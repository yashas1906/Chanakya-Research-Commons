"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cx } from "@/lib/format";

/** The element in the left sidebar that pages render their filters into. */
export const SIDEBAR_SLOT_ID = "crc-sidebar-slot";

interface ShellValue {
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
}

export const ShellContext = createContext<ShellValue>({ sidebarOpen: false, openSidebar: () => undefined, closeSidebar: () => undefined });
export const useShell = () => useContext(ShellContext);

/** Renders its children inside the left sidebar (desktop) / drawer (mobile). */
export function SidebarPortal({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => setTarget(document.getElementById(SIDEBAR_SLOT_ID)), []);
  return target ? createPortal(children, target) : null;
}

/** A collapsible group of filter options with an optional "clear" action. */
export function SidebarSection({
  title,
  children,
  defaultOpen = true,
  onClear,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-stone-100 px-3 py-3 first:border-t-0">
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-1.5 py-1 text-left text-label font-semibold uppercase tracking-wider text-stone-500 hover:text-ink"
        >
          {title}
          <ChevronDown className={cx("h-3.5 w-3.5 transition-transform duration-200", !open && "-rotate-90")} />
        </button>
        {onClear && (
          <button type="button" onClick={onClear} className="rounded-full px-2 py-0.5 text-label font-semibold text-brand-600 hover:bg-brand-50">
            Clear
          </button>
        )}
      </div>
      {open && <div className="mt-1 animate-fade space-y-0.5">{children}</div>}
    </section>
  );
}

/** A single radio/checkbox-style option row with an optional count. */
export function FilterOption({
  label,
  count,
  active,
  onClick,
  kind = "radio",
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  kind?: "radio" | "check";
}) {
  return (
    <button
      type="button"
      role={kind === "radio" ? "radio" : "checkbox"}
      aria-checked={active}
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-meta transition duration-150",
        active ? "bg-brand-50 font-semibold text-brand-700" : "text-stone-700 hover:bg-stone-100",
      )}
    >
      <span
        aria-hidden
        className={cx(
          "flex h-4 w-4 shrink-0 items-center justify-center border transition",
          kind === "radio" ? "rounded-full" : "rounded",
          active ? "border-brand-600 bg-brand-600" : "border-stone-300 bg-paper",
        )}
      >
        {active && (kind === "radio" ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : <span className="text-[10px] leading-none text-white">✓</span>)}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className={cx("num text-label", active ? "text-brand-500" : "text-stone-400")}>{count}</span>}
    </button>
  );
}

/** Opens the sidebar drawer on screens too narrow to show it permanently. */
export function FilterToggle({ activeCount = 0 }: { activeCount?: number }) {
  const { openSidebar } = useShell();
  return (
    <button type="button" onClick={openSidebar} className="btn xl:hidden">
      <SlidersHorizontal className="h-4 w-4" />
      Filters
      {activeCount > 0 && <span className="num rounded-full bg-brand-600 px-1.5 text-label text-white">{activeCount}</span>}
    </button>
  );
}
