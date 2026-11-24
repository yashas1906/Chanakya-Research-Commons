"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { PaperRow } from "@/components/library/PaperRow";
import { CollectionsPanel } from "@/components/library/CollectionsPanel";
import { RecommendedPanel } from "@/components/library/RecommendedPanel";
import { FilterOption, FilterToggle, SidebarPortal, SidebarSection } from "@/components/shell/SidebarSlot";
import { PageHeader } from "@/components/ui/Section";
import { AddByIdentifierDialog } from "@/components/library/AddByIdentifierDialog";
import { Link2 } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { SkeletonList } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { getHoldings } from "@/lib/api";
import { authorsLine, cx, schoolLabel, shortSchool } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/context/AuthContext";
import { useSaves } from "@/lib/saves-context";
import { SCHOOLS, type Paper } from "@/types/crc";

type View = "holdings" | "recommended" | "saves" | "collections";
type SortKey = "saves" | "prestige" | "year";
type RankFilter = "all" | "top1" | "top10" | "top25";

const isView = (value: string | null): value is View => value === "holdings" || value === "recommended" || value === "saves" || value === "collections";
const isSort = (value: string | null): value is SortKey => value === "saves" || value === "prestige" || value === "year";
const isTier = (value: string | null): value is Exclude<RankFilter, "all"> => value === "top1" || value === "top10" || value === "top25";
const decade = (year: number | null) => (year === null ? "" : `${Math.floor(year / 10) * 10}s`);

const SORT_LABELS: Record<SortKey, string> = { saves: "Most saved", prestige: "PageRank tier", year: "Newest" };
const TIER_LABELS: Record<RankFilter, string> = { all: "All tiers", top1: "Top 1%", top10: "Top 10%", top25: "Top 25%" };

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

function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove filter ${label}`}
      className="inline-flex items-center gap-1 rounded-full border border-brand-100 bg-brand-50 py-1 pl-2.5 pr-1.5 text-meta font-medium text-brand-700 transition hover:bg-brand-100"
    >
      {label}
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

export function LibraryWorkspace() {
  const { status: authStatus, promptLogin } = useAuth();
  const [addOpen, setAddOpen] = useState(false);
  const saves = useSaves();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Every filter lives in the URL, so links are shareable and the top search bar can drive `q`.
  const tabParam = params.get("tab");
  const view: View = isView(tabParam) ? tabParam : "holdings";
  const sortParam = params.get("sort");
  const sort: SortKey = isSort(sortParam) ? sortParam : "saves";
  const school = params.get("school") ?? "ALL";
  const year = params.get("year") ?? "ALL";
  const tierParam = params.get("tier");
  const tier: RankFilter = isTier(tierParam) ? tierParam : "all";
  const query = (params.get("q") ?? "").trim();

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      Object.entries(patch).forEach(([key, value]) => {
        if (value === null || value === "ALL" || value === "all") next.delete(key);
        else next.set(key, value);
      });
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const holdings = useAsync((signal) => getHoldings(100, signal), []);

  const fullHoldings = useMemo(() => withPercentiles(holdings.data ?? []), [holdings.data]);
  const fullSaves = useMemo(() => withPercentiles(saves.saves), [saves.saves]);
  const source = view === "saves" ? fullSaves : fullHoldings;

  const matchesText = useCallback(
    (paper: Paper) => {
      if (!query) return true;
      const fields = `${paper.canonical_title} ${authorsLine(paper.authors, 20)} ${paper.venue ?? ""} ${(paper.topics ?? []).join(" ")}`.toLowerCase();
      return fields.includes(query.toLowerCase());
    },
    [query],
  );
  const matches = useCallback(
    (paper: Paper, skip?: "school" | "year" | "tier") =>
      matchesText(paper) &&
      (skip === "school" || school === "ALL" || paper.school === school) &&
      (skip === "year" || year === "ALL" || decade(paper.publication_year) === year) &&
      (skip === "tier" || matchesRank(paper.pagerank_percentile, tier)),
    [matchesText, school, year, tier],
  );

  const sortedRows = useMemo(() => {
    if (view === "collections" || view === "recommended") return [];
    const rows = source.filter((paper) => matches(paper));
    if (sort === "saves") rows.sort((a, b) => b.save_count - a.save_count);
    if (sort === "prestige") rows.sort((a, b) => (b.pagerank_percentile ?? 0) - (a.pagerank_percentile ?? 0));
    if (sort === "year") rows.sort((a, b) => (b.publication_year ?? 0) - (a.publication_year ?? 0));
    return rows;
  }, [view, source, matches, sort]);

  // Facet counts: each group counts papers that match every *other* filter.
  const schoolCounts = useMemo(() => {
    const counts = new Map<string, number>();
    source.filter((p) => matches(p, "school")).forEach((p) => {
      const key = p.school ?? "";
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [source, matches]);
  const decadeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    source.filter((p) => matches(p, "year")).forEach((p) => {
      const key = decade(p.publication_year);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [source, matches]);
  const tierCount = (value: RankFilter) => source.filter((p) => matchesText(p) && (school === "ALL" || p.school === school) && (year === "ALL" || decade(p.publication_year) === year) && matchesRank(p.pagerank_percentile, value)).length;

  const schoolOptions = useMemo(() => [...SCHOOLS, ...[...schoolCounts.keys()].filter((item) => item && !(SCHOOLS as readonly string[]).includes(item))], [schoolCounts]);
  const decades = useMemo(() => [...new Set([...source.map((p) => decade(p.publication_year)).filter(Boolean)])].sort().reverse(), [source]);

  const hasFilters = view === "holdings" || view === "saves";
  const tabs = [
    { id: "holdings" as const, label: "Chanakya holdings", count: fullHoldings.length },
    { id: "recommended" as const, label: "Recommended" },
    { id: "saves" as const, label: "My saves", count: authStatus === "authenticated" ? saves.saves.length : undefined },
    { id: "collections" as const, label: "Collections" },
  ];
  const listLoading = view === "holdings" ? holdings.loading && !holdings.data : authStatus === "loading" || (saves.status === "loading" && saves.saves.length === 0);
  const listError = view === "holdings" ? holdings.error : saves.status === "error" ? saves.error : null;

  const activeCount = (school !== "ALL" ? 1 : 0) + (year !== "ALL" ? 1 : 0) + (tier !== "all" ? 1 : 0);
  const anyFilter = activeCount > 0 || !!query;
  const clearFilters = () => update({ school: null, year: null, tier: null, q: null });

  return (
    <>
      {hasFilters && (
        <SidebarPortal>
          <div className="border-t border-stone-100">
            <p className="px-4 pb-1 pt-4 font-display text-[15px] text-ink">Filter library</p>
            <SidebarSection title="Sort by">
              <div role="radiogroup" aria-label="Sort papers" className="space-y-0.5">
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <FilterOption key={key} label={SORT_LABELS[key]} active={sort === key} onClick={() => update({ sort: key === "saves" ? null : key })} />
                ))}
              </div>
            </SidebarSection>
            <SidebarSection title="School" onClear={school !== "ALL" ? () => update({ school: null }) : undefined}>
              <div role="radiogroup" aria-label="Filter by school" className="space-y-0.5">
                <FilterOption label="All schools" active={school === "ALL"} count={source.filter((p) => matches(p, "school")).length} onClick={() => update({ school: null })} />
                {schoolOptions.map((name) => (
                  <FilterOption key={name} title={name} label={schoolLabel(name)} count={schoolCounts.get(name) ?? 0} active={school === name} onClick={() => update({ school: school === name ? null : name })} />
                ))}
              </div>
            </SidebarSection>
            <SidebarSection title="Publication decade" onClear={year !== "ALL" ? () => update({ year: null }) : undefined}>
              <div role="radiogroup" aria-label="Filter by decade" className="space-y-0.5">
                <FilterOption label="Any decade" active={year === "ALL"} onClick={() => update({ year: null })} />
                {decades.map((name) => (
                  <FilterOption key={name} label={name} count={decadeCounts.get(name) ?? 0} active={year === name} onClick={() => update({ year: year === name ? null : name })} />
                ))}
              </div>
            </SidebarSection>
            <SidebarSection title="PageRank tier" onClear={tier !== "all" ? () => update({ tier: null }) : undefined}>
              <div role="radiogroup" aria-label="Filter by PageRank tier" className="space-y-0.5">
                {(Object.keys(TIER_LABELS) as RankFilter[]).map((key) => (
                  <FilterOption key={key} label={TIER_LABELS[key]} count={tierCount(key)} active={tier === key} onClick={() => update({ tier: key === "all" ? null : key })} />
                ))}
              </div>
            </SidebarSection>
            {anyFilter && (
              <div className="px-4 pb-4 pt-1">
                <button type="button" onClick={clearFilters} className="btn w-full">Clear all filters</button>
              </div>
            )}
          </div>
        </SidebarPortal>
      )}

      <div className="space-y-5">
        <PageHeader
          eyebrow="Repository"
          title="Chanakya Library"
          description="The university’s shared collection, your saved papers and topic-organised reading."
          actions={
            <button type="button" className="btn" onClick={() => (authStatus === "authenticated" ? setAddOpen(true) : promptLogin("login"))}>
              <Link2 className="h-4 w-4" /> Add by DOI, arXiv or link
            </button>
          }
        />
        <AddByIdentifierDialog open={addOpen} onClose={() => setAddOpen(false)} />
        <div className="min-w-0">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Tabs className="w-full min-w-0 sm:w-auto sm:flex-1" tabs={tabs} value={view} onChange={(next) => update({ tab: next === "holdings" ? null : next })} />
              {hasFilters && <FilterToggle activeCount={activeCount} />}
            </div>

            {hasFilters && (
              <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
                {query && <RemovableChip label={`Search: “${query}”`} onRemove={() => update({ q: null })} />}
                {school !== "ALL" && <RemovableChip label={shortSchool(school)} onRemove={() => update({ school: null })} />}
                {year !== "ALL" && <RemovableChip label={year} onRemove={() => update({ year: null })} />}
                {tier !== "all" && <RemovableChip label={TIER_LABELS[tier]} onRemove={() => update({ tier: null })} />}
                <span className="num text-meta text-stone-500">{sortedRows.length} {sortedRows.length === 1 ? "paper" : "papers"} · {SORT_LABELS[sort].toLowerCase()}</span>
              </div>
            )}

            <div className={cx("card min-w-0", view !== "collections" && "overflow-hidden")}>
              {view === "collections" ? (
                <CollectionsPanel />
              ) : view === "recommended" ? (
                <RecommendedPanel />
              ) : view === "saves" && authStatus === "anonymous" ? (
                <EmptyState className="py-12" title="Log in to see your saved papers" hint="Saved papers also tune your recommendations." action={<button type="button" className="btn-primary" onClick={() => promptLogin("login")}>Log in</button>} />
              ) : listLoading ? (
                <SkeletonList rows={4} />
              ) : listError ? (
                <ErrorState error={listError} onRetry={view === "holdings" ? holdings.reload : saves.refresh} />
              ) : sortedRows.length === 0 ? (
                <EmptyState
                  title={anyFilter ? "No papers match those filters" : view === "saves" ? "You haven’t saved anything yet" : "The library is empty"}
                  hint="Try different words, clear a filter, or explore the research feed."
                  action={anyFilter ? <button className="btn" type="button" onClick={clearFilters}>Clear filters</button> : undefined}
                />
              ) : (
                <ul className="divide-y divide-stone-100">{sortedRows.map((paper) => <PaperRow key={paper.paper_id} paper={paper} />)}</ul>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
