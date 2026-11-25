"use client";

import Link from "next/link";
import { useState } from "react";
import { GitFork } from "lucide-react";
import { PanelHeading } from "@/components/paper/PanelHeading";
import { EmptyState } from "@/components/ui/States";
import { cx, fmtInt } from "@/lib/format";
import type { PaperDetail } from "@/types/crc";

/** References and citing papers inside the Chanakya corpus, one list at a time. */
export function CitationMetrics({ paper }: { paper: PaperDetail }) {
  const tabs = [
    { id: "refs" as const, title: "References", count: paper.cites_count, papers: paper.references },
    { id: "cited" as const, title: "Cited by", count: paper.cited_by_count, papers: paper.cited_by },
  ];
  // Open on whichever list has something in it.
  const [tab, setTab] = useState<"refs" | "cited">(paper.references.length === 0 && paper.cited_by.length > 0 ? "cited" : "refs");
  const current = tabs.find((t) => t.id === tab)!;
  return (
    <section className="card flex h-full min-w-0 flex-col" aria-label="Citation graph">
      <PanelHeading eyebrow="Citation graph" title="Influence in the corpus" icon={GitFork} />
      <div className="px-5 pt-3">
        <div role="tablist" aria-label="Citation lists" className="grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cx("flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-meta font-semibold transition", tab === t.id ? "bg-paper text-ink shadow-card" : "text-stone-500 hover:text-ink")}
            >
              {t.title} <span className="num font-medium text-stone-400">{fmtInt(t.count)}</span>
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel" className="crc-scroll max-h-[26rem] flex-1 overflow-y-auto px-5">
        {current.papers.length === 0 ? (
          <EmptyState className="py-8" title={`No ${current.title.toLowerCase()} in the Commons`} hint="Only papers that are also in this corpus are linked here." />
        ) : (
          <ul className="divide-y divide-stone-100">
            {current.papers.map((citation) => (
              <li key={citation.paper_id} className="py-3">
                <Link href={`/papers/${citation.paper_id}`} className="line-clamp-2 text-ui font-medium leading-snug text-ink hover:underline">{citation.canonical_title}</Link>
                {citation.publication_year && <p className="num mt-1 text-label text-stone-500">{citation.publication_year}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
