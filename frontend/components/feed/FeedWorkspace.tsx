"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Clock, Flame, TrendingUp, X } from "lucide-react";
import { Composer } from "@/components/feed/Composer";
import { FeedRail } from "@/components/feed/FeedRail";
import { PostCard } from "@/components/feed/PostCard";
import { FilterOption, FilterToggle, SidebarPortal, SidebarSection } from "@/components/shell/SidebarSlot";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Skeleton } from "@/components/ui/Skeleton";
import { getFeed, getRecommendations } from "@/lib/api";
import { cx, schoolLabel, shortSchool } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/context/AuthContext";
import { SCHOOLS } from "@/types/crc";

type FeedSort = "best" | "new" | "top";

const SORTS: Array<{ id: FeedSort; label: string; icon: typeof Flame }> = [
  { id: "best", label: "Best", icon: Flame },
  { id: "new", label: "New", icon: Clock },
  { id: "top", label: "Top", icon: TrendingUp },
];

function PostSkeleton() {
  return (
    <div className="card space-y-3 p-5" aria-hidden>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1 rounded-full border border-brand-100 bg-brand-50 py-1 pl-2.5 pr-1.5 text-meta font-medium text-brand-700 transition hover:bg-brand-100"
      aria-label={`Remove filter ${label}`}
    >
      {label}
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

export function FeedWorkspace() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const userId = user?.user_id ?? null;

  // The single global search bar drives `?q=`; school/topic filters live in the sidebar.
  const query = (params.get("q") ?? "").trim();
  const composeRequested = params.get("compose") === "1";
  const [school, setSchool] = useState("ALL");
  const [topic, setTopic] = useState<string | null>(null);
  const [sort, setSort] = useState<FeedSort>("best");

  const feed = useAsync((signal) => getFeed(userId, signal, sort), [userId, sort]);
  const recs = useAsync((signal) => getRecommendations(userId!, signal), [userId], !!userId);
  const posts = useMemo(() => feed.data ?? [], [feed.data]);

  const clearQuery = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.delete("q");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  const consumeCompose = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.delete("compose");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  const matchesQuery = useCallback(
    (post: (typeof posts)[number]) => {
      if (!query) return true;
      const needle = query.toLowerCase();
      return [post.title, post.body, post.author_name, post.attached_paper_title ?? "", ...(post.tags ?? [])].some((field) => field.toLowerCase().includes(needle));
    },
    [query],
  );

  // Counts reflect the search text so the numbers in the sidebar always match the list.
  const searched = useMemo(() => posts.filter(matchesQuery), [posts, matchesQuery]);
  const schoolCounts = useMemo(() => {
    const counts = new Map<string, number>();
    searched.forEach((post) => counts.set(post.author_dept, (counts.get(post.author_dept) ?? 0) + 1));
    return counts;
  }, [searched]);
  const topics = useMemo(() => {
    const counts = new Map<string, number>();
    posts.forEach((post) => post.tags?.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [posts]);
  const schools = useMemo(
    () => [...SCHOOLS, ...[...schoolCounts.keys()].filter((item) => !(SCHOOLS as readonly string[]).includes(item))],
    [schoolCounts],
  );
  const filtered = searched.filter((post) => (school === "ALL" || post.author_dept === school) && (!topic || post.tags?.includes(topic)));

  const activeCount = (school !== "ALL" ? 1 : 0) + (topic ? 1 : 0);
  const clearFilters = () => {
    setSchool("ALL");
    setTopic(null);
  };
  const focusComposer = () => document.getElementById("compose")?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <>
      <SidebarPortal>
        <div className="border-t border-stone-100">
          <p className="px-4 pb-1 pt-4 font-display text-[15px] text-ink">Filter feed</p>
          <SidebarSection title="School" onClear={school !== "ALL" ? () => setSchool("ALL") : undefined}>
            <div role="radiogroup" aria-label="Filter by school" className="space-y-0.5">
              <FilterOption label="All schools" count={searched.length} active={school === "ALL"} onClick={() => setSchool("ALL")} />
              {schools.map((item) => (
                <FilterOption key={item} title={item} label={schoolLabel(item)} count={schoolCounts.get(item) ?? 0} active={school === item} onClick={() => setSchool(item)} />
              ))}
            </div>
          </SidebarSection>
          {topics.length > 0 && (
            <SidebarSection title="Topics" onClear={topic ? () => setTopic(null) : undefined}>
              <div role="radiogroup" aria-label="Filter by topic" className="space-y-0.5">
                {topics.slice(0, 10).map(([name, count]) => (
                  <FilterOption key={name} label={name} count={count} active={topic === name} onClick={() => setTopic((c) => (c === name ? null : name))} />
                ))}
              </div>
            </SidebarSection>
          )}
          {activeCount > 0 && (
            <div className="px-4 pb-4 pt-1">
              <button type="button" onClick={clearFilters} className="btn w-full">Clear all filters</button>
            </div>
          )}
        </div>
      </SidebarPortal>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <div id="compose">
            <Composer onPosted={feed.reload} autoOpen={composeRequested} onOpened={consumeCompose} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 rounded-full border border-stone-200 bg-paper p-1" role="group" aria-label="Sort posts">
              {SORTS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSort(id)}
                  aria-pressed={sort === id}
                  className={cx(
                    "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-meta font-semibold transition",
                    sort === id ? "bg-brand-600 text-white shadow-card" : "text-stone-600 hover:bg-stone-100",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
            <FilterToggle activeCount={activeCount} />
          </div>

          {(query || activeCount > 0) && (
            <div className="flex flex-wrap items-center gap-2 animate-fade" aria-label="Active filters">
              {query && <RemovableChip label={`Search: “${query}”`} onRemove={clearQuery} />}
              {school !== "ALL" && <RemovableChip label={shortSchool(school)} onRemove={() => setSchool("ALL")} />}
              {topic && <RemovableChip label={`#${topic}`} onRemove={() => setTopic(null)} />}
              <span className="num text-meta text-stone-500">{filtered.length} {filtered.length === 1 ? "post" : "posts"}</span>
            </div>
          )}

          {feed.loading && !feed.data ? (
            <div className="space-y-3" role="status" aria-label="Loading feed"><PostSkeleton /><PostSkeleton /><PostSkeleton /></div>
          ) : feed.error ? (
            <div className="card"><ErrorState error={feed.error} onRetry={feed.reload} /></div>
          ) : filtered.length === 0 ? (
            <div className="card">
              <EmptyState
                title={posts.length === 0 ? "The feed is quiet" : "No posts match"}
                hint={posts.length === 0 ? "Be the first to share something with the Chanakya community." : "Try different words or clear a filter to see more."}
                action={posts.length > 0 ? <button className="btn" type="button" onClick={() => { clearFilters(); if (query) clearQuery(); }}>Reset</button> : undefined}
              />
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((post) => <PostCard key={post.post_id} post={post} onTagClick={setTopic} />)}
            </div>
          )}
        </div>

        <aside aria-label="Community" className="hidden min-w-0 self-start lg:sticky lg:top-[80px] lg:block">
          {/* Own scroll area: wheeling over the rail moves only the rail; everywhere else scrolls the page. */}
          <div className="crc-scroll max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain pb-1 pr-1">
            <FeedRail
              topics={topics}
              people={recs.data?.people ?? []}
              peopleLoading={recs.loading}
              postCount={posts.length}
              schoolCount={new Set(posts.map((p) => p.author_dept)).size}
              onTopic={setTopic}
              onCompose={focusComposer}
            />
          </div>
        </aside>
      </div>
    </>
  );
}
