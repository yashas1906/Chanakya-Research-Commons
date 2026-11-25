"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, Flame, Loader2, TrendingUp, Users, X } from "lucide-react";
import { FollowUserButton } from "@/components/ui/FollowUserButton";
import type { FeedPost } from "@/types/crc";
import { Composer, type AttachedPaper } from "@/components/feed/Composer";
import { FeedRail } from "@/components/feed/FeedRail";
import { FollowTopicButton } from "@/components/ui/FollowTopicButton";
import { PostCard } from "@/components/feed/PostCard";
import { FilterOption, FilterToggle, SidebarPortal, SidebarSection } from "@/components/shell/SidebarSlot";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Skeleton } from "@/components/ui/Skeleton";
import { describeError, getFeed, getPaper, getRecommendations } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { cx, schoolLabel, shortSchool } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/context/AuthContext";
import { SCHOOLS } from "@/types/crc";
import { domainOf } from "@/lib/domains";

type FeedSort = "best" | "following" | "new" | "top";
const isSort = (value: string | null): value is FeedSort => value === "best" || value === "following" || value === "new" || value === "top";

const SORTS: Array<{ id: FeedSort; label: string; icon: typeof Flame; signedInOnly?: boolean }> = [
  { id: "best", label: "Best", icon: Flame },
  { id: "following", label: "Following", icon: Users, signedInOnly: true },
  { id: "new", label: "New", icon: Clock },
  { id: "top", label: "Top", icon: TrendingUp },
];
const PAGE = 40;
const MAX_POSTS = 200;

/** Why a post is in a signed-in member's "Best" or "Following" feed. */
function feedReason(post: FeedPost, sort: FeedSort, signedIn: boolean): string | null {
  if (!signedIn || (sort !== "best" && sort !== "following")) return null;
  if (post.author_followed) return "From someone you follow";
  if (post.topic_followed) return "On a topic you follow";
  return sort === "best" ? "Recommended for you" : null;
}

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
  const { user, status: authStatus, promptLogin } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const userId = user?.user_id ?? null;

  // Sort, school and topic live in the URL, so the browser Back button steps through them.
  // The single global search bar drives `?q=`.
  const query = (params.get("q") ?? "").trim();
  const composeRequested = params.get("compose") === "1";
  const attachId = params.get("attach");
  const sortParam = params.get("sort");
  // "Following" needs an account; logged-out visitors fall back to Best.
  const sort: FeedSort = isSort(sortParam) && (sortParam !== "following" || !!userId) ? sortParam : "best";
  const school = params.get("school") ?? "ALL";
  const topic = params.get("topic");
  const [attach, setAttach] = useState<AttachedPaper | null>(null);
  const [justPosted, setJustPosted] = useState<string | null>(null);

  // Load more grows the list a page at a time; it starts over when the sort or member changes.
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [sort, userId]);
  const feed = useAsync((signal) => getFeed(userId, signal, sort, limit), [userId, sort, limit], true, `feed:${userId ?? "anon"}:${sort}:${limit}`);
  const recs = useAsync((signal) => getRecommendations(userId!, signal), [userId], !!userId);
  const posts = useMemo(() => feed.data ?? [], [feed.data]);

  const navigate = useCallback(
    (patch: Record<string, string | null>, mode: "push" | "replace" = "push") => {
      const next = new URLSearchParams(params.toString());
      Object.entries(patch).forEach(([key, value]) => (value === null ? next.delete(key) : next.set(key, value)));
      const qs = next.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (mode === "push") router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [params, pathname, router],
  );
  const setSort = (next: FeedSort) => navigate({ sort: next === "best" ? null : next });
  const setSchool = (next: string) => navigate({ school: next === "ALL" ? null : next });
  // Trending and followed topics are paper-level ("VLSI design"); posts are filed under its domain.
  const setTopic = (next: string | null) => navigate({ topic: next ? domainOf(next) ?? next : null });
  const toggleTopic = (next: string) => setTopic(topic === next ? null : next);

  const clearQuery = useCallback(() => navigate({ q: null }, "replace"), [navigate]);
  const consumeCompose = useCallback(() => navigate({ compose: null }, "replace"), [navigate]);

  // "Start a discussion" on a paper page links to /feed?attach=<paperId>: open the composer with it attached.
  useEffect(() => {
    if (!attachId || authStatus === "loading") return;
    if (authStatus !== "authenticated") {
      promptLogin("login");
      return;
    }
    let active = true;
    getPaper(attachId)
      .then((paper) => {
        if (!active) return;
        setAttach({ paper_id: paper.paper_id, canonical_title: paper.canonical_title });
        navigate({ attach: null }, "replace");
      })
      .catch((error) => {
        if (!active) return;
        toast(`Could not attach that paper: ${describeError(error)}`);
        navigate({ attach: null }, "replace");
      });
    return () => {
      active = false;
    };
  }, [attachId, authStatus, promptLogin, navigate, toast]);

  // A new post goes to the top of "New"; say so, and link to it.
  const onPosted = (postId: string) => {
    setAttach(null);
    setJustPosted(postId);
    toast("Your post is live");
    if (sort === "new" && school === "ALL" && !topic && !query) feed.reload();
    else navigate({ sort: "new", school: null, topic: null, q: null });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

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
  const clearFilters = () => navigate({ school: null, topic: null });
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
            <SidebarSection title="Domains" onClear={topic ? () => setTopic(null) : undefined}>
              <div role="radiogroup" aria-label="Filter by research domain" className="space-y-0.5">
                {topics.map(([name, count]) => (
                  <FilterOption key={name} label={name} count={count} active={topic === name} onClick={() => toggleTopic(name)} />
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
            <Composer onPosted={onPosted} autoOpen={composeRequested} onOpened={consumeCompose} attach={attach} />
            {justPosted && (
              <div role="status" className="mt-3 flex items-center gap-2.5 rounded-xl bg-sage-50 px-4 py-2.5 text-meta text-sage-700 ring-1 ring-inset ring-sage-200 animate-fade">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">Your post is live and at the top of <span className="font-semibold">New</span>.</span>
                <Link href={`/feed/${justPosted}`} className="font-semibold underline underline-offset-2">View post</Link>
                <button type="button" onClick={() => setJustPosted(null)} className="rounded-md p-1 hover:bg-sage-100" aria-label="Dismiss">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 rounded-full border border-stone-200 bg-paper p-1" role="group" aria-label="Sort posts">
              {SORTS.filter((s) => !s.signedInOnly || userId).map(({ id, label, icon: Icon }) => (
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
              {topic && <FollowTopicButton topic={topic} />}
              <span className="num text-meta text-stone-500">{filtered.length} {filtered.length === 1 ? "post" : "posts"}</span>
            </div>
          )}

          {feed.loading && !feed.data ? (
            <div className="space-y-3" role="status" aria-label="Loading feed"><PostSkeleton /><PostSkeleton /><PostSkeleton /></div>
          ) : feed.error ? (
            <div className="card"><ErrorState error={feed.error} onRetry={feed.reload} /></div>
          ) : filtered.length === 0 && sort === "following" && posts.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title="Nothing from people or topics you follow yet"
                hint="Follow scholars (the Follow button next to any name) or topics (the + on any topic) and their posts collect here."
                action={
                  <div className="flex flex-col items-center gap-3">
                    {(recs.data?.people ?? []).slice(0, 3).map((person) => (
                      <span key={person.user_id} className="flex items-center gap-2 text-meta">
                        <Link href={`/u/${person.user_id}`} className="font-semibold text-ink hover:underline">{person.full_name}</Link>
                        <span className="text-stone-500">{shortSchool(person.department)}</span>
                        <FollowUserButton userId={person.user_id} name={person.full_name} compact />
                      </span>
                    ))}
                    <button type="button" className="btn" onClick={() => setSort("best")}>Back to Best</button>
                  </div>
                }
              />
            </div>
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
              {filtered.map((post) => <PostCard key={post.post_id} post={post} onTagClick={setTopic} reason={feedReason(post, sort, !!userId)} />)}
            </div>
          )}

          {/* The filters above apply to the posts loaded so far; load more to search further back. */}
          {!feed.error && posts.length >= limit && limit < MAX_POSTS && (
            <div className="flex flex-col items-center gap-1 pt-1">
              <button type="button" className="btn" disabled={feed.loading} onClick={() => setLimit((n) => Math.min(MAX_POSTS, n + PAGE))}>
                {feed.loading && <Loader2 className="h-4 w-4 animate-spin" />} Load more posts
              </button>
              <span className="num text-label text-stone-400">Showing the {posts.length} most {sort === "new" ? "recent" : "relevant"} posts</span>
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
