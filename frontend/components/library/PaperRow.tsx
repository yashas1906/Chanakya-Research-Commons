"use client";

import Link from "next/link";
import { Tag } from "@/components/ui/Pill";
import { NoteEditor } from "@/components/library/NoteEditor";
import { SaveButton } from "@/components/ui/SaveButton";
import { PrestigeTier } from "@/components/ui/PrestigeTier";
import { authorsLine, fmtInt, relTime } from "@/lib/format";
import type { Paper } from "@/types/crc";

/** What a row needs. Recommended papers come without authors or abstract, so those are optional. */
export type PaperRowData = Pick<Paper, "paper_id" | "canonical_title" | "venue" | "publication_year" | "topics" | "save_count" | "pagerank_score" | "pagerank_percentile"> & {
  authors?: Paper["authors"];
  abstract?: string | null;
  saved_at?: string | null;
  private_notes?: string | null;
  collection_name?: string | null;
};

/**
 * The one paper card used across the Library (holdings, saves, recommended) and profiles:
 * title + save action, byline, two-line abstract, a meta row, then the member's own note on saved papers.
 * `badge` adds a leading item to the meta row (e.g. a recommendation's match score).
 */
export function PaperRow({ paper, badge }: { paper: PaperRowData; badge?: React.ReactNode }) {
  const isMine = !!paper.saved_at;
  const byline = [authorsLine(paper.authors ?? null, 3), paper.venue, paper.publication_year].filter(Boolean).join(" · ");
  return (
    <li className="min-w-0 px-4 py-5 transition-colors hover:bg-sunken sm:px-5">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href={`/papers/${paper.paper_id}`} className="font-display text-h3 leading-snug text-ink hover:underline hover:decoration-stone-300 hover:underline-offset-4">{paper.canonical_title}</Link>
          <p className="mt-1 text-meta text-stone-500">{byline || "Publication details unavailable"}</p>
        </div>
        <SaveButton paperId={paper.paper_id} className="shrink-0" />
      </div>
      {paper.abstract && <p className="mt-3 line-clamp-2 max-w-3xl text-body leading-relaxed text-stone-600">{paper.abstract}</p>}
      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-meta text-stone-500">
        {badge}
        <PrestigeTier percentile={paper.pagerank_percentile} score={paper.pagerank_score} compact />
        <span className="num">{fmtInt(paper.save_count)} {paper.save_count === 1 ? "save" : "saves"}</span>
        {isMine && <span>Saved {relTime(paper.saved_at!)}{paper.collection_name ? ` · in ${paper.collection_name}` : ""}</span>}
        {paper.topics && paper.topics.length > 0 && (
          <span className="flex flex-wrap gap-1.5">{paper.topics.slice(0, 3).map((tag) => <Tag key={tag}>{tag}</Tag>)}</span>
        )}
      </div>
      {isMine && <NoteEditor paperId={paper.paper_id} initial={paper.private_notes ?? null} className="mt-3" />}
    </li>
  );
}
