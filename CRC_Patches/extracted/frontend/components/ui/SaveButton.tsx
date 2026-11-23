"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { describeError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useSaves } from "@/lib/saves-context";
import { cx } from "@/lib/format";

/** One-click save to the signed-in member's Chanakya library. */
export function SaveButton({
  paperId,
  size = "sm",
  className,
}: {
  paperId: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const { user, promptLogin } = useAuth();
  const { savedIds, save } = useSaves();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const saved = savedIds.has(paperId);

  const onClick = async () => {
    if (!user) {
      promptLogin("login");
      return;
    }
    if (saved || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await save(paperId, "Saved from Chanakya Research Commons");
    } catch (e) {
      setErr(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const Icon = busy ? Loader2 : saved ? BookmarkCheck : Bookmark;
  return (
    <span className={cx("inline-flex flex-col items-end gap-1", className)}>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-pressed={saved}
        title={saved ? "In your library" : "Save to your library"}
        className={cx(
          "inline-flex items-center gap-1.5 rounded-full font-semibold transition duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50",
          size === "sm" ? "h-9 px-3.5 text-meta" : "h-10 px-4 text-ui",
          saved
            ? "bg-brand-50 text-brand-700 hover:bg-brand-100"
            : "bg-stone-100 text-stone-700 hover:bg-stone-200",
        )}
      >
        <Icon className={cx("h-3.5 w-3.5", busy && "animate-spin")} strokeWidth={1.75} />
        {saved ? "Saved" : "Save"}
      </button>
      {err && (
        <span role="alert" className="max-w-[220px] text-right text-meta leading-snug text-terracotta-600">
          {err}
        </span>
      )}
    </span>
  );
}
