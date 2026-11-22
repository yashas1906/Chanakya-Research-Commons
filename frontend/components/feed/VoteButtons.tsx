"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { cx, fmtInt } from "@/lib/format";

export function VoteButtons({
  score,
  vote,
  busy = false,
  onVote,
}: {
  score: number;
  vote: -1 | 0 | 1;
  busy?: boolean;
  onVote: (value: -1 | 0 | 1) => void;
}) {
  return (
    <span className="relative z-10 inline-flex h-9 items-center rounded-full border border-stone-200">
      <button type="button" disabled={busy} onClick={() => onVote(vote === 1 ? 0 : 1)} aria-label={vote === 1 ? "Remove upvote" : "Upvote"} aria-pressed={vote === 1} className={cx("flex h-full items-center rounded-l-full px-2.5 hover:bg-sunken disabled:opacity-50", vote === 1 && "bg-ink text-white hover:bg-ink")}>
        <ArrowUp className="h-4 w-4" />
      </button>
      <span className="num px-1 text-meta font-medium text-ink" aria-label={`${score} score`}>{fmtInt(score)}</span>
      <button type="button" disabled={busy} onClick={() => onVote(vote === -1 ? 0 : -1)} aria-label={vote === -1 ? "Remove downvote" : "Downvote"} aria-pressed={vote === -1} className={cx("flex h-full items-center rounded-r-full px-2.5 hover:bg-sunken disabled:opacity-50", vote === -1 && "bg-ink text-white hover:bg-ink")}>
        <ArrowDown className="h-4 w-4" />
      </button>
    </span>
  );
}
