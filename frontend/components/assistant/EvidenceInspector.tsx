"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Meter } from "@/components/ui/Meter";
import { Pill } from "@/components/ui/Pill";
import { Skeleton } from "@/components/ui/Skeleton";
import { cx, fmtPct } from "@/lib/format";
import { citedRefs } from "@/components/assistant/AnswerText";
import type { AssistantAnswer } from "@/types/crc";

function Passage({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 360;
  return (
    <div>
      <p className={cx("text-[13.5px] leading-[1.65] text-stone-700", long && !open && "line-clamp-5")}>{text}</p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-1 text-[12px] font-medium text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-ink"
        >
          {open ? "Show less" : "Show full passage"}
        </button>
      )}
    </div>
  );
}

/**
 * Right-hand grounding inspector: the exact top-k retrieved chunks behind the active answer,
 * with source titles and pgvector (HNSW) cosine similarity, so every claim can be checked.
 */
export function EvidenceInspector({
  turn,
  pending,
  activeRef,
  onSelect,
}: {
  turn: AssistantAnswer | null;
  pending: boolean;
  activeRef: number | null;
  onSelect: (n: number | null) => void;
}) {
  const itemRefs = useRef<Map<number, HTMLLIElement>>(new Map());

  useEffect(() => {
    if (activeRef !== null) itemRefs.current.get(activeRef)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeRef]);

  const cited = turn ? citedRefs(turn.answer) : new Set<number>();

  return (
    <aside aria-label="Evidence and grounding inspector" className="card flex max-h-[calc(100vh-8rem)] flex-col overflow-hidden">
      <header className="border-b border-stone-100 px-4 py-3">
        <p className="eyebrow mb-0.5 flex items-center gap-1.5">
          <ShieldCheck className="h-3 w-3" strokeWidth={1.75} /> Grounding
        </p>
        <h2 className="font-serif text-[17px] leading-snug text-ink">Evidence inspector</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-stone-500">
          The top retrieved passages the answer was allowed to use, with cosine similarity from the vector index.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {pending ? (
          <ul className="divide-y divide-stone-100" role="status" aria-label="Retrieving passages">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="space-y-2 px-4 py-3.5">
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-1.5 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </li>
            ))}
          </ul>
        ) : !turn ? (
          <div className="px-6 py-12 text-center">
            <p className="font-serif text-[16px] text-stone-600">Nothing retrieved yet</p>
            <p className="mt-1 text-[13px] leading-relaxed text-stone-500">Ask a question and the supporting passages will appear here.</p>
          </div>
        ) : turn.citations.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-serif text-[16px] text-stone-600">No passages retrieved</p>
            <p className="mt-1 text-[13px] leading-relaxed text-stone-500">
              Nothing in the corpus was close enough to this question, so there is nothing to ground an answer on.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-stone-100">
            {turn.citations.map((c) => {
              const active = activeRef === c.ref_index;
              return (
                <li
                  key={c.ref_index}
                  ref={(el) => {
                    if (el) itemRefs.current.set(c.ref_index, el);
                    else itemRefs.current.delete(c.ref_index);
                  }}
                  className={cx("relative px-4 py-3.5 transition-colors duration-200", active && "bg-sunken")}
                >
                  <span className={cx("absolute inset-y-0 left-0 w-0.5 transition-colors", active ? "bg-ink" : "bg-transparent")} />
                  <button
                    type="button"
                    onClick={() => onSelect(active ? null : c.ref_index)}
                    className="flex w-full items-start gap-2.5 text-left"
                    aria-pressed={active}
                  >
                    <span
                      className={cx(
                        "num mt-0.5 inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full border px-1 text-[10.5px] font-semibold",
                        active ? "border-ink bg-ink text-white" : "border-stone-300 bg-paper text-stone-600",
                      )}
                    >
                      {c.ref_index}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-serif text-[15.5px] leading-snug text-ink">{c.title}</span>
                      <span className="num mt-0.5 block text-[12px] text-stone-500">{c.year ?? "Year unknown"}</span>
                    </span>
                  </button>
                  <div className="mt-2.5 flex items-center gap-2.5">
                    <Meter value={c.similarity} tone={c.similarity >= 0.5 ? "sage" : "stone"} label={`Similarity ${fmtPct(c.similarity)}`} />
                    <span className="num shrink-0 text-[12px] font-medium text-stone-700">{fmtPct(c.similarity, 1)}</span>
                  </div>
                  <div className="mt-2.5 border-l-2 border-stone-200 pl-3">
                    <Passage text={c.passage} />
                  </div>
                  <div className="mt-2.5">
                    {cited.has(c.ref_index) ? <Pill tone="sage">Cited in answer</Pill> : <Pill>Retrieved, not cited</Pill>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
