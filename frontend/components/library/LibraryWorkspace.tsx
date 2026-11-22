"use client";

import { useMemo, useState } from "react";
import { FolderOpen, Search } from "lucide-react";
import { PaperDrawer } from "@/components/library/PaperDrawer";
import { PaperRow } from "@/components/library/PaperRow";
import { Meter } from "@/components/ui/Meter";
import { SaveButton } from "@/components/ui/SaveButton";
import { PageHeader, Panel } from "@/components/ui/Section";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { SkeletonCard, SkeletonList } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { ApiError, getCollections, getHoldings, getRecommendations } from "@/lib/api";
import { fmtPct } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useMember } from "@/lib/member-context";
import { useSaves } from "@/lib/saves-context";
import type { Collection, Paper, SavedPaper } from "@/types/crc";

type View = "holdings" | "saves" | "collections";
type SortKey = "saves" | "prestige" | "year";

function sortPapers<T extends Paper>(list: T[], by: SortKey): T[] {
  const copy = [...list];
  if (by === "saves") copy.sort((a, b) => b.save_count - a.save_count || b.pagerank_score - a.pagerank_score);
  if (by === "prestige") copy.sort((a, b) => b.pagerank_score - a.pagerank_score);
  if (by === "year") copy.sort((a, b) => (b.publication_year ?? 0) - (a.publication_year ?? 0));
  return copy;
}

export function LibraryWorkspace() {
  const { current, status } = useMember();
  const saves = useSaves();
  const userId = current?.user_id ?? null;

  const [view, setView] = useState<View>("holdings");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("saves");
  const [open, setOpen] = useState<Paper | SavedPaper | null>(null);

  const holdings = useAsync((s) => getHoldings(60, s), []);
  const recs = useAsync((s) => getRecommendations(userId!, s), [userId], status === "ready" && !!userId);
  const collections = useAsync((s) => getCollections(userId!, s), [userId], view === "collections" && !!userId);

  const match = (p: Paper) => {
    const f = filter.trim().toLowerCase();
    if (!f) return true;
    return `${p.canonical_title} ${p.venue ?? ""} ${(p.topics ?? []).join(" ")}`.toLowerCase().includes(f);
  };

  const holdingRows = useMemo(() => sortPapers((holdings.data ?? []).filter(match), sort), [holdings.data, filter, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveRows = useMemo(() => sortPapers(saves.saves.filter(match), sort), [saves.saves, filter, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const openById = (id: string) => {
    const hit = [...saves.saves, ...(holdings.data ?? [])].find((p) => p.paper_id === id);
    if (hit) setOpen(hit);
  };

  // Collections: prefer the endpoint; otherwise group the member's saves if they carry a collection.
  const derived = useMemo<Collection[]>(() => {
    const m = new Map<string, Collection>();
    for (const s of saves.saves) {
      if (!s.collection_id) continue;
      const c = m.get(s.collection_id) ?? {
        collection_id: s.collection_id,
        name: s.collection_name ?? "Untitled collection",
        description: null,
        papers: [],
      };
      c.papers!.push(s);
      m.set(s.collection_id, c);
    }
    return [...m.values()].map((c) => ({ ...c, paper_count: c.papers!.length }));
  }, [saves.saves]);

  const collectionList: Collection[] | null = collections.data ?? (derived.length > 0 ? derived : null);
  const collectionsUnsupported = collections.error instanceof ApiError && collections.error.kind === "unsupported";

  const tabs = [
    { id: "holdings" as const, label: "Chanakya holdings", count: holdings.data?.length },
    { id: "saves" as const, label: "My saves", count: saves.status === "ready" ? saves.saves.length : undefined },
    { id: "collections" as const, label: "Collections" },
  ];

  const list = view === "holdings" ? holdingRows : saveRows;
  const maxRank = Math.max(0, ...list.map((p) => p.pagerank_score));
  const loading = view === "holdings" ? holdings.loading && !holdings.data : saves.status === "loading" && saves.saves.length === 0;
  const listError = view === "holdings" ? holdings.error : saves.status === "error" ? saves.error : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Repository"
        title="Chanakya Library"
        description="The university's shared shelf of canonical papers, plus the ones you've saved and organised — each with citation prestige at a glance."
      />

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="min-w-0 space-y-4 lg:col-span-8">
          <Tabs tabs={tabs} value={view} onChange={setView} />

          {view !== "collections" && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter by title, venue or topic…"
                  aria-label="Filter papers"
                  className="input pl-9"
                />
              </div>
              <label className="flex items-center gap-2 text-[12.5px] text-stone-500">
                Sort
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="input w-auto py-1.5 pr-8 text-[13px]">
                  <option value="saves">Most saved</option>
                  <option value="prestige">PageRank</option>
                  <option value="year">Newest</option>
                </select>
              </label>
            </div>
          )}

          <div className="card overflow-hidden">
            {view === "collections" ? (
              collections.loading && !collections.data ? (
                <SkeletonList rows={3} />
              ) : collectionList && collectionList.length > 0 ? (
                <ul className="divide-y divide-stone-100">
                  {collectionList.map((c) => (
                    <li key={c.collection_id} className="px-5 py-4">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="flex items-center gap-2 font-serif text-[18px] text-ink">
                          <FolderOpen className="h-4 w-4 text-stone-400" strokeWidth={1.5} />
                          {c.name}
                        </h3>
                        <span className="num text-[12px] text-stone-400">{c.paper_count ?? c.papers?.length ?? 0} papers</span>
                      </div>
                      {c.description && <p className="mt-1 text-[13.5px] text-stone-500">{c.description}</p>}
                      {c.papers && c.papers.length > 0 && (
                        <ul className="mt-3 space-y-1.5 border-l border-stone-200 pl-4">
                          {c.papers.slice(0, 6).map((p) => (
                            <li key={p.paper_id}>
                              <button type="button" onClick={() => setOpen(p)} className="text-left text-[13.5px] text-stone-700 hover:text-ink hover:underline">
                                {p.canonical_title}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              ) : collectionsUnsupported ? (
                <ErrorState
                  error={collections.error}
                  className="py-12"
                />
              ) : collections.error ? (
                <ErrorState error={collections.error} onRetry={collections.reload} />
              ) : (
                <EmptyState
                  icon={<FolderOpen className="h-6 w-6" strokeWidth={1.5} />}
                  title="No collections yet"
                  hint="Collections you create to organise saved papers will appear here."
                />
              )
            ) : loading ? (
              <SkeletonList rows={4} />
            ) : listError ? (
              <ErrorState error={listError} onRetry={view === "holdings" ? holdings.reload : saves.refresh} />
            ) : list.length === 0 ? (
              <EmptyState
                title={filter ? "No papers match that filter" : view === "saves" ? "You haven't saved anything yet" : "The library is empty"}
                hint={
                  filter
                    ? "Try a different word, or clear the filter."
                    : view === "saves"
                      ? "Use Save on any search result and it will land here."
                      : "Papers appear here once members save them."
                }
              />
            ) : (
              <ul className="divide-y divide-stone-100">
                {list.map((p) => (
                  <PaperRow key={p.paper_id} paper={p} maxRank={maxRank} onOpen={setOpen} />
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside className="lg:col-span-4">
          <div className="lg:sticky lg:top-24">
            <Panel eyebrow="For you" title="Recommended reading" bodyClassName="max-h-[620px] overflow-y-auto">
              {recs.loading && !recs.data ? (
                <SkeletonCard rows={3} className="border-0" />
              ) : recs.error ? (
                <ErrorState compact error={recs.error} onRetry={recs.reload} />
              ) : !recs.data || recs.data.papers.length === 0 ? (
                <EmptyState className="py-8" title="Nothing to recommend yet" hint="Save a few papers to tune your profile." />
              ) : (
                <ul className="divide-y divide-stone-100">
                  {recs.data.papers.map((p) => (
                    <li key={p.paper_id} className="space-y-2 px-4 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            setOpen({
                              ...p,
                              abstract: null,
                              authors: null,
                              topics: p.topics,
                            })
                          }
                          className="text-left font-serif text-[15.5px] leading-snug text-ink hover:underline hover:decoration-stone-300 hover:underline-offset-[3px]"
                        >
                          {p.canonical_title}
                        </button>
                        <SaveButton paperId={p.paper_id} className="shrink-0" />
                      </div>
                      <div className="flex items-center gap-2.5 whitespace-nowrap text-[12px] text-stone-500">
                        <Meter value={p.match_score} tone="sage" className="min-w-0 flex-1" label="Match" />
                        <span className="num shrink-0">{fmtPct(p.match_score)} match</span>
                        <span className="num shrink-0 text-stone-400">{p.publication_year ?? "—"}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </aside>
      </div>

      <PaperDrawer paper={open} onClose={() => setOpen(null)} onOpenPaper={openById} />
    </div>
  );
}
