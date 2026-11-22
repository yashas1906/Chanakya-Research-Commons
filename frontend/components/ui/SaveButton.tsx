"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { describeError } from "@/lib/api";
import { useMember } from "@/lib/member-context";
import { useSaves } from "@/lib/saves-context";
import { cx } from "@/lib/format";

/** One-click save to the acting member's Chanakya library. */
export function SaveButton({
  paperId,
  size = "sm",
  className,
}: {
  paperId: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const { current } = useMember();
  const { savedIds, save } = useSaves();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const saved = savedIds.has(paperId);

  const onClick = async () => {
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
        disabled={!current || busy}
        aria-pressed={saved}
        title={!current ? "Choose a member to save as" : saved ? "In your library" : "Save to your library"}
        className={cx(
          "inline-flex items-center gap-1.5 rounded-lg border font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
          size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-3 py-1.5 text-[13px]",
          saved
            ? "border-sage-200 bg-sage-50 text-sage-700"
            : "border-stone-200/90 bg-paper text-stone-700 hover:border-stone-300 hover:bg-sunken",
        )}
      >
        <Icon className={cx("h-3.5 w-3.5", busy && "animate-spin")} strokeWidth={1.75} />
        {saved ? "Saved" : "Save"}
      </button>
      {err && (
        <span role="alert" className="max-w-[220px] text-right text-[11px] leading-snug text-terracotta-600">
          {err}
        </span>
      )}
    </span>
  );
}
