"use client";

import { ArrowBigDown, ArrowBigUp } from "lucide-react";
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
    <span
      className={cx(
        "relative z-10 inline-flex h-9 items-center rounded-full transition-colors duration-200",
        vote === 1 ? "bg-brand-50" : vote === -1 ? "bg-stone-200" : "bg-stone-100",
      )}
    >
      <button
        type="button"
        disabled={busy}
        onClick={() => onVote(vote === 1 ? 0 : 1)}
        aria-label={vote === 1 ? "Remove upvote" : "Upvote"}
        aria-pressed={vote === 1}
        className={cx(
          "flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-brand-100 hover:text-brand-700 disabled:opacity-50",
          vote === 1 ? "text-brand-600" : "text-stone-600",
        )}
      >
        <ArrowBigUp key={`u${vote}`} className={cx("h-[22px] w-[22px]", vote === 1 && "animate-bump fill-brand-600")} strokeWidth={1.8} />
      </button>
      <span
        className={cx("num min-w-[1.25rem] text-center text-meta font-bold", vote === 1 ? "text-brand-700" : "text-stone-800")}
        aria-label={`${score} score`}
      >
        {fmtInt(score)}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={() => onVote(vote === -1 ? 0 : -1)}
        aria-label={vote === -1 ? "Remove downvote" : "Downvote"}
        aria-pressed={vote === -1}
        className={cx(
          "flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-stone-300/70 hover:text-ink disabled:opacity-50",
          vote === -1 ? "text-ink" : "text-stone-600",
        )}
      >
        <ArrowBigDown key={`d${vote}`} className={cx("h-[22px] w-[22px]", vote === -1 && "animate-bump fill-stone-700")} strokeWidth={1.8} />
      </button>
    </span>
  );
}
