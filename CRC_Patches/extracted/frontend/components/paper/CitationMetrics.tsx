import Link from "next/link";
import { EmptyState } from "@/components/ui/States";
import type { PaperDetail } from "@/types/crc";

export function CitationMetrics({ paper }: { paper: PaperDetail }) {
  const rows = [
    { title: "References", count: paper.cites_count, papers: paper.references },
    { title: "Cited by", count: paper.cited_by_count, papers: paper.cited_by },
  ];
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {rows.map((row) => <div key={row.title} className="rounded-xl border border-stone-200 bg-canvas p-4"><p className="num font-display text-2xl text-ink">{row.count}</p><p className="mt-1 text-meta text-stone-500">{row.title}</p></div>)}
      </div>
      {rows.map((row) => <div key={row.title}>
        <h3 className="text-ui font-medium text-ink">{row.title} in this corpus</h3>
        {row.papers.length === 0 ? <EmptyState className="py-4" title={`No ${row.title.toLowerCase()} found`} />
          : <ul className="mt-2 space-y-2">{row.papers.slice(0, 8).map((citation) => <li key={citation.paper_id}><Link href={`/papers/${citation.paper_id}`} className="text-meta text-stone-700 hover:text-ink hover:underline">{citation.canonical_title}</Link><span className="ml-2 text-meta text-stone-500">{citation.publication_year ?? ""}</span></li>)}</ul>}
      </div>)}
    </section>
  );
}
