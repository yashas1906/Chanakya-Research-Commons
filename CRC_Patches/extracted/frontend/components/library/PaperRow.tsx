"use client";

import Link from "next/link";
import { Tag } from "@/components/ui/Pill";
import { SaveButton } from "@/components/ui/SaveButton";
import { PrestigeTier } from "@/components/ui/PrestigeTier";
import { authorsLine, fmtInt, relTime } from "@/lib/format";
import type { Paper, SavedPaper } from "@/types/crc";

export function PaperRow({ paper }: { paper: Paper | SavedPaper }) {
  const savedAt = "saved_at" in paper && paper.saved_at ? relTime(paper.saved_at) : null;
  const note = "private_notes" in paper ? paper.private_notes : null;
  return (
    <li className="min-w-0 px-4 py-5 transition-colors hover:bg-sunken sm:px-5">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href={`/papers/${paper.paper_id}`} className="font-display text-h3 leading-snug text-ink hover:underline hover:decoration-stone-300 hover:underline-offset-4">{paper.canonical_title}</Link>
          <p className="mt-1 text-meta text-stone-500">{[authorsLine(paper.authors, 3), paper.venue, paper.publication_year].filter(Boolean).join(" · ")}</p>
        </div>
        <SaveButton paperId={paper.paper_id} className="shrink-0" />
      </div>
      {paper.abstract && <p className="mt-3 line-clamp-2 max-w-3xl text-body leading-relaxed text-stone-600">{paper.abstract}</p>}
      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-meta text-stone-500">
        <PrestigeTier percentile={paper.pagerank_percentile} score={paper.pagerank_score} />
        <span className="num">{fmtInt(paper.save_count)} saves</span>
        {savedAt && <span>Saved {savedAt}</span>}
        {paper.topics?.slice(0, 3).map((tag) => <Tag key={tag}>{tag}</Tag>)}
      </div>
      {note && <p className="mt-2 border-l-2 border-stone-200 pl-3 text-meta italic text-stone-500">{note}</p>}
    </li>
  );
}
