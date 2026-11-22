"use client";

import { Plus, Sparkles } from "lucide-react";
import { fmtLift } from "@/lib/format";
import type { RelatedTopic } from "@/types/crc";

/**
 * High-lift query expansion (association rules, lift >= 1.5).
 * Clicking a topic pivots the search to it; the "+" refines by appending it to the current query.
 */
export function RelatedTopics({
  topics,
  onPivot,
  onRefine,
}: {
  topics: RelatedTopic[];
  onPivot: (topic: string) => void;
  onRefine: (topic: string) => void;
}) {
  if (topics.length === 0) return null;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-center gap-x-2 gap-y-2" aria-label="Related topics">
      <span className="mr-1 inline-flex items-center gap-1.5 text-meta font-medium uppercase tracking-eyebrow text-stone-500">
        <Sparkles className="h-3 w-3" strokeWidth={1.75} /> Often studied with
      </span>
      {topics.map((t) => (
        <span
          key={t.topic}
          className="inline-flex items-stretch overflow-hidden rounded-full border border-stone-200/90 bg-paper text-meta transition-colors duration-150 hover:border-stone-300"
        >
          <button
            type="button"
            onClick={() => onPivot(t.topic)}
            title={`Pivot: search “${t.topic}”`}
            className="inline-flex items-center gap-1.5 py-1 pl-3 pr-2 font-medium text-stone-700 transition-colors hover:bg-sunken hover:text-ink"
          >
            {t.topic}
            {t.lift !== null && <span className="num text-meta font-normal text-stone-400">{fmtLift(t.lift)}</span>}
          </button>
          <button
            type="button"
            onClick={() => onRefine(t.topic)}
            title={`Refine: add “${t.topic}” to this query`}
            aria-label={`Add ${t.topic} to the current query`}
            className="border-l border-stone-100 px-2 text-stone-400 transition-colors hover:bg-sunken hover:text-ink"
          >
            <Plus className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
