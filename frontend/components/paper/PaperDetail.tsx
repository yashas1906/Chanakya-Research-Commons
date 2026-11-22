"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { SaveToCollection } from "@/components/paper/SaveToCollection";
import { CitationMetrics } from "@/components/paper/CitationMetrics";
import { LinkedDiscussions } from "@/components/paper/LinkedDiscussions";
import { ShareButton } from "@/components/feed/ShareButton";
import { PrestigeTier } from "@/components/ui/PrestigeTier";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { getAlsoSaved, getPaper } from "@/lib/api";
import { authorNames, fmtInt, fmtPagerank } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import type { PaperDetail as PaperType } from "@/types/crc";

function PaperView({ paper }: { paper: PaperType }) {
  const alsoSaved = useAsync((signal) => getAlsoSaved(paper.paper_id, signal), [paper.paper_id]);
  const authors = authorNames(paper.authors);
  return (
    <div className="space-y-8">
      <Link href="/library" className="inline-flex items-center gap-2 text-ui font-medium text-stone-600 hover:text-ink"><ArrowLeft className="h-4 w-4" />Library</Link>
      <header className="max-w-4xl">
        <p className="eyebrow">Research paper</p>
        <h1 className="mt-2 font-serif text-h1 tracking-tight text-ink">{paper.canonical_title}</h1>
        <p className="mt-3 text-body text-stone-700">{authors.join(", ") || "Authors not listed"}</p>
        <p className="mt-1 text-meta text-stone-500">{[paper.venue, paper.publication_year].filter(Boolean).join(" · ") || "Publication details unavailable"}</p>
        <div className="mt-3 flex flex-wrap gap-4 text-meta">
          {paper.doi && <a href={paper.doi.startsWith("http") ? paper.doi : `https://doi.org/${paper.doi}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-stone-600 hover:text-ink">DOI <ExternalLink className="h-3.5 w-3.5" /></a>}
          {paper.arxiv_id && <a href={`https://arxiv.org/abs/${paper.arxiv_id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-stone-600 hover:text-ink">arXiv:{paper.arxiv_id} <ExternalLink className="h-3.5 w-3.5" /></a>}
        </div>
      </header>

      <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0 space-y-8">
          <section className="card p-5 sm:p-7">
            <p className="eyebrow">Abstract</p>
            <p className="mt-3 max-w-prose whitespace-pre-wrap text-body leading-7 text-stone-700">{paper.abstract || "No abstract is available for this paper."}</p>
            {paper.topics && paper.topics.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{paper.topics.map((topic) => <Link key={topic} href={`/search?q=${encodeURIComponent(topic)}`} className="rounded-full border border-stone-200 bg-canvas px-3 py-1.5 text-meta text-stone-700 hover:bg-sunken">{topic}</Link>)}</div>}
          </section>
          <section className="card space-y-5 p-5 sm:p-7"><div><p className="eyebrow">Citation graph</p><h2 className="mt-1 font-serif text-h2 text-ink">Influence in the corpus</h2></div><CitationMetrics paper={paper} /></section>
          <LinkedDiscussions paper={paper} />
          <section className="card p-5 sm:p-7">
            <p className="eyebrow">Reader activity</p><h2 className="mt-1 font-serif text-h2 text-ink">Readers also saved</h2>
            {alsoSaved.loading && !alsoSaved.data ? <SkeletonCard rows={3} className="mt-4 border-0" />
              : alsoSaved.error ? <ErrorState className="mt-4" error={alsoSaved.error} onRetry={alsoSaved.reload} />
                : !alsoSaved.data?.length ? <EmptyState title="No related saves yet" hint="More suggestions appear as readers organise their libraries." />
                  : <ul className="mt-4 divide-y divide-stone-100">{alsoSaved.data.map((item) => <li key={item.paper_id} className="py-3"><Link href={`/papers/${item.paper_id}`} className="font-serif text-h3 text-ink hover:underline">{item.canonical_title}</Link><p className="mt-1 text-meta text-stone-500">{item.publication_year ?? "Year unavailable"} · {fmtInt(item.save_count)} saves</p></li>)}</ul>}
          </section>
        </main>
        <aside className="min-w-0 space-y-5">
          <section className="card space-y-4 p-5">
            <p className="eyebrow">Corpus prestige</p>
            <PrestigeTier percentile={paper.pagerank_percentile} score={paper.pagerank_score} />
            <p className="text-meta text-stone-600">Citation-graph prestige within the Chanakya corpus.</p>
            <dl className="grid grid-cols-2 gap-3 border-t border-stone-100 pt-4"><div><dt className="text-meta text-stone-500">PageRank</dt><dd className="num mt-1 text-ui font-medium text-ink">{fmtPagerank(paper.pagerank_score)}</dd></div><div><dt className="text-meta text-stone-500">Saved by</dt><dd className="num mt-1 text-ui font-medium text-ink">{fmtInt(paper.save_count)} members</dd></div></dl>
            <SaveToCollection paperId={paper.paper_id} isSaved={paper.is_saved} />
            <Link href={`/assistant?paper=${paper.paper_id}&q=${encodeURIComponent("Summarize this paper’s main contribution")}`} className="btn flex w-full">Ask the RAG assistant</Link>
            <ShareButton url={`/papers/${paper.paper_id}`} />
          </section>
          {paper.references.length > 0 && <section className="card p-5"><p className="eyebrow">Quick references</p><p className="mt-1 text-meta text-stone-500">{paper.cites_count} references · {paper.cited_by_count} citations</p><ul className="mt-3 space-y-2">{paper.references.slice(0, 4).map((reference) => <li key={reference.paper_id}><Link href={`/papers/${reference.paper_id}`} className="text-meta text-stone-700 hover:text-ink hover:underline">{reference.canonical_title}</Link></li>)}</ul></section>}
        </aside>
      </div>
    </div>
  );
}

export function PaperDetail({ paperId }: { paperId: string }) {
  const { data, error, loading, reload } = useAsync((signal) => getPaper(paperId, signal), [paperId]);
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
