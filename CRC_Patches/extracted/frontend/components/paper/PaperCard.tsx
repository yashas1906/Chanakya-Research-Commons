import Link from "next/link";
import { SaveButton } from "@/components/ui/SaveButton";
import { PrestigeTier } from "@/components/ui/PrestigeTier";
import { authorsLine, cx } from "@/lib/format";
import type { Paper } from "@/types/crc";

export function PaperCard({ paper, className }: { paper: Paper; className?: string }) {
  return (
    <article className={cx("card flex min-w-0 items-start gap-3 p-4 sm:p-5", className)}>
      <div className="min-w-0 flex-1">
        <Link href={`/papers/${paper.paper_id}`} className="font-display text-h3 leading-snug text-ink hover:underline hover:decoration-stone-300 hover:underline-offset-4">
          {paper.canonical_title}
        </Link>
        <p className="mt-1 truncate text-meta text-stone-600">{authorsLine(paper.authors, 3)}</p>
        <p className="mt-1 text-meta text-stone-500">{[paper.venue, paper.publication_year].filter(Boolean).join(" · ") || "Publication details unavailable"}</p>
        <div className="mt-3"><PrestigeTier percentile={paper.pagerank_percentile} score={paper.pagerank_score} /></div>
      </div>
      <SaveButton paperId={paper.paper_id} className="relative z-10 shrink-0" />
    </article>
  );
}
