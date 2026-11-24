"use client";

import { useCallback, useEffect, useState } from "react";
import { THEME_KEY } from "@/lib/theme-script";

export type Theme = "light" | "dark";

const EVENT = "crc:theme";

function current(): Theme {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: theme }));
}

/** Current theme plus a setter; every component using it stays in sync. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    setThemeState(current());
    const sync = () => setThemeState(current());
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_KEY) return;
      document.documentElement.classList.toggle("dark", event.newValue === "dark");
      sync();
    };
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setTheme = useCallback((next: Theme) => apply(next), []);
  return { theme, setTheme };
}
