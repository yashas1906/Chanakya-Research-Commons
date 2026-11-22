"use client";

import { Meter } from "@/components/ui/Meter";
import { Tag } from "@/components/ui/Pill";
import { SaveButton } from "@/components/ui/SaveButton";
import { authorsLine, fmtInt, fmtPagerank, relTime } from "@/lib/format";
import type { Paper, SavedPaper } from "@/types/crc";

/** Editorial list row for a paper: serif title, byline, prestige meter, topics. */
export function PaperRow({
  paper,
  maxRank,
  onOpen,
}: {
  paper: Paper | SavedPaper;
  /** Strongest PageRank in the list, so the meter is meaningful. */
  maxRank: number;
  onOpen: (p: Paper | SavedPaper) => void;
}) {
  const savedAt = "saved_at" in paper && paper.saved_at ? relTime(paper.saved_at) : null;
  const note = "private_notes" in paper ? paper.private_notes : null;

  return (
    <li className="group px-5 py-4 transition-colors duration-150 hover:bg-canvas/70">
      <div className="flex items-start justify-between gap-4">
        <button type="button" onClick={() => onOpen(paper)} className="min-w-0 text-left">
          <h3 className="font-serif text-[18px] leading-snug text-ink underline decoration-transparent underline-offset-[3px] transition-colors group-hover:decoration-stone-300">
            {paper.canonical_title}
          </h3>
          <p className="mt-1 text-[13px] text-stone-500">
            {[authorsLine(paper.authors, 3), paper.venue, paper.publication_year].filter(Boolean).join(" · ")}
          </p>
        </button>
        <SaveButton paperId={paper.paper_id} className="shrink-0" />
      </div>

      {paper.abstract && <p className="mt-2 line-clamp-2 max-w-3xl text-[13.5px] leading-relaxed text-stone-600">{paper.abstract}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-stone-500">
        <span className="flex w-44 items-center gap-2" title="PageRank prestige, relative to this list">
          <Meter value={maxRank > 0 ? paper.pagerank_score / maxRank : 0} tone="ink" label="PageRank prestige" />
          <span className="num shrink-0">PR {fmtPagerank(paper.pagerank_score)}</span>
        </span>
        <span className="num">
          {fmtInt(paper.save_count)} save{paper.save_count === 1 ? "" : "s"}
        </span>
        {savedAt && <span>Saved {savedAt}</span>}
        {paper.topics?.slice(0, 3).map((t) => (
          <Tag key={t}>{t}</Tag>
        ))}
      </div>
      {note && <p className="mt-2 border-l-2 border-stone-200 pl-3 text-[12.5px] italic text-stone-500">{note}</p>}
    </li>
  );
}
