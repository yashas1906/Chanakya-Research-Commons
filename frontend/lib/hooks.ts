"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAbort } from "@/lib/api";

export interface AsyncState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

/**
 * Last good response per cache key, kept for this tab's life. When the member goes Back to a list,
 * it renders straight from here (so the browser can restore the scroll position) and refreshes quietly.
 */
const responseCache = new Map<string, unknown>();
const CACHE_LIMIT = 60;

/**
 * Runs `fn` whenever `deps` change (or reload() is called), aborting the in-flight
 * request on re-run/unmount. Keeps the previous data visible while refreshing.
 * Pass `enabled=false` to hold off (e.g. until a member is selected).
 * Pass `cacheKey` (built from the same inputs as `deps`) to show the last response instantly on return.
 */
export function useAsync<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: ReadonlyArray<unknown>,
  enabled = true,
  cacheKey?: string,
): AsyncState<T> {
  const cached = cacheKey !== undefined && responseCache.has(cacheKey) ? (responseCache.get(cacheKey) as T) : null;
  const [data, setData] = useState<T | null>(cached);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState<boolean>(enabled && cached === null);
  const keyRef = useRef(cacheKey);
  keyRef.current = cacheKey;

  // A new key with a cached answer shows it at once (e.g. switching back to a sort already seen).
  const [shownKey, setShownKey] = useState(cacheKey);
  if (shownKey !== cacheKey) {
    setShownKey(cacheKey);
    if (cached !== null) setData(cached);
  }
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fnRef
      .current(ctrl.signal)
      .then((d) => {
        if (ctrl.signal.aborted) return;
        setData(d);
        const key = keyRef.current;
        if (key !== undefined) {
          responseCache.delete(key);
          responseCache.set(key, d);
          if (responseCache.size > CACHE_LIMIT) responseCache.delete(responseCache.keys().next().value as string);
        }
      })
      .catch((e: unknown) => {
        if (isAbort(e) || ctrl.signal.aborted) return;
        setError(e);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

/** Debounce a changing value. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
