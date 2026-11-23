"use client";

import { Share2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

export async function copyLink(url: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }
  const field = document.createElement("textarea");
  field.value = url;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(field);
  if (!copied) throw new Error("Could not copy the link. Copy it from your browser address bar.");
}

export function ShareButton({ url, label = "Share" }: { url: string; label?: string }) {
  const toast = useToast();
  const share = async () => {
    try {
      await copyLink(new URL(url, window.location.origin).toString());
      toast("Link copied");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not copy the link.");
    }
  };
  return (
    <button type="button" onClick={share} className="relative z-10 inline-flex h-9 items-center gap-1.5 rounded-full bg-stone-100 px-3.5 text-meta font-semibold text-stone-700 transition hover:bg-stone-200 active:scale-[0.97]">
      <Share2 className="h-4 w-4" />{label}
    </button>
  );
}
