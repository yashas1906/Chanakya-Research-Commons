"use client";

import { useMemo, useState } from "react";
import { Composer } from "@/components/feed/Composer";
import { FeedRail } from "@/components/feed/FeedRail";
import { PostCard } from "@/components/feed/PostCard";
import { PageHeader } from "@/components/ui/Section";
import { Chip } from "@/components/ui/Pill";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Skeleton } from "@/components/ui/Skeleton";
import { getFeed, getRecommendations } from "@/lib/api";
import { shortSchool } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/context/AuthContext";
import { SCHOOLS } from "@/types/crc";

type FeedSort = "best" | "new" | "top";

function PostSkeleton() {
  return <div className="card space-y-3 p-5" aria-hidden><Skeleton className="h-4 w-40" /><Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /></div>;
}

export function FeedWorkspace() {
  const { user } = useAuth();
  const userId = user?.user_id ?? null;
  const [school, setSchool] = useState("ALL");
  const [topic, setTopic] = useState<string | null>(null);
  const [sort, setSort] = useState<FeedSort>("best");
  const feed = useAsync((signal) => getFeed(userId, signal, sort), [userId, sort]);
  const recs = useAsync((signal) => getRecommendations(userId!, signal), [userId], !!userId);
  const posts = useMemo(() => feed.data ?? [], [feed.data]);

  const schoolCounts = useMemo(() => {
    const counts = new Map<string, number>();
    posts.forEach((post) => counts.set(post.author_dept, (counts.get(post.author_dept) ?? 0) + 1));
    return counts;
  }, [posts]);
  const topics = useMemo(() => {
    const counts = new Map<string, number>();
    posts.forEach((post) => post.tags?.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [posts]);
  const schools = useMemo(() => [...SCHOOLS, ...[...schoolCounts.keys()].filter((item) => !(SCHOOLS as readonly string[]).includes(item))], [schoolCounts]);
  const filtered = posts.filter((post) => (school === "ALL" || post.author_dept === school) && (!topic || post.tags?.includes(topic)));

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Campus community" title="Research feed" description="Questions, findings and papers from scholars across Chanakya." />
      <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <div id="compose"><Composer onPosted={feed.reload} /></div>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by school">
              <Chip active={school === "ALL"} onClick={() => setSchool("ALL")} count={posts.length}>All schools</Chip>
              {schools.map((item) => <Chip key={item} active={school === item} onClick={() => setSchool(item)} count={schoolCounts.get(item) ?? 0}>{shortSchool(item)}</Chip>)}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              {topics.length > 0 && <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by topic">{topics.slice(0, 8).map(([name]) => <button key={name} type="button" onClick={() => setTopic((current) => current === name ? null : name)} aria-pressed={topic === name} className={`rounded-full border px-3 py-1.5 text-meta ${topic === name ? "border-ink bg-ink text-white" : "border-stone-200 bg-paper text-stone-600 hover:bg-sunken"}`}>{name}</button>)}</div>}
              <div className="flex gap-1 rounded-full border border-stone-200 bg-paper p-1" role="group" aria-label="Sort posts">
                {(["best", "new", "top"] as const).map((item) => <button key={item} type="button" onClick={() => setSort(item)} aria-pressed={sort === item} className={`rounded-full px-3 py-1.5 text-meta capitalize ${sort === item ? "bg-ink text-white" : "text-stone-600 hover:bg-sunken"}`}>{item === "best" ? "Best" : item === "new" ? "New" : "Top"}</button>)}
              </div>
            </div>
          </div>

          {feed.loading && !feed.data ? <div className="space-y-4" role="status" aria-label="Loading feed"><PostSkeleton /><PostSkeleton /><PostSkeleton /></div>
            : feed.error ? <div className="card"><ErrorState error={feed.error} onRetry={feed.reload} /></div>
              : filtered.length === 0 ? <div className="card"><EmptyState title={posts.length === 0 ? "The feed is quiet" : "No posts match these filters"} hint={posts.length === 0 ? "Be the first to share something with the Chanakya community." : "Clear a school or topic filter to see more."} action={posts.length > 0 ? <button className="btn" type="button" onClick={() => { setSchool("ALL"); setTopic(null); }}>Clear filters</button> : undefined} /></div>
                : <div className="space-y-4">{filtered.map((post) => <PostCard key={post.post_id} post={post} onTagClick={setTopic} />)}</div>}
        </div>
        <aside className="hidden min-w-0 lg:block"><div className="sticky top-24"><FeedRail topics={topics} people={recs.data?.people ?? []} peopleLoading={recs.loading} onTopic={setTopic} /></div></aside>
        <details className="min-w-0 rounded-xl border border-stone-200 bg-paper p-4 lg:hidden">
          <summary className="cursor-pointer text-ui font-medium text-ink">Community information</summary>
          <div className="mt-4"><FeedRail topics={topics} people={recs.data?.people ?? []} peopleLoading={recs.loading} onTopic={setTopic} /></div>
        </details>
      </div>
    </div>
  );
}
