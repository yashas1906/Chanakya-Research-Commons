"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Composer } from "@/components/feed/Composer";
import { PostCard } from "@/components/feed/PostCard";
import { Avatar, PageHeader, Panel } from "@/components/ui/Section";
import { Chip, Tag } from "@/components/ui/Pill";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { getFeed, getRecommendations } from "@/lib/api";
import { shortSchool } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useMember } from "@/lib/member-context";
import { SCHOOLS } from "@/types/crc";

function PostSkeleton() {
  return (
    <div className="card space-y-3 p-5" aria-hidden>
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-2.5 w-44" />
        </div>
      </div>
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
    </div>
  );
}

export function FeedWorkspace() {
  const { current, status, error: memberError, retry: retryMembers } = useMember();
  const userId = current?.user_id ?? null;
  const ready = status === "ready";

  const feed = useAsync((s) => getFeed(userId, s), [userId], ready);
  const recs = useAsync((s) => getRecommendations(userId!, s), [userId], ready && !!userId);

  const [school, setSchool] = useState<string>("ALL");
  const [topic, setTopic] = useState<string | null>(null);

  // Upvote state is remembered per acting member (the backend returns counts, not "did I vote").
  const storageKey = userId ? `crc.upvotes.${userId}` : null;
  const [upvoted, setUpvoted] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      setUpvoted(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setUpvoted(new Set());
    }
  }, [storageKey]);

  const onUpvoteChange = useCallback(
    (postId: string, on: boolean) => {
      setUpvoted((prev) => {
        const next = new Set(prev);
        if (on) next.add(postId);
        else next.delete(postId);
        if (storageKey) {
          try {
            window.localStorage.setItem(storageKey, JSON.stringify([...next]));
          } catch {
            /* ignore */
          }
        }
        return next;
      });
    },
    [storageKey],
  );

  const posts = useMemo(() => feed.data ?? [], [feed.data]);

  const schoolCounts = useMemo(() => {
    const m = new Map<string, number>();
    posts.forEach((p) => m.set(p.author_dept, (m.get(p.author_dept) ?? 0) + 1));
    return m;
  }, [posts]);

  const topTopics = useMemo(() => {
    const m = new Map<string, number>();
    posts.forEach((p) => p.tags?.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [posts]);

  const filtered = posts.filter(
    (p) => (school === "ALL" || p.author_dept === school) && (!topic || p.tags?.includes(topic)),
  );

  const schools = useMemo(() => {
    const extra = [...schoolCounts.keys()].filter((s) => !(SCHOOLS as readonly string[]).includes(s));
    return [...SCHOOLS, ...extra];
  }, [schoolCounts]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Campus"
        title="Research feed"
        description="Findings, questions and papers from scholars across Chanakya — ranked by who you follow and how close the work is to yours."
      />

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-8">
          <Composer onPosted={feed.reload} />

          <div className="space-y-2.5">
            <div className="-mx-1 flex flex-wrap gap-2 px-1" role="group" aria-label="Filter by school">
              <Chip active={school === "ALL"} onClick={() => setSchool("ALL")} count={posts.length}>
                All schools
              </Chip>
              {schools.map((s) => (
                <Chip key={s} active={school === s} onClick={() => setSchool(s)} count={schoolCounts.get(s) ?? 0}>
                  {shortSchool(s)}
                </Chip>
              ))}
            </div>
            {topTopics.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by topic">
                <span className="eyebrow mr-1">Topics</span>
                {topTopics.map(([t, n]) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTopic((cur) => (cur === t ? null : t))}
                    aria-pressed={topic === t}
                    className={
                      topic === t
                        ? "rounded-md bg-ink px-1.5 py-0.5 text-[11px] leading-4 text-white"
                        : "rounded-md bg-sunken px-1.5 py-0.5 text-[11px] leading-4 text-stone-500 transition-colors hover:bg-stone-200/70"
                    }
                  >
                    {t} <span className="num opacity-60">{n}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {status === "loading" || (feed.loading && !feed.data) ? (
            <div className="space-y-4" role="status" aria-label="Loading feed">
              <PostSkeleton />
              <PostSkeleton />
              <PostSkeleton />
            </div>
          ) : status === "error" || feed.error ? (
            <div className="card">
              <ErrorState error={status === "error" ? memberError : feed.error} onRetry={status === "error" ? retryMembers : feed.reload} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card">
              <EmptyState
                title={posts.length === 0 ? "The feed is quiet" : "No posts match these filters"}
                hint={
                  posts.length === 0
                    ? "Be the first to share something with the Chanakya community."
                    : "Clear a school or topic filter to see more."
                }
                action={
                  posts.length > 0 && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setSchool("ALL");
                        setTopic(null);
                      }}
                    >
                      Clear filters
                    </button>
                  )
                }
              />
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map((p) => (
                <PostCard
                  key={p.post_id}
                  post={p}
                  upvoted={upvoted.has(p.post_id)}
                  onUpvoteChange={onUpvoteChange}
                  onTagClick={(t) => setTopic(t)}
                />
              ))}
            </div>
          )}
        </div>

        <aside className={status === "error" ? "hidden" : "space-y-5 lg:col-span-4"}>
          <div className="lg:sticky lg:top-24 lg:space-y-5">
            <Panel eyebrow="For you" title="Scholars you may know">
              {recs.loading && !recs.data ? (
                <SkeletonCard rows={2} className="border-0" />
              ) : recs.error || !recs.data || recs.data.people.length === 0 ? (
                <EmptyState className="py-6" title="No suggestions yet" hint="Follow a few scholars to improve these." />
              ) : (
                <ul className="divide-y divide-stone-100">
                  {recs.data.people.slice(0, 5).map((u) => (
                    <li key={u.user_id} className="flex gap-3 px-4 py-3">
                      <Avatar name={u.full_name} size={30} />
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium text-ink">{u.full_name}</p>
                        <p className="truncate text-[12px] text-stone-500">
                          <span className="capitalize">{u.role}</span> · {shortSchool(u.department)}
                        </p>
                        {u.interest_tags && u.interest_tags.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {u.interest_tags.slice(0, 3).map((t) => (
                              <Tag key={t}>{t}</Tag>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </aside>
      </div>
    </div>
  );
}
