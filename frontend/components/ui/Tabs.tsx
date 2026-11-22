"use client";

import { cx } from "@/lib/format";

export interface TabDef<T extends string> {
  id: T;
  label: string;
  count?: number;
}

/** Underline tabs with a smooth ink indicator. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: ReadonlyArray<TabDef<T>>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cx("flex gap-6 border-b border-stone-200/90", className)}>
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cx(
              "relative -mb-px pb-2.5 pt-1 text-meta font-medium transition-colors duration-150",
              active ? "text-ink" : "text-stone-500 hover:text-stone-800",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="num ml-1.5 text-meta text-stone-400">{t.count}</span>}
            <span
              className={cx(
                "absolute inset-x-0 -bottom-px h-0.5 origin-left rounded-full bg-ink transition-transform duration-200",
                active ? "scale-x-100" : "scale-x-0",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
