"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useMember } from "@/lib/member-context";
import { Avatar } from "@/components/ui/Section";
import { cx, shortSchool } from "@/lib/format";

/** "Acting as" picker. The backend has no auth yet, so identity is an explicit, switchable choice. */
export function MemberSwitcher() {
  const { members, current, setCurrentId, status } = useMember();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f
      ? members.filter((m) => `${m.full_name} ${m.department} ${m.role}`.toLowerCase().includes(f))
      : members;
  }, [members, filter]);

  if (status === "loading") {
    return <div className="skeleton h-9 w-44" aria-label="Loading members" />;
  }
  if (!current) {
    return <span className="text-[12px] text-stone-400">No member selected</span>;
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-lg border border-stone-200/90 bg-paper py-1 pl-1.5 pr-2.5 text-left transition-colors duration-150 hover:border-stone-300"
      >
        <Avatar name={current.full_name} size={26} />
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-[150px] truncate text-[12.5px] font-medium leading-4 text-ink">{current.full_name}</span>
          <span className="block max-w-[150px] truncate text-[11px] leading-4 text-stone-500">
            {current.role} · {shortSchool(current.department)}
          </span>
        </span>
        <ChevronDown className={cx("h-3.5 w-3.5 text-stone-400 transition-transform duration-150", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[320px] animate-rise overflow-hidden rounded-xl border border-stone-200/90 bg-paper shadow-[0_8px_24px_-12px_rgba(24,24,27,0.18)]">
          <div className="border-b border-stone-100 p-2">
            <p className="eyebrow px-1 pb-1.5 pt-0.5">Acting as</p>
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter members…"
              className="input py-1.5 text-[13px]"
              aria-label="Filter members"
            />
          </div>
          <ul role="listbox" aria-label="Members" className="max-h-72 overflow-y-auto py-1">
            {shown.map((m) => {
              const active = m.user_id === current.user_id;
              return (
                <li key={m.user_id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setCurrentId(m.user_id);
                      setOpen(false);
                      setFilter("");
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-sunken"
                  >
                    <Avatar name={m.full_name} size={26} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{m.full_name}</span>
                      <span className="block truncate text-[11px] text-stone-500">
                        {m.role} · {m.department}
                      </span>
                    </span>
                    {active && <Check className="h-3.5 w-3.5 text-ink" />}
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-3 py-4 text-center text-[13px] text-stone-500">No matching members</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
