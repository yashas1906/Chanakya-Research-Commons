"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Link2, Search, X } from "lucide-react";
import { PaperRow } from "@/components/library/PaperRow";
import { CollectionsPanel } from "@/components/library/CollectionsPanel";
import { RecommendedPanel } from "@/components/library/RecommendedPanel";
import { FilterOption, FilterToggle, SidebarPortal, SidebarSection } from "@/components/shell/SidebarSlot";
import { PageHeader } from "@/components/ui/Section";
import { AddByIdentifierDialog } from "@/components/library/AddByIdentifierDialog";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { SkeletonList } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { getHoldings } from "@/lib/api";
import { authorsLine, cx, schoolLabel, shortSchool } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/context/AuthContext";
import { useSaves } from "@/lib/saves-context";
import { SCHOOLS, type Paper } from "@/types/crc";

type View = "holdings" | "saves" | "recommended" | "collections";
type SortKey = "saves" | "prestige" | "year";
type RankFilter = "all" | "top1" | "top10" | "top25";

const isView = (value: string | null): value is View => value === "holdings" || value === "recommended" || value === "saves" || value === "collections";
const isSort = (value: string | null): value is SortKey => value === "saves" || value === "prestige" || value === "year";
const isTier = (value: string | null): value is Exclude<RankFilter, "all"> => value === "top1" || value === "top10" || value === "top25";
const decade = (year: number | null) => (year === null ? "" : `${Math.floor(year / 10) * 10}s`);

const SORT_LABELS: Record<SortKey, string> = { saves: "Most saved", prestige: "PageRank tier", year: "Newest" };
const TIER_LABELS: Record<RankFilter, string> = { all: "All tiers", top1: "Top 1%", top10: "Top 10%", top25: "Top 25%" };
const PAGE = 30;
/** The API's upper limit; the whole Chanakya library fits well inside it. */
const HOLDINGS_LIMIT = 1000;

const VIEW_INTRO: Record<View, string> = {
  holdings: "Every paper a Chanakya member has saved, shared with the whole university.",
  saves: "Papers you saved, with your private notes. Saving also tunes your recommendations.",
  recommended: "Papers picked for you from your profile and your saves.",
  collections: "Your own named groups of saved papers, for a project, course or theme.",
};

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

/** "Add a paper not in the library": what it does, in one line, next to the button. */
function AddPaperCallout({ onAdd, className }: { onAdd: () => void; className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      <button type="button" className="btn" onClick={onAdd}>
        <Link2 className="h-4 w-4" /> Add a paper not in the library
      </button>
      <span className="text-meta text-stone-500">Paste a DOI, arXiv ID or link; we fetch the details and add it to the library and your saves.</span>
    </div>
  );
}

export function LibraryWorkspace() {
  const { status: authStatus, promptLogin } = useAuth();
  const [addOpen, setAddOpen] = useState(false);
  const saves = useSaves();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Every filter lives in the URL, so links are shareable and the browser Back button undoes each click.
  const tabParam = params.get("tab");
  const view: View = isView(tabParam) ? tabParam : "holdings";
  const sortParam = params.get("sort");
  const sort: SortKey = isSort(sortParam) ? sortParam : "saves";
  const school = params.get("school") ?? "ALL";
  const year = params.get("year") ?? "ALL";
  const tierParam = params.get("tier");
  const tier: RankFilter = isTier(tierParam) ? tierParam : "all";
  const query = (params.get("q") ?? "").trim();

  const navigate = useCallback(
    (patch: Record<string, string | null>, mode: "push" | "replace" = "push") => {
      const next = new URLSearchParams(params.toString());
      Object.entries(patch).forEach(([key, value]) => {
        if (value === null || value === "ALL" || value === "all") next.delete(key);
        else next.set(key, value);
      });
      const qs = next.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (mode === "push") router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [params, pathname, router],
  );
  const update = navigate;

  // The in-page search box: typing replaces the URL (no history entry per keystroke).
  // Only text the member types is written back; a URL change (Back, a chip, "Clear all") just refills the box.
  const [draft, setDraft] = useState(query);
  const typed = useRef(false);
  useEffect(() => {
    typed.current = false;
    setDraft(query);
  }, [query]);
  useEffect(() => {
    if (!typed.current || draft.trim() === query) return;
    const timer = window.setTimeout(() => {
      typed.current = false;
      navigate({ q: draft.trim() || null }, "replace");
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, query, navigate]);

  const openAdd = () => (authStatus === "authenticated" ? setAddOpen(true) : promptLogin("login"));

  const holdings = useAsync((signal) => getHoldings(HOLDINGS_LIMIT, signal), []);

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

  // Show the list a page at a time; start again whenever the list itself changes.
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [view, query, school, year, tier, sort]);

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

  const isList = view === "holdings" || view === "saves";
  const tabs = [
    { id: "holdings" as const, label: "Chanakya holdings", count: holdings.data ? fullHoldings.length : undefined },
    { id: "saves" as const, label: "My saves", count: authStatus === "authenticated" ? saves.saves.length : undefined },
    { id: "recommended" as const, label: "Recommended" },
    { id: "collections" as const, label: "Collections" },
  ];
  const listLoading = view === "holdings" ? holdings.loading && !holdings.data : authStatus === "loading" || (saves.status === "loading" && saves.saves.length === 0);
  const listError = view === "holdings" ? holdings.error : saves.status === "error" ? saves.error : null;

  const activeCount = (school !== "ALL" ? 1 : 0) + (year !== "ALL" ? 1 : 0) + (tier !== "all" ? 1 : 0);
  const anyFilter = activeCount > 0 || !!query;
  const clearFilters = () => update({ school: null, year: null, tier: null, q: null });
  const savesLocked = view === "saves" && authStatus === "anonymous";

  return (
    <>
      {isList && (
        <SidebarPortal>
          <div className="border-t border-stone-100">
            <p className="px-4 pb-1 pt-4 font-display text-[15px] text-ink">Filter {view === "saves" ? "your saves" : "the library"}</p>
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
        <PageHeader eyebrow="Repository" title="Chanakya Library" description="Browse the university’s shared collection, keep your own saves and organise them into collections." />
        <AddByIdentifierDialog open={addOpen} onClose={() => setAddOpen(false)} />

        <div className="min-w-0 space-y-4">
          <div>
            {/* Switching tabs starts that tab fresh: filters belong to the list they were set on. */}
            <Tabs className="min-w-0" tabs={tabs} value={view} onChange={(next) => update({ tab: next === "holdings" ? null : next, school: null, year: null, tier: null, q: null, sort: null })} />
            <p className="mt-2.5 text-meta text-stone-500">{VIEW_INTRO[view]}</p>
          </div>

          {isList && !savesLocked && (
            <div className="space-y-3">
              {/* Toolbar: search this list · sort · filters (rail on wide screens, drawer below) · result count. */}
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative min-w-0 flex-1 basis-60">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    value={draft}
                    onChange={(event) => {
                      typed.current = true;
                      setDraft(event.target.value);
                    }}
                    placeholder={view === "saves" ? "Search your saves by title, author, venue or topic" : "Search the library by title, author, venue or topic"}
                    aria-label="Search this list"
                    className="input pl-9"
                  />
                </label>
                <label className="flex items-center gap-2 text-meta text-stone-500">
                  <span className="hidden sm:inline">Sort</span>
                  <select aria-label="Sort papers" value={sort} onChange={(event) => update({ sort: event.target.value === "saves" ? null : event.target.value })} className="input w-auto py-0">
                    {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => <option key={key} value={key}>{SORT_LABELS[key]}</option>)}
                  </select>
                </label>
                <FilterToggle activeCount={activeCount} />
              </div>

              <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
                <span className="num text-meta text-stone-500">
                  {listLoading ? "Loading…" : `${sortedRows.length} ${sortedRows.length === 1 ? "paper" : "papers"}`}
                </span>
                {school !== "ALL" && <RemovableChip label={shortSchool(school)} onRemove={() => update({ school: null })} />}
                {year !== "ALL" && <RemovableChip label={year} onRemove={() => update({ year: null })} />}
                {tier !== "all" && <RemovableChip label={TIER_LABELS[tier]} onRemove={() => update({ tier: null })} />}
                {anyFilter && <button type="button" onClick={clearFilters} className="text-meta font-medium text-stone-500 underline-offset-2 hover:text-ink hover:underline">Clear all</button>}
              </div>

              {view === "saves" && <AddPaperCallout onAdd={openAdd} />}
            </div>
          )}

          <div className={cx("card min-w-0", view !== "collections" && "overflow-hidden")}>
            {view === "collections" ? (
              <CollectionsPanel />
            ) : view === "recommended" ? (
              <RecommendedPanel />
            ) : savesLocked ? (
              <EmptyState className="py-12" title="Log in to see your saved papers" hint="Saved papers also tune your recommendations." action={<button type="button" className="btn-primary" onClick={() => promptLogin("login")}>Log in</button>} />
            ) : listLoading ? (
              <SkeletonList rows={4} />
            ) : listError ? (
              <ErrorState error={listError} onRetry={view === "holdings" ? holdings.reload : saves.refresh} />
            ) : sortedRows.length === 0 ? (
              <EmptyState
                className="py-12"
                title={anyFilter ? "No papers match" : view === "saves" ? "You haven’t saved anything yet" : "The library is empty"}
                hint={
                  anyFilter
                    ? "Try different words or clear a filter. If the paper isn’t in the Commons yet, you can add it."
                    : view === "saves"
                      ? "Use Save on any paper, or add one from outside the Commons."
                      : "Papers appear here once a member saves them."
                }
                action={
                  <div className="flex flex-col items-center gap-3">
                    {anyFilter && <button className="btn" type="button" onClick={clearFilters}>Clear filters</button>}
                    {(anyFilter || view === "saves") && <AddPaperCallout onAdd={openAdd} className="justify-center text-center" />}
                  </div>
                }
              />
            ) : (
              <>
                <ul className="divide-y divide-stone-100">{sortedRows.slice(0, shown).map((paper) => <PaperRow key={paper.paper_id} paper={paper} />)}</ul>
                {sortedRows.length > shown && (
                  <div className="flex items-center justify-center gap-3 border-t border-stone-100 px-4 py-4">
                    <span className="num text-meta text-stone-500">Showing {shown} of {sortedRows.length}</span>
                    <button type="button" className="btn" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, sortedRows.length - shown)} more</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
