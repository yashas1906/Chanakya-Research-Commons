"use client";

import { ExternalLink, StickyNote } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Pill, Tag } from "@/components/ui/Pill";
import { SaveButton } from "@/components/ui/SaveButton";
import { SkeletonLines } from "@/components/ui/Skeleton";
import { getAlsoSaved } from "@/lib/api";
import { authorNames, fmtInt, fmtPagerank } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import type { Paper, SavedPaper } from "@/types/crc";

type DrawerPaper = Paper | SavedPaper;

function isSaved(p: DrawerPaper): p is SavedPaper {
  return "private_notes" in p;
}

/** Abstract reader: full metadata, abstract, notes, and "readers also saved" (FP-Growth). */
export function PaperDrawer({
  paper,
  onClose,
  onOpenPaper,
}: {
  paper: DrawerPaper | null;
  onClose: () => void;
  onOpenPaper?: (paperId: string) => void;
}) {
  const open = paper !== null;
  const alsoSaved = useAsync((s) => getAlsoSaved(paper!.paper_id, s), [paper?.paper_id], open);
  const authors = paper ? authorNames(paper.authors) : [];
  const doiHref = paper?.doi ? (paper.doi.startsWith("http") ? paper.doi : `https://doi.org/${paper.doi}`) : null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow={paper?.in_chanakya_library ? "Chanakya Library" : "Paper"}
      title={paper?.canonical_title ?? ""}
      footer={
        paper && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] text-stone-500">
              {paper.save_count > 0 ? `Saved by ${fmtInt(paper.save_count)} member${paper.save_count === 1 ? "" : "s"}` : "Not yet saved by anyone"}
            </span>
            <SaveButton paperId={paper.paper_id} size="md" />
          </div>
        )
      }
    >
      {paper && (
        <div className="space-y-6">
          <div>
            {authors.length > 0 && <p className="text-[14px] leading-relaxed text-stone-700">{authors.join(", ")}</p>}
            <p className="mt-1 text-[13px] text-stone-500">
              {[paper.venue, paper.publication_year].filter(Boolean).join(" · ") || "Venue unknown"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {paper.sources?.map((s) => (
                <Pill key={s}>{s}</Pill>
              ))}
              {doiHref && (
                <a
                  href={doiHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-stone-600 underline decoration-stone-300 underline-offset-2 hover:text-ink"
                >
                  DOI <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>

          <dl className="grid grid-cols-3 divide-x divide-stone-100 rounded-lg border border-stone-200/90">
            <Stat label="PageRank" value={fmtPagerank(paper.pagerank_score)} />
            <Stat label="Library saves" value={fmtInt(paper.save_count)} />
            <Stat label="Year" value={paper.publication_year?.toString() ?? "—"} />
          </dl>

          <section>
            <h3 className="eyebrow mb-2">Abstract</h3>
            {paper.abstract ? (
              <p className="font-serif text-[16.5px] leading-[1.7] text-stone-800">{paper.abstract}</p>
            ) : (
              <p className="text-[13px] text-stone-500">No abstract is available for this work.</p>
            )}
          </section>

          {paper.topics && paper.topics.length > 0 && (
            <section>
              <h3 className="eyebrow mb-2">Topics</h3>
              <div className="flex flex-wrap gap-1.5">
                {paper.topics.map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </div>
            </section>
          )}

          {isSaved(paper) && paper.private_notes && (
            <section className="rounded-lg border border-stone-200/90 bg-sunken px-4 py-3">
              <h3 className="eyebrow mb-1.5 flex items-center gap-1.5">
                <StickyNote className="h-3 w-3" /> Your note
              </h3>
              <p className="text-[13.5px] leading-relaxed text-stone-700">{paper.private_notes}</p>
            </section>
          )}

          <section>
            <h3 className="eyebrow mb-2">Readers who saved this also saved</h3>
            {alsoSaved.loading && !alsoSaved.data ? (
              <SkeletonLines lines={3} />
            ) : alsoSaved.error || !alsoSaved.data || alsoSaved.data.length === 0 ? (
              <p className="text-[13px] leading-relaxed text-stone-500">
                Not enough co-saves yet to mine an association for this paper.
              </p>
            ) : (
              <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200/90">
                {alsoSaved.data.map((p) => (
                  <li key={p.paper_id}>
                    <button
                      type="button"
                      onClick={() => onOpenPaper?.(p.paper_id)}
                      disabled={!onOpenPaper}
                      className="flex w-full items-baseline justify-between gap-3 px-3 py-2.5 text-left transition-colors enabled:hover:bg-sunken"
                    >
                      <span className="font-serif text-[15px] leading-snug text-ink">{p.canonical_title}</span>
                      <span className="num shrink-0 text-[11.5px] text-stone-400">
                        {p.publication_year ?? "—"} · {p.save_count} saves
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5">
      <dt className="eyebrow">{label}</dt>
      <dd className="num mt-0.5 text-[15px] font-medium text-ink">{value}</dd>
    </div>
  );
}
