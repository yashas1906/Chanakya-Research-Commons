"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, Bookmark, ExternalLink, MessageSquarePlus, Sparkles } from "lucide-react";
import { BackLink } from "@/components/ui/BackLink";
import { useAuth } from "@/context/AuthContext";
import { SaveToCollection } from "@/components/paper/SaveToCollection";
import { NoteEditor } from "@/components/library/NoteEditor";
import { FollowTopicButton } from "@/components/ui/FollowTopicButton";
import { useSaves } from "@/lib/saves-context";
import { SCHOOLS } from "@/types/crc";
import { CitationMetrics } from "@/components/paper/CitationMetrics";
import { LinkedDiscussions } from "@/components/paper/LinkedDiscussions";
import { ShareButton } from "@/components/feed/ShareButton";
import { PrestigeTier } from "@/components/ui/PrestigeTier";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { getAlsoSaved, getPaper } from "@/lib/api";
import { authorNames, cx, fmtInt, fmtPagerank } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { PanelHeading } from "@/components/paper/PanelHeading";
import type { AlsoSavedPaper, PaperDetail as PaperType } from "@/types/crc";

const SOURCE_LABELS: Record<string, string> = { openalex: "OpenAlex", arxiv: "arXiv", rss: "RSS feed", crossref: "Crossref", external: "External" };
/** Abstracts longer than this start collapsed, so the abstract and the details card beside it line up. */
const ABSTRACT_PREVIEW = 900;

/** Why a "readers also saved" suggestion appears. */
function alsoSavedReason(item: AlsoSavedPaper) {
  if (item.reason === "association_rule") {
    return `Saved together · ${Math.round((item.confidence ?? 0) * 100)}% of readers · lift ${(item.lift ?? 0).toFixed(1)}`;
  }
  if (item.reason === "co_saved") {
    const n = item.shared_savers ?? 1;
    return `In the library of ${n} reader${n === 1 ? "" : "s"} who saved this`;
  }
  return `Similar topic · ${Math.round((item.similarity ?? 0) * 100)}% match`;
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <dt className="text-label text-stone-500">{label}</dt>
      <dd className="num mt-1 truncate text-ui font-semibold text-ink">{children}</dd>
    </div>
  );
}

function ReaderActivity({ paperId }: { paperId: string }) {
  const alsoSaved = useAsync((signal) => getAlsoSaved(paperId, signal), [paperId]);
  return (
    <section className="card flex h-full min-w-0 flex-col" aria-label="Readers also saved">
      <PanelHeading eyebrow="Reader activity" title="Readers also saved" icon={Bookmark} count={alsoSaved.data?.length} />
      <div className="crc-scroll max-h-[26rem] flex-1 overflow-y-auto px-5">
        {alsoSaved.loading && !alsoSaved.data ? <SkeletonCard rows={3} className="my-4 border-0" />
          : alsoSaved.error ? <ErrorState className="my-4" error={alsoSaved.error} onRetry={alsoSaved.reload} />
            : !alsoSaved.data?.length ? <EmptyState className="py-8" title="No related saves yet" hint="Suggestions appear as readers organise their libraries." />
              : (
                <ul className="divide-y divide-stone-100">
                  {alsoSaved.data.map((item) => (
                    <li key={item.paper_id} className="py-3">
                      <Link href={`/papers/${item.paper_id}`} className="line-clamp-2 text-ui font-medium leading-snug text-ink hover:underline">{item.canonical_title}</Link>
                      <p className="mt-1 text-label text-stone-500">{item.publication_year ?? "Year unavailable"} · {fmtInt(item.save_count)} saves</p>
                      <p className="mt-0.5 text-label font-medium text-brand-600">{alsoSavedReason(item)}</p>
                    </li>
                  ))}
                </ul>
              )}
      </div>
    </section>
  );
}

function PaperView({ paper }: { paper: PaperType }) {
  const { savedIds } = useSaves();
  const savedNow = savedIds.has(paper.paper_id) || paper.is_saved;
  const authors = authorNames(paper.authors);
  const abstract = paper.abstract || "";
  const longAbstract = abstract.length > ABSTRACT_PREVIEW;
  const [expanded, setExpanded] = useState(false);
  const topics = paper.topics ?? [];
  const links = [
    paper.doi && { href: paper.doi.startsWith("http") ? paper.doi : `https://doi.org/${paper.doi}`, label: "DOI" },
    paper.arxiv_id && { href: `https://arxiv.org/abs/${paper.arxiv_id}`, label: `arXiv:${paper.arxiv_id}` },
    paper.url && { href: paper.url, label: "Read the original" },
  ].filter(Boolean) as Array<{ href: string; label: string }>;

  return (
    <div className="space-y-5">
      <BackLink fallbackHref="/library" fallbackLabel="Library" />

      {/* Title, bibliographic line, and every action in one bar, so nothing important sits off to the side. */}
      <header className="card p-5 sm:p-7">
        <p className="eyebrow">{paper.item_type === "article" ? "Article" : "Research paper"}</p>
        <h1 className="mt-2 font-display text-h1 tracking-tight text-ink">{paper.canonical_title}</h1>
        <p className="mt-3 text-body text-stone-700">{authors.join(", ") || "Authors not listed"}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta">
          <span className="text-stone-500">{[paper.venue, paper.publication_year].filter(Boolean).join(" · ") || "Publication details unavailable"}</span>
          {links.map((link) => (
            <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-stone-600 hover:text-ink">
              {link.label} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-5" aria-label="Your actions">
          <SaveToCollection paperId={paper.paper_id} isSaved={paper.is_saved} />
          <Link href={`/assistant?paper=${paper.paper_id}&q=${encodeURIComponent("Summarize this paper’s main contribution")}`} className="btn"><Sparkles className="h-4 w-4" /> Ask the research assistant</Link>
          <Link href={`/feed?attach=${paper.paper_id}`} className="btn"><MessageSquarePlus className="h-4 w-4" /> Discuss this paper</Link>
          <ShareButton url={`/papers/${paper.paper_id}`} />
        </div>
        {savedNow && <NoteEditor className="mt-4" paperId={paper.paper_id} initial={paper.private_notes} />}
      </header>

      {/* At-a-glance numbers. */}
      <dl className="card grid grid-cols-2 gap-px overflow-hidden bg-stone-100 sm:grid-cols-3 lg:grid-cols-6 [&>*]:bg-paper">
        <div className="min-w-0 px-4 py-3">
          <dt className="text-label text-stone-500">Prestige</dt>
          <dd className="mt-1"><PrestigeTier percentile={paper.pagerank_percentile} score={paper.pagerank_score} /></dd>
        </div>
        <Stat label="PageRank">{fmtPagerank(paper.pagerank_score)}</Stat>
        <Stat label="Saved by">{fmtInt(paper.save_count)} {paper.save_count === 1 ? "member" : "members"}</Stat>
        <Stat label="References">{fmtInt(paper.cites_count)}</Stat>
        <Stat label="Cited by">{fmtInt(paper.cited_by_count)}</Stat>
        <Stat label="Discussions">{fmtInt(paper.related_posts.length)}</Stat>
      </dl>

      {/* Abstract beside the record details; both cards stretch to the same height. */}
      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card min-w-0 p-5 sm:p-7" aria-label="Abstract">
          <p className="eyebrow inline-flex items-center gap-1.5"><BookOpen className="h-4 w-4" /> Abstract</p>
          <p className={cx("mt-3 whitespace-pre-wrap text-body leading-7 text-stone-700", longAbstract && !expanded && "line-clamp-[10]")}>
            {abstract || "No abstract is available for this paper."}
          </p>
          {longAbstract && (
            <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2 text-meta font-semibold text-brand-600 hover:underline">
              {expanded ? "Show less" : "Read the full abstract"}
            </button>
          )}
        </section>

        <aside className="card min-w-0 space-y-5 p-5" aria-label="About this record">
          <div>
            <p className="eyebrow">Topics</p>
            {topics.length === 0 ? <p className="mt-2 text-meta text-stone-500">No topics recorded.</p> : (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {topics.map((topic) => (
                  <li key={topic} className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-canvas py-0.5 pl-3 pr-0.5 text-meta text-stone-700">
                    <Link href={`/search?q=${encodeURIComponent(topic)}`} className="hover:underline">{topic}</Link>
                    {!(SCHOOLS as readonly string[]).includes(topic) ? <FollowTopicButton topic={topic} compact /> : <span className="w-2" />}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {paper.source_records.length > 0 && (
            <div className="border-t border-stone-100 pt-4">
              <p className="eyebrow">Found in</p>
              <p className="mt-1 text-label text-stone-500">
                {paper.source_records.length > 1 ? "Duplicate records from these sources were merged into this entry." : "Where this record came from."}
              </p>
              <ul className="mt-2 space-y-1.5">
                {paper.source_records.map((record) => (
                  <li key={`${record.source_name}-${record.external_id}`} className="flex items-center justify-between gap-3 text-meta">
                    <span className="font-medium text-ink">{SOURCE_LABELS[record.source_name] ?? record.source_name}</span>
                    {record.source_url ? (
                      <a href={record.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 text-stone-500 hover:text-ink">
                        <span className="truncate">{record.external_id?.startsWith("rss:") ? "Open" : (record.external_id ?? "Open").replace(/^https?:\/\/[^/]+\//, "")}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      </a>
                    ) : (
                      <span className="truncate text-stone-400">{record.external_id}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="border-t border-stone-100 pt-4 text-label leading-relaxed text-stone-500">
            Prestige is this paper’s PageRank percentile in the Chanakya citation graph.
          </p>
        </aside>
      </div>

      {/* Citation graph, campus discussion and reader activity side by side, equal height, each scrolling on its own. */}
      <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <CitationMetrics paper={paper} />
        <LinkedDiscussions paper={paper} />
        <div className="md:col-span-2 xl:col-span-1"><ReaderActivity paperId={paper.paper_id} /></div>
      </div>
    </div>
  );
}

export function PaperDetail({ paperId }: { paperId: string }) {
  const { user } = useAuth();
  // Per member: the response carries their saved state and private note.
  const { data, error, loading, reload } = useAsync((signal) => getPaper(paperId, signal), [paperId, user?.user_id], true, `paper:${paperId}:${user?.user_id ?? "anon"}`);
  useEffect(() => {
    if (data) document.title = `${data.canonical_title} · Chanakya Research Commons`;
  }, [data]);
  if (loading && !data) return <div className="space-y-5"><SkeletonCard rows={4} /><SkeletonCard rows={4} /></div>;
  if (error || !data) {
    if (error instanceof Error && "status" in error && error.status === 404) return <EmptyState title="This paper isn’t available" action={<Link href="/library" className="btn">Browse the library</Link>} />;
    return <div className="card"><ErrorState error={error ?? "Paper unavailable"} onRetry={reload} /></div>;
  }
  return <PaperView paper={data} />;
}
