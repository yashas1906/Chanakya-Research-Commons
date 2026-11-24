"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ExternalLink, MessageSquarePlus, Sparkles } from "lucide-react";
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
import { authorNames, fmtInt, fmtPagerank } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import type { AlsoSavedPaper, PaperDetail as PaperType } from "@/types/crc";

const SOURCE_LABELS: Record<string, string> = { openalex: "OpenAlex", arxiv: "arXiv", rss: "RSS feed", crossref: "Crossref", external: "External" };

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

function PaperView({ paper }: { paper: PaperType }) {
  const alsoSaved = useAsync((signal) => getAlsoSaved(paper.paper_id, signal), [paper.paper_id]);
  const { savedIds } = useSaves();
  const savedNow = savedIds.has(paper.paper_id) || paper.is_saved;
  const authors = authorNames(paper.authors);
  return (
    <div className="space-y-8">
      <BackLink fallbackHref="/library" fallbackLabel="Library" />
      <header className="max-w-4xl">
        <p className="eyebrow">{paper.item_type === "article" ? "Article" : "Research paper"}</p>
        <h1 className="mt-2 font-display text-h1 tracking-tight text-ink">{paper.canonical_title}</h1>
        <p className="mt-3 text-body text-stone-700">{authors.join(", ") || "Authors not listed"}</p>
        <p className="mt-1 text-meta text-stone-500">{[paper.venue, paper.publication_year].filter(Boolean).join(" · ") || "Publication details unavailable"}</p>
        <div className="mt-3 flex flex-wrap gap-4 text-meta">
          {paper.doi && <a href={paper.doi.startsWith("http") ? paper.doi : `https://doi.org/${paper.doi}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-stone-600 hover:text-ink">DOI <ExternalLink className="h-3.5 w-3.5" /></a>}
          {paper.arxiv_id && <a href={`https://arxiv.org/abs/${paper.arxiv_id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-stone-600 hover:text-ink">arXiv:{paper.arxiv_id} <ExternalLink className="h-3.5 w-3.5" /></a>}
          {paper.url && <a href={paper.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-stone-600 hover:text-ink">Read the original <ExternalLink className="h-3.5 w-3.5" /></a>}
        </div>
      </header>

      <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0 space-y-8">
          <section className="card p-5 sm:p-7">
            <p className="eyebrow">Abstract</p>
            <p className="mt-3 max-w-prose whitespace-pre-wrap text-body leading-7 text-stone-700">{paper.abstract || "No abstract is available for this paper."}</p>
            {paper.topics && paper.topics.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{paper.topics.map((topic) => (
              <span key={topic} className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-canvas py-1 pl-3 pr-1 text-meta text-stone-700">
                <Link href={`/search?q=${encodeURIComponent(topic)}`} className="hover:underline">{topic}</Link>
                {!(SCHOOLS as readonly string[]).includes(topic) ? <FollowTopicButton topic={topic} compact /> : <span className="w-1" />}
              </span>
            ))}</div>}
          </section>
          <section className="card space-y-5 p-5 sm:p-7"><div><p className="eyebrow">Citation graph</p><h2 className="mt-1 font-display text-h2 text-ink">Influence in the corpus</h2></div><CitationMetrics paper={paper} /></section>
          <LinkedDiscussions paper={paper} />
          <section className="card p-5 sm:p-7">
            <p className="eyebrow">Reader activity</p><h2 className="mt-1 font-display text-h2 text-ink">Readers also saved</h2>
            {alsoSaved.loading && !alsoSaved.data ? <SkeletonCard rows={3} className="mt-4 border-0" />
              : alsoSaved.error ? <ErrorState className="mt-4" error={alsoSaved.error} onRetry={alsoSaved.reload} />
                : !alsoSaved.data?.length ? <EmptyState title="No related saves yet" hint="More suggestions appear as readers organise their libraries." />
                  : <ul className="mt-4 divide-y divide-stone-100">{alsoSaved.data.map((item) => <li key={item.paper_id} className="py-3"><Link href={`/papers/${item.paper_id}`} className="font-display text-h3 text-ink hover:underline">{item.canonical_title}</Link><p className="mt-1 text-meta text-stone-500">{item.publication_year ?? "Year unavailable"} · {fmtInt(item.save_count)} saves</p><p className="mt-0.5 text-label font-medium text-brand-600">{alsoSavedReason(item)}</p></li>)}</ul>}
          </section>
        </main>
        {/* On phones the aside dissolves ("contents") so the actions card can sit above the abstract and the record card below it. */}
        <aside className="contents lg:block lg:min-w-0 lg:space-y-5">
          <section className="card order-first space-y-3 p-5 lg:order-none" aria-label="Your actions">
            <p className="eyebrow">Your actions</p>
            <SaveToCollection paperId={paper.paper_id} isSaved={paper.is_saved} />
            {savedNow && <NoteEditor paperId={paper.paper_id} initial={paper.private_notes} />}
            <Link href={`/assistant?paper=${paper.paper_id}&q=${encodeURIComponent("Summarize this paper’s main contribution")}`} className="btn flex w-full"><Sparkles className="h-4 w-4" /> Ask the research assistant</Link>
            <Link href={`/feed?attach=${paper.paper_id}`} className="btn flex w-full"><MessageSquarePlus className="h-4 w-4" /> Discuss this paper</Link>
            <ShareButton url={`/papers/${paper.paper_id}`} />
          </section>

          <section className="card min-w-0 p-5" aria-label="About this record">
            <p className="eyebrow">About this record</p>
            <div className="mt-3 space-y-3">
              <PrestigeTier percentile={paper.pagerank_percentile} score={paper.pagerank_score} />
              <p className="text-meta text-stone-600">Citation-graph prestige within the Chanakya corpus.</p>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-stone-100 pt-4"><div><dt className="text-meta text-stone-500">PageRank</dt><dd className="num mt-1 text-ui font-medium text-ink">{fmtPagerank(paper.pagerank_score)}</dd></div><div><dt className="text-meta text-stone-500">Saved by</dt><dd className="num mt-1 text-ui font-medium text-ink">{fmtInt(paper.save_count)} {paper.save_count === 1 ? "member" : "members"}</dd></div></dl>
          {paper.source_records.length > 0 && (
            <div className="mt-4 border-t border-stone-100 pt-4">
              <h3 className="text-meta font-semibold text-ink">Found in</h3>
              <p className="mt-1 text-meta text-stone-500">
                {paper.source_records.length > 1 ? "Duplicate records from these sources were merged into this one entry." : "Where this record came from."}
              </p>
              <ul className="mt-3 space-y-2">
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
          {paper.references.length > 0 && (
            <div className="mt-4 border-t border-stone-100 pt-4">
              <h3 className="text-meta font-semibold text-ink">Quick references</h3>
              <p className="mt-1 text-meta text-stone-500">{paper.cites_count} references · {paper.cited_by_count} citations</p>
              <ul className="mt-3 space-y-2">{paper.references.slice(0, 4).map((reference) => <li key={reference.paper_id}><Link href={`/papers/${reference.paper_id}`} className="text-meta text-stone-700 hover:text-ink hover:underline">{reference.canonical_title}</Link></li>)}</ul>
            </div>
          )}
          </section>
        </aside>
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
