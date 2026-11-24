"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

const ToastContext = createContext<(message: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const toast = useCallback((next: string) => setMessage(next), []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (typeof detail === "string") toast(detail);
    };
    window.addEventListener("crc:toast", handle);
    return () => window.removeEventListener("crc:toast", handle);
  }, [toast]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {message && (
        <div role="status" className="fixed bottom-5 left-1/2 z-[120] -translate-x-1/2 animate-pop rounded-full bg-ink px-5 py-2.5 text-ui font-medium text-paper shadow-pop">
          {message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
