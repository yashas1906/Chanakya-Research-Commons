"use client";

import { Moon, Sun } from "lucide-react";
import { cx } from "@/lib/format";
import { type Theme, useTheme } from "@/lib/theme";

const OPTIONS: Array<{ id: Theme; label: string; hint: string; icon: typeof Sun }> = [
  { id: "light", label: "Bright", hint: "White and red", icon: Sun },
  { id: "dark", label: "Dark", hint: "Easy on the eyes", icon: Moon },
];

/** Bright/dark mode picker shown on the member's own profile. Saved in this browser. */
export function AppearanceSetting() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="card space-y-3 p-4">
      <div>
        <h2 className="font-display text-[16px] text-ink">Appearance</h2>
        <p className="text-label text-stone-500">Choose how Research Commons looks on this device.</p>
      </div>
      <div role="radiogroup" aria-label="Colour theme" className="grid grid-cols-2 gap-2">
        {OPTIONS.map(({ id, label, hint, icon: Icon }) => {
          const active = theme === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(id)}
              className={cx(
                "flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition duration-150",
                active ? "border-brand-600 bg-brand-50 ring-2 ring-brand-100" : "border-stone-200 hover:border-stone-300 hover:bg-stone-50",
              )}
            >
              <span
                aria-hidden
                className={cx(
                  "flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border",
                  id === "light" ? "border-[#E7E0E0] bg-white" : "border-[#3A3334] bg-[#1C191A]",
                )}
              >
                <span className="h-2.5 w-2.5 rounded-full bg-[#C41E24]" />
                <span className={cx("h-1.5 w-8 rounded-full", id === "light" ? "bg-[#E7E0E0]" : "bg-[#4D4546]")} />
              </span>
              <span className="flex items-center gap-1.5 text-meta font-semibold text-ink">
                <Icon className={cx("h-4 w-4", active ? "text-brand-600" : "text-stone-500")} /> {label}
              </span>
              <span className="text-label text-stone-500">{hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
