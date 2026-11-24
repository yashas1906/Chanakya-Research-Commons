"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cx } from "@/lib/format";

/** Portal-based modal (portals avoid the stacking contexts created by card animations). */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    const focusable = panel.current?.querySelector<HTMLElement>("input, textarea, select, button:not([data-dialog-close])");
    focusable?.focus();
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-6" role="presentation">
      <button type="button" aria-label="Close dialog" tabIndex={-1} onClick={onClose} className="absolute inset-0 animate-fade bg-black/50 backdrop-blur-[2px]" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx("relative flex max-h-[92dvh] w-full animate-pop flex-col overflow-hidden rounded-t-2xl bg-paper shadow-pop sm:rounded-2xl", wide ? "sm:max-w-2xl" : "sm:max-w-md")}
      >
        <header className="flex items-start justify-between gap-4 border-b border-stone-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-[20px] leading-tight text-ink">{title}</h2>
            {description && <p className="mt-1 text-meta text-stone-500">{description}</p>}
          </div>
          <button type="button" data-dialog-close onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 rounded-full p-2 text-stone-500 hover:bg-stone-100 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-100 bg-stone-50 px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
