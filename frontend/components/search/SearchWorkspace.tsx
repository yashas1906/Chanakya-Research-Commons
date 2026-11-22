"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/Section";
import { SearchBar } from "@/components/search/SearchBar";
import { RelatedTopics } from "@/components/search/RelatedTopics";
import { ExternalPanel, LibraryPanel, PeoplePanel, PostsPanel } from "@/components/search/ResultPanels";
import { PaperDrawer } from "@/components/library/PaperDrawer";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { search } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import type { Paper } from "@/types/crc";

const EXAMPLES = ["graph neural networks", "federated learning", "protein structure prediction", "contract law and AI"];

export function SearchWorkspace() {
  const router = useRouter();
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const [draft, setDraft] = useState(q);
  const [open, setOpen] = useState<Paper | null>(null);

  useEffect(() => setDraft(q), [q]);

  const enabled = q.length >= 2;
  const { data, error, loading, reload } = useAsync((signal) => search(q, signal), [q], enabled);

  const go = useCallback(
    (next: string) => {
      const t = next.trim();
      if (t.length < 2) return;
      router.push(`/?q=${encodeURIComponent(t)}`);
    },
    [router],
  );

  const openById = (id: string) => {
    const all = [...(data?.panels.library ?? []), ...(data?.panels.external ?? [])];
    const hit = all.find((p) => p.paper_id === id);
    if (hit) setOpen(hit);
  };

  const showing = enabled && data && data.query === q ? data : null;
  const total = showing
    ? showing.panels.library.length + showing.panels.external.length + showing.panels.people.length + showing.panels.posts.length
    : 0;

  return (
    <div className="space-y-8">
      {!enabled && (
        <PageHeader
          className="mx-auto max-w-3xl justify-center pt-8 text-center [&>div]:mx-auto"
          eyebrow="Hybrid search"
          title="Find the work, the people and the conversation."
          description="One query across the Chanakya Library, open scholarly literature, university researchers and campus discussions — ranked by meaning, keywords and citation prestige."
        />
      )}

      <div className="space-y-4">
        <SearchBar value={draft} onChange={setDraft} onSubmit={go} loading={loading && enabled} />
        {showing && (
          <RelatedTopics
            topics={showing.related_topics}
            onPivot={(t) => go(t)}
            onRefine={(t) => go(`${q} ${t}`)}
          />
        )}
        {!enabled && (
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-2 pt-1">
            <span className="text-[12px] text-stone-400">Try</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => go(ex)}
                className="rounded-full border border-stone-200/90 bg-paper px-3 py-1 text-[12.5px] text-stone-600 transition-colors duration-150 hover:border-stone-300 hover:bg-sunken hover:text-ink"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>

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
              <p className="num text-[12.5px] text-stone-500">
                {total} results for <span className="font-medium text-stone-800">“{showing.query}”</span> across four sources
              </p>
              <div className="grid gap-5 lg:grid-cols-2">
                <LibraryPanel papers={showing.panels.library} onOpen={setOpen} />
                <ExternalPanel papers={showing.panels.external} onOpen={setOpen} />
                <PeoplePanel people={showing.panels.people} />
                <PostsPanel posts={showing.panels.posts} />
              </div>
            </div>
          )}
        </section>
      )}

      <PaperDrawer paper={open} onClose={() => setOpen(null)} onOpenPaper={openById} />
    </div>
  );
}
