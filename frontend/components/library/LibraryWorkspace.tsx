"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderOpen, Search } from "lucide-react";
import { PaperRow } from "@/components/library/PaperRow";
import { PaperCard } from "@/components/paper/PaperCard";
import { PageHeader, Panel } from "@/components/ui/Section";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { SkeletonCard, SkeletonList } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { ApiError, getCollections, getHoldings, getRecommendations } from "@/lib/api";
import { authorsLine } from "@/lib/format";
import { useAsync, useDebounced } from "@/lib/hooks";
import { useAuth } from "@/context/AuthContext";
import { useSaves } from "@/lib/saves-context";
import { SCHOOLS, type Collection, type Paper, type RecommendedPaper } from "@/types/crc";

type View = "holdings" | "saves" | "collections";
type SortKey = "saves" | "prestige" | "year";
type RankFilter = "all" | "top1" | "top10" | "top25";
const isView = (value: string | null): value is View => value === "holdings" || value === "saves" || value === "collections";
const decade = (year: number | null) => year === null ? "" : `${Math.floor(year / 10) * 10}s`;

function withPercentiles<T extends Paper>(papers: T[]): T[] {
  const sorted = [...papers].sort((a, b) => a.pagerank_score - b.pagerank_score);
  const percentile = new Map<string, number>();
  sorted.forEach((paper, index) => percentile.set(paper.paper_id, sorted.length < 2 ? 0 : index / (sorted.length - 1)));
  return papers.map((paper) => ({ ...paper, pagerank_percentile: paper.pagerank_percentile ?? percentile.get(paper.paper_id) ?? 0 }));
}

function matchesRank(percentile: number | null | undefined, tier: RankFilter) {
  if (tier === "all") return true;
  const value = percentile ?? 0;
  return tier === "top1" ? value >= 0.99 : tier === "top10" ? value >= 0.9 : value >= 0.75;
}

function dedupeRecommendations(papers: RecommendedPaper[]): RecommendedPaper[] {
  const ids = new Set<string>();
  const titles = new Set<string>();
  return papers.filter((paper) => {
    const title = paper.canonical_title.trim().toLowerCase().replace(/\s+/g, " ");
    if (ids.has(paper.paper_id) || titles.has(title)) return false;
    ids.add(paper.paper_id);
    titles.add(title);
    return true;
  });
}

export function LibraryWorkspace() {
  const { user, status: authStatus, promptLogin } = useAuth();
  const saves = useSaves();
  const params = useSearchParams();
  const router = useRouter();
  const [view, setView] = useState<View>(() => isView(params.get("tab")) ? params.get("tab") as View : "holdings");
  const [filter, setFilter] = useState(() => params.get("q") ?? "");
  const [sort, setSort] = useState<SortKey>(() => params.get("sort") === "year" || params.get("sort") === "prestige" ? params.get("sort") as SortKey : "saves");
  const [school, setSchool] = useState(() => params.get("school") ?? "ALL");
  const [year, setYear] = useState(() => params.get("year") ?? "ALL");
  const [tier, setTier] = useState<RankFilter>(() => ["top1", "top10", "top25"].includes(params.get("tier") ?? "") ? params.get("tier") as RankFilter : "all");
  const delayedFilter = useDebounced(filter, 200);
  const userId = user?.user_id ?? null;
  const searchKey = params.toString();

  const holdings = useAsync((signal) => getHoldings(100, signal), []);
  const recs = useAsync((signal) => getRecommendations(userId!, signal), [userId], authStatus === "authenticated" && !!userId);
  const collections = useAsync((signal) => getCollections(userId!, signal), [userId], view === "collections" && authStatus === "authenticated" && !!userId);

  useEffect(() => {
    const query = new URLSearchParams(searchKey);
    setView(isView(query.get("tab")) ? query.get("tab") as View : "holdings");
    setFilter(query.get("q") ?? "");
    setSchool(query.get("school") ?? "ALL");
    setYear(query.get("year") ?? "ALL");
    setTier(["top1", "top10", "top25"].includes(query.get("tier") ?? "") ? query.get("tier") as RankFilter : "all");
    setSort(query.get("sort") === "year" || query.get("sort") === "prestige" ? query.get("sort") as SortKey : "saves");
  }, [searchKey]);

  useEffect(() => {
    const query = new URLSearchParams();
    query.set("tab", view);
    if (delayedFilter) query.set("q", delayedFilter);
    if (school !== "ALL") query.set("school", school);
    if (year !== "ALL") query.set("year", year);
    if (tier !== "all") query.set("tier", tier);
    query.set("sort", sort);
    const next = `?${query.toString()}`;
    if (window.location.search !== next) router.replace(`/library${next}`, { scroll: false });
  }, [view, delayedFilter, school, year, tier, sort, router]);

  const fullHoldings = useMemo(() => withPercentiles(holdings.data ?? []), [holdings.data]);
  const fullSaves = useMemo(() => withPercentiles(saves.saves), [saves.saves]);
  const matches = (paper: Paper) => {
    const query = delayedFilter.trim().toLowerCase();
    const fields = `${paper.canonical_title} ${authorsLine(paper.authors, 20)} ${paper.venue ?? ""} ${(paper.topics ?? []).join(" ")}`.toLowerCase();
    return (!query || fields.includes(query))
      && (school === "ALL" || paper.school === school)
      && (year === "ALL" || decade(paper.publication_year) === year)
      && matchesRank(paper.pagerank_percentile, tier);
  };
  const holdingRows = useMemo(() => fullHoldings.filter(matches), [fullHoldings, delayedFilter, school, year, tier]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveRows = useMemo(() => fullSaves.filter(matches), [fullSaves, delayedFilter, school, year, tier]); // eslint-disable-line react-hooks/exhaustive-deps
  const sortedRows = useMemo(() => {
    const rows = [...(view === "holdings" ? holdingRows : saveRows)];
    if (sort === "saves") rows.sort((a, b) => b.save_count - a.save_count);
    if (sort === "prestige") rows.sort((a, b) => (b.pagerank_percentile ?? 0) - (a.pagerank_percentile ?? 0));
    if (sort === "year") rows.sort((a, b) => (b.publication_year ?? 0) - (a.publication_year ?? 0));
    return rows;
  }, [view, holdingRows, saveRows, sort]);

  const derivedCollections = collections.data ?? [];
  const collectionList: Collection[] = derivedCollections;
  const collectionsUnsupported = collections.error instanceof ApiError && collections.error.kind === "unsupported";
  const tabs = [
    { id: "holdings" as const, label: "Chanakya holdings", count: fullHoldings.length },
    { id: "saves" as const, label: "My saves", count: authStatus === "authenticated" ? saves.saves.length : undefined },
    { id: "collections" as const, label: "Collections" },
  ];
  const rankSource = view === "holdings" ? fullHoldings : fullSaves;
  const years = [...new Set(rankSource.map((paper) => decade(paper.publication_year)).filter(Boolean))].sort().reverse();
  const listLoading = view === "holdings" ? holdings.loading && !holdings.data : authStatus === "loading" || (saves.status === "loading" && saves.saves.length === 0);
  const listError = view === "holdings" ? holdings.error : saves.status === "error" ? saves.error : null;

  const clearFilters = () => { setFilter(""); setSchool("ALL"); setYear("ALL"); setTier("all"); };

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Repository" title="Chanakya Library" description="Explore the university’s shared collection, your saved papers and topic-organised reading." />
      <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Tabs tabs={tabs} value={view} onChange={setView} />
          {view !== "collections" && <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter title, authors, venue or topics" aria-label="Filter papers" className="input pl-10" /></label>
              <select aria-label="Sort papers" value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="input w-auto"><option value="saves">Most saved</option><option value="prestige">PageRank tier</option><option value="year">Newest</option></select>
            </div>
            <div className="flex flex-wrap gap-2">
              <select aria-label="Filter by school" value={school} onChange={(event) => setSchool(event.target.value)} className="rounded-full border border-stone-200 bg-paper px-3 py-2 text-meta text-stone-700"><option value="ALL">All schools</option>{SCHOOLS.map((name) => <option key={name}>{name}</option>)}</select>
              <select aria-label="Filter by decade" value={year} onChange={(event) => setYear(event.target.value)} className="rounded-full border border-stone-200 bg-paper px-3 py-2 text-meta text-stone-700"><option value="ALL">All years</option>{years.map((decadeName) => <option key={decadeName}>{decadeName}</option>)}</select>
              <select aria-label="Filter by PageRank tier" value={tier} onChange={(event) => setTier(event.target.value as RankFilter)} className="rounded-full border border-stone-200 bg-paper px-3 py-2 text-meta text-stone-700"><option value="all">All tiers</option><option value="top1">Top 1%</option><option value="top10">Top 10%</option><option value="top25">Top 25%</option></select>
              <span className="self-center text-meta text-stone-500">{sortedRows.length} results</span>
            </div>
          </div>}

          <div className="card min-w-0 overflow-hidden">
            {view === "collections" ? authStatus !== "authenticated" ? <EmptyState className="py-12" title="Sign in to view collections" action={<button type="button" className="btn-primary" onClick={promptLogin}>Sign in</button>} />
              : collections.loading && !collections.data ? <SkeletonList rows={3} />
                : collections.error ? collectionsUnsupported ? <ErrorState error={collections.error} /> : <ErrorState error={collections.error} onRetry={collections.reload} />
                  : collectionList.length > 0 ? <ul className="divide-y divide-stone-100">{collectionList.map((collection) => <li key={collection.collection_id} className="p-5">
                    <h3 className="flex items-center gap-2 font-serif text-h3 text-ink"><FolderOpen className="h-5 w-5 text-stone-500" />{collection.name}</h3>
                    <p className="mt-1 text-meta text-stone-500">{collection.paper_count ?? 0} papers{collection.description ? ` · ${collection.description}` : ""}</p>
                  </li>)}</ul> : <EmptyState icon={<FolderOpen className="h-6 w-6" />} title="No collections yet" hint="Collections you create to organise saved papers will appear here." />
              : listLoading ? <SkeletonList rows={4} />
                : listError ? <ErrorState error={listError} onRetry={view === "holdings" ? holdings.reload : saves.refresh} />
                  : sortedRows.length === 0 ? <EmptyState title={delayedFilter || school !== "ALL" || year !== "ALL" || tier !== "all" ? "No papers match those filters" : view === "saves" ? "You haven’t saved anything yet" : "The library is empty"} hint="Try clearing filters or explore the research feed." action={delayedFilter || school !== "ALL" || year !== "ALL" || tier !== "all" ? <button className="btn" type="button" onClick={clearFilters}>Clear filters</button> : undefined} />
                    : <ul className="divide-y divide-stone-100">{sortedRows.map((paper) => <PaperRow key={paper.paper_id} paper={paper} />)}</ul>}
          </div>
        </div>
        <aside className="min-w-0 lg:col-span-1">
          <div className="lg:sticky lg:top-24">
            <Panel eyebrow="For you" title="Recommended reading" bodyClassName="max-h-[720px] overflow-y-auto">
              {authStatus !== "authenticated" ? <EmptyState className="py-8" title="Sign in for recommendations" hint="Your saved papers help personalise this list." />
                : recs.loading && !recs.data ? <SkeletonCard rows={3} className="border-0" />
                  : recs.error ? <ErrorState compact error={recs.error} onRetry={recs.reload} />
                    : !recs.data || recs.data.papers.length === 0 ? <EmptyState className="py-8" title="Nothing to recommend yet" hint="Save a few papers to tune your profile." />
                      : <ul className="divide-y divide-stone-100">{dedupeRecommendations(recs.data.papers).slice(0, 6).map((paper) => <li key={paper.paper_id} className="p-3"><PaperCard paper={{ paper_id: paper.paper_id, canonical_title: paper.canonical_title, abstract: null, authors: null, publication_year: paper.publication_year, venue: paper.venue, topics: paper.topics, save_count: paper.save_count, pagerank_score: paper.pagerank_score }} className="border-0 p-2" /></li>)}</ul>}
            </Panel>
          </div>
        </aside>
      </div>
    </div>
  );
}
