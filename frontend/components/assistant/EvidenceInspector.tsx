"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpenText, ChevronDown } from "lucide-react";
import { Meter } from "@/components/ui/Meter";
import { Pill } from "@/components/ui/Pill";
import { citedRefs } from "@/components/assistant/AnswerText";
import { cx, fmtPct } from "@/lib/format";
import type { Citation } from "@/types/crc";

function Passage({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 320;
  return (
    <div>
      <p className={cx("text-meta leading-[1.65] text-stone-700", long && !open && "line-clamp-4")}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 text-meta font-semibold text-brand-600 hover:text-brand-700">
          {open ? "Show less" : "Show full passage"}
        </button>
      )}
    </div>
  );
}

interface SourceGroup {
  key: string;
  title: string;
  year: number | null;
  refs: number[];
  best: number;
}

/** The same paper often yields several retrieved chunks; show it once with all its reference numbers. */
function groupSources(citations: Citation[]): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  for (const c of citations) {
    const key = `${c.title.trim().toLowerCase()}|${c.year ?? ""}`;
    const group = groups.get(key);
    if (group) {
      group.refs.push(c.ref_index);
      group.best = Math.max(group.best, c.similarity);
    } else {
      groups.set(key, { key, title: c.title, year: c.year ?? null, refs: [c.ref_index], best: c.similarity });
    }
  }
  return [...groups.values()];
}

/**
 * Sits directly under an answer, like the sources row in a chat product: a compact chip per paper,
 * and a collapsible list of the exact retrieved passages with their cosine similarity.
 */
export function SourcesPanel({
  citations,
  answer,
  activeRef,
  expanded,
  onToggle,
  onSelect,
}: {
  citations: Citation[];
  answer: string;
  activeRef: number | null;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (n: number) => void;
}) {
  const itemRefs = useRef<Map<number, HTMLLIElement>>(new Map());
  const groups = useMemo(() => groupSources(citations), [citations]);
  const cited = useMemo(() => citedRefs(answer), [answer]);

  useEffect(() => {
    if (expanded && activeRef !== null) itemRefs.current.get(activeRef)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeRef, expanded]);

  if (citations.length === 0) {
    return <p className="text-meta text-stone-500">No passages in the library were close enough to this question to ground an answer.</p>;
  }

  return (
    <section aria-label="Sources" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 flex items-center gap-1.5 text-label font-semibold uppercase tracking-[0.12em] text-stone-500">
          <BookOpenText className="h-3.5 w-3.5" /> Sources
        </span>
        {groups.map((group) => {
          const active = activeRef !== null && group.refs.includes(activeRef);
          return (
            <button
              key={group.key}
              type="button"
              onClick={() => onSelect(group.refs[0])}
              aria-pressed={active}
              title={group.title}
              className={cx(
                "inline-flex max-w-full items-center gap-2 rounded-full border py-1 pl-1.5 pr-3 text-meta transition duration-150",
                active ? "border-brand-600 bg-brand-50 text-brand-800" : "border-stone-200 bg-paper text-stone-700 hover:border-brand-300 hover:bg-brand-50",
              )}
            >
              <span className="num flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-700 px-1.5 text-[11px] font-semibold text-white">{group.refs.join(" · ")}</span>
              <span className="max-w-[170px] truncate font-medium sm:max-w-[210px]">{group.title}</span>
              {group.year && <span className="num text-stone-400">{group.year}</span>}
            </button>
          );
        })}
      </div>

      <button type="button" onClick={onToggle} aria-expanded={expanded} className="inline-flex items-center gap-1.5 text-meta font-semibold text-brand-600 hover:text-brand-700">
        {expanded ? "Hide" : "Show"} retrieved passages ({citations.length})
        <ChevronDown className={cx("h-4 w-4 transition-transform duration-200", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <ul className="animate-fade divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-paper">
          {citations.map((c) => {
            const active = activeRef === c.ref_index;
            return (
              <li
                key={c.ref_index}
                ref={(el) => {
                  if (el) itemRefs.current.set(c.ref_index, el);
                  else itemRefs.current.delete(c.ref_index);
                }}
                className={cx("relative space-y-2.5 px-4 py-3.5 transition-colors duration-200", active && "bg-brand-50/70")}
              >
                <span aria-hidden className={cx("absolute inset-y-0 left-0 w-[3px] transition-colors", active ? "bg-brand-600" : "bg-transparent")} />
                <div className="flex items-start gap-2.5">
                  <span className="num mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-700 px-1.5 text-[11px] font-semibold text-white">{c.ref_index}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[16px] leading-snug text-ink">{c.title}</p>
                    <p className="num mt-0.5 text-meta text-stone-500">{c.year ?? "Year unknown"}</p>
                  </div>
                  {cited.has(c.ref_index) ? <Pill tone="sage">Cited</Pill> : <Pill>Not cited</Pill>}
                </div>
                <div className="flex items-center gap-2.5 pl-[30px]">
                  <Meter value={c.similarity} tone={c.similarity >= 0.5 ? "sage" : "stone"} label={`Similarity ${fmtPct(c.similarity)}`} />
                  <span className="num shrink-0 text-meta font-medium text-stone-700">{fmtPct(c.similarity, 1)} match</span>
                </div>
                <div className="ml-[30px] border-l-2 border-stone-200 pl-3">
                  <Passage text={c.passage} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
