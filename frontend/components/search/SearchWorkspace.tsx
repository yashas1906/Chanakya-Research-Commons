"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/Section";
import { RelatedTopics } from "@/components/search/RelatedTopics";
import { ExternalPanel, LibraryPanel, PeoplePanel, PostsPanel } from "@/components/search/ResultPanels";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { search } from "@/lib/api";
import { useAsync } from "@/lib/hooks";

const EXAMPLES = ["graph neural networks", "federated learning", "protein structure prediction", "contract law and AI"];

export function SearchWorkspace() {
  const router = useRouter();
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim();

  const enabled = q.length >= 2;
  const { data, error, loading, reload } = useAsync((signal) => search(q, signal), [q], enabled);

  const go = useCallback(
    (next: string) => {
      const t = next.trim();
      if (t.length < 2) return;
      router.push(`/search?q=${encodeURIComponent(t)}`);
    },
    [router],
  );

  const showing = enabled && data && data.query === q ? data : null;
  const total = showing
    ? showing.panels.library.length + showing.panels.external.length + showing.panels.people.length + showing.panels.posts.length
    : 0;

  return (
    <div className="space-y-8">
      {!enabled && (
        <PageHeader
          eyebrow="Hybrid search"
          title="Search the research commons"
          description="Results span Chanakya holdings, open literature, university scholars and campus discussions. Use the persistent search field above to begin."
        />
      )}

      {showing && (
        <div className="space-y-4">
          <p className="text-meta text-stone-600">Results for <span className="font-medium text-ink">“{showing.query}”</span></p>
          <RelatedTopics
            topics={showing.related_topics}
            onPivot={(t) => go(t)}
            onRefine={(t) => go(`${q} ${t}`)}
          />
        </div>
      )}
      {!enabled && <div className="flex flex-wrap gap-2">
        <span className="self-center text-meta text-stone-500">Try</span>
        {EXAMPLES.map((example) => <button key={example} type="button" onClick={() => go(example)} className="rounded-full border border-stone-200 bg-paper px-3 py-2 text-ui text-stone-700 hover:bg-sunken">{example}</button>)}
      </div>}

      {enabled && (
        <section aria-live="polite" aria-busy={loading}>
          {error ? (
            <div className="card">
              <ErrorState error={error} onRetry={reload} />
            </div>
          ) : !showing ? (
            <div className="grid gap-5 lg:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <SkeletonCard key={i} rows={3} />
              ))}
            </div>
          ) : total === 0 ? (
            <div className="card">
              <EmptyState
                title={`Nothing found for “${q}”`}
                hint="The library, external index, people and posts all came back empty. Try fewer or more general words."
              />
            </div>
          ) : (
            <div className="animate-rise space-y-3">
              <p className="num text-meta text-stone-500">
                {total} results for <span className="font-medium text-stone-800">“{showing.query}”</span> across four sources
              </p>
              <div className="grid gap-5 lg:grid-cols-2">
                <LibraryPanel papers={showing.panels.library} />
                <ExternalPanel papers={showing.panels.external} />
                <PeoplePanel people={showing.panels.people} />
                <PostsPanel posts={showing.panels.posts} />
              </div>
            </div>
          )}
        </section>
      )}

    </div>
  );
}
