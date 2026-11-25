"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/Section";
import { RelatedTopics } from "@/components/search/RelatedTopics";
import { FollowTopicButton } from "@/components/ui/FollowTopicButton";
import { DiscussionResult, PaperResult, PersonResult } from "@/components/search/ResultPanels";
import { SkeletonList } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { search } from "@/lib/api";
import { cx } from "@/lib/format";
import { useAsync } from "@/lib/hooks";

const EXAMPLES = ["graph neural networks", "federated learning", "protein structure prediction", "contract law and AI"];

type Tab = "papers" | "people" | "discussions";
type Source = "all" | "library" | "external";
const isTab = (v: string | null): v is Tab => v === "papers" || v === "people" || v === "discussions";
const isSource = (v: string | null): v is Source => v === "all" || v === "library" || v === "external";

const PAPER_PAGE = 20;
const PAPER_MAX = 60;
const OTHER_LIMIT = 10;
const SOURCE_LABELS: Record<Source, string> = { all: "All sources", library: "Chanakya library", external: "Open literature" };

export function SearchWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const tabParam = params.get("tab");
  // Results open on Papers; old links to the removed "All" tab land there too.
  const tab: Tab = isTab(tabParam) ? tabParam : "papers";
  const sourceParam = params.get("source");
  const source: Source = isSource(sourceParam) ? sourceParam : "all";

  // "Load more" asks for a longer paper list; the first page of a query is the only one logged as a search.
  const [paperLimit, setPaperLimit] = useState(PAPER_PAGE);
  useEffect(() => setPaperLimit(PAPER_PAGE), [q]);

  const enabled = q.length >= 2;
  const { data, error, loading, reload } = useAsync(
    (signal) => search(q, signal, { limit: OTHER_LIMIT, paperLimit, log: paperLimit === PAPER_PAGE }),
    [q, paperLimit],
    enabled,
    `search:${q}:${paperLimit}`,
  );

  const go = useCallback((next: string) => {
    const t = next.trim();
    if (t.length < 2) return;
    router.push(`/search?q=${encodeURIComponent(t)}`);
  }, [router]);

  const setParams = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(patch).forEach(([k, v]) => (v === null ? next.delete(k) : next.set(k, v)));
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);
  const setTab = (next: Tab) => setParams({ tab: next === "papers" ? null : next });

  const showing = enabled && data && data.query === q ? data : null;
  const papers = showing ? (source === "library" ? showing.panels.library : source === "external" ? showing.panels.external : showing.panels.papers) : [];
  const people = showing?.panels.people ?? [];
  const posts = showing?.panels.posts ?? [];
  const allPapers = showing?.panels.papers ?? [];
  const total = allPapers.length + people.length + posts.length;

  if (!enabled) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Search" title="Search the research commons" description="One search across papers (the Chanakya library and open literature), university scholars and campus discussions." />
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-meta text-stone-500">Try</span>
          {EXAMPLES.map((example) => (
            <button key={example} type="button" onClick={() => go(example)} className="rounded-full border border-stone-200 bg-paper px-3 py-2 text-ui text-stone-700 hover:bg-sunken">{example}</button>
          ))}
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "papers" as const, label: "Papers", count: showing ? allPapers.length : undefined },
    { id: "people" as const, label: "People", count: showing ? people.length : undefined },
    { id: "discussions" as const, label: "Discussions", count: showing ? posts.length : undefined },
  ];

  const canLoadMore = !!showing && papers.length >= paperLimit && paperLimit < PAPER_MAX;

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-h2 text-ink">Results for “{q}”</h1>
          <FollowTopicButton topic={q} />
        </div>
        {showing && <RelatedTopics topics={showing.related_topics} onPivot={(t) => go(t)} onRefine={(t) => go(`${q} ${t}`)} />}
      </header>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      <section aria-live="polite" aria-busy={loading}>
        {error ? (
          <div className="card"><ErrorState error={error} onRetry={reload} /></div>
        ) : !showing ? (
          <div className="card"><SkeletonList rows={5} /></div>
        ) : total === 0 ? (
          <div className="card"><EmptyState title={`Nothing found for “${q}”`} hint="Papers, people and discussions all came back empty. Try fewer or more general words." /></div>
        ) : tab === "papers" ? (
          <div className="animate-rise space-y-3">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Paper source">
              {(Object.keys(SOURCE_LABELS) as Source[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setParams({ source: key === "all" ? null : key })}
                  aria-pressed={source === key}
                  className={cx("rounded-full px-3.5 py-1.5 text-meta font-semibold transition", source === key ? "bg-brand-600 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200")}
                >
                  {SOURCE_LABELS[key]}
                </button>
              ))}
              <span className="num ml-1 text-meta text-stone-500">Top {papers.length} {papers.length === 1 ? "match" : "matches"}</span>
            </div>
            <div className="card overflow-hidden">
              {papers.length ? <ul className="divide-y divide-stone-100">{papers.map((p) => <PaperResult key={p.paper_id} paper={p} />)}</ul> : <EmptyState className="py-10" title={`No ${source === "library" ? "library" : "open-literature"} papers matched`} hint="Try another source or broader words." />}
              {canLoadMore && (
                <div className="flex justify-center border-t border-stone-100 px-4 py-4">
                  <button type="button" className="btn" disabled={loading} onClick={() => setPaperLimit((n) => Math.min(PAPER_MAX, n + PAPER_PAGE))}>
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />} Load more papers
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : tab === "people" ? (
          <div className="card animate-rise overflow-hidden">
            {people.length ? <ul className="divide-y divide-stone-100">{people.map((u) => <PersonResult key={u.user_id} person={u} />)}</ul> : <EmptyState className="py-10" title="No scholars matched" />}
          </div>
        ) : (
          <div className="card animate-rise overflow-hidden">
            {posts.length ? <ul className="divide-y divide-stone-100">{posts.map((p) => <DiscussionResult key={p.post_id} post={p} />)}</ul> : <EmptyState className="py-10" title="No discussions matched" />}
          </div>
        )}
      </section>
    </div>
  );
}
