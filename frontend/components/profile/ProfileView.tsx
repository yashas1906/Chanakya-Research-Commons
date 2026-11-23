"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Cake, Check, Flame, MessageSquare, Share2, UserPlus } from "lucide-react";
import { PostCard } from "@/components/feed/PostCard";
import { PaperRow } from "@/components/library/PaperRow";
import { Avatar } from "@/components/ui/Section";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { Tag } from "@/components/ui/Pill";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import { describeError, followUser, getProfile, unfollowUser } from "@/lib/api";
import { cx, fmtCount, relTime, shortSchool } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useSaves } from "@/lib/saves-context";

type TabId = "overview" | "posts" | "comments" | "saved";

function joined(iso: string | null | undefined) {
  if (!iso) return "Recently";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Recently" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <Skeleton className="h-36 w-full rounded-2xl" />
      <Skeleton className="h-10 w-80" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export function ProfileView({ userId }: { userId: string }) {
  const { user, promptLogin } = useAuth();
  const toast = useToast();
  const saves = useSaves();
  const profile = useAsync((signal) => getProfile(userId, signal), [userId, user?.user_id]);
  const [tab, setTab] = useState<TabId>("overview");
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [busy, setBusy] = useState(false);

  const data = profile.data;
  const isSelf = !!user && user.user_id === userId;

  useEffect(() => {
    if (!data) return;
    setFollowing(data.is_following);
    setFollowers(data.stats.follower_count);
    document.title = `${data.user.full_name} · Chanakya Research Commons`;
  }, [data]);

  useEffect(() => setTab("overview"), [userId]);

  const toggleFollow = async () => {
    if (!user) return promptLogin("login");
    if (busy) return;
    const next = !following;
    setBusy(true);
    setFollowing(next);
    setFollowers((n) => Math.max(0, n + (next ? 1 : -1)));
    try {
      await (next ? followUser(userId) : unfollowUser(userId));
    } catch (e) {
      setFollowing(!next);
      setFollowers((n) => Math.max(0, n + (next ? -1 : 1)));
      toast(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("Profile link copied");
    } catch {
      toast("Couldn’t copy the link");
    }
  };

  const tabs = useMemo(() => {
    const base: Array<{ id: TabId; label: string; count?: number }> = [
      { id: "overview", label: "Overview" },
      { id: "posts", label: "Posts", count: data?.stats.post_count },
      { id: "comments", label: "Comments", count: data?.stats.comment_count },
    ];
    if (isSelf) base.push({ id: "saved", label: "Saved", count: saves.saves.length });
    return base;
  }, [data, isSelf, saves.saves.length]);

  if (profile.loading && !data) return <ProfileSkeleton />;
  if (profile.error || !data) return <div className="card"><ErrorState error={profile.error ?? new Error("Member not found")} onRetry={profile.reload} /></div>;

  const { user: person, stats, posts, comments } = data;
  const interests = person.interest_tags ?? [];
  const stat = [
    { label: "Karma", value: stats.karma, icon: Flame },
    { label: "Posts", value: stats.post_count, icon: MessageSquare },
    { label: "Followers", value: followers, icon: UserPlus },
  ];

  const postList = (items: typeof posts, emptyTitle: string, emptyHint: string) =>
    items.length === 0 ? (
      <div className="card"><EmptyState title={emptyTitle} hint={emptyHint} /></div>
    ) : (
      <div className="space-y-3">{items.map((p) => <PostCard key={p.post_id} post={p} />)}</div>
    );

  const commentList = comments.length === 0 ? (
    <div className="card"><EmptyState title="No comments yet" hint={isSelf ? "Join a discussion to see your replies here." : `${person.full_name} hasn’t commented yet.`} /></div>
  ) : (
    <ul className="space-y-3">
      {comments.map((c) => (
        <li key={c.comment_id} className="card card-hover p-4">
          <p className="text-label text-stone-500">
            Commented on{" "}
            <Link href={`/feed/${c.post_id}`} className="font-semibold text-ink hover:text-brand-700">{c.post_title}</Link>
            {" · "}{relTime(c.created_at)}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-body leading-relaxed text-stone-700">{c.body}</p>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-5">
      {/* Banner + identity */}
      <section className="card overflow-hidden">
        <div className="hero h-28 sm:h-36">
          <svg aria-hidden className="absolute inset-0 h-full w-full text-saffron-300/[0.16]" fill="none" stroke="currentColor" strokeWidth="1.2">
            {[40, 80, 120, 160, 200, 240].map((r) => <circle key={r} cx="90%" cy="130%" r={r} />)}
          </svg>
        </div>
        <div className="relative flex flex-wrap items-end justify-between gap-4 px-5 pb-5 sm:px-7">
          <div className="-mt-10 flex min-w-0 items-start gap-4 sm:-mt-12">
            <span className="rounded-full border-4 border-paper bg-paper shadow-card"><Avatar name={person.full_name} size={80} /></span>
            <div className="mt-12 min-w-0 sm:mt-14">
              <h1 className="truncate font-display text-[24px] leading-tight text-ink sm:text-[28px]">{person.full_name}</h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-stone-500">
                <RoleBadge role={person.role} />
                <span>{shortSchool(person.department)}</span>
                <span aria-hidden>·</span>
                <span className="num">u/{person.university_id}</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={share} className="btn"><Share2 className="h-4 w-4" /> Share</button>
            {isSelf ? (
              <Link href="/feed?compose=1" className="btn-primary">New post</Link>
            ) : (
              <button type="button" onClick={toggleFollow} disabled={busy} aria-pressed={following} className={cx(following ? "btn" : "btn-primary")}>
                {following ? <><Check className="h-4 w-4" /> Following</> : <><UserPlus className="h-4 w-4" /> Follow</>}
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <div role="tablist" className="flex gap-1 overflow-x-auto rounded-full border border-stone-200 bg-paper p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cx(
                  "shrink-0 rounded-full px-4 py-1.5 text-meta font-semibold transition",
                  tab === t.id ? "bg-brand-600 text-white shadow-card" : "text-stone-600 hover:bg-stone-100",
                )}
              >
                {t.label}
                {t.count !== undefined && <span className={cx("num ml-1.5", tab === t.id ? "text-white/80" : "text-stone-400")}>{t.count}</span>}
              </button>
            ))}
          </div>

          <div key={tab} className="animate-fade">
            {tab === "overview" && (
              posts.length === 0 && comments.length === 0
                ? <div className="card"><EmptyState title="Nothing here yet" hint={isSelf ? "Share your first finding with the community." : `${person.full_name} hasn’t posted yet.`} /></div>
                : <div className="space-y-6">
                    {posts.length > 0 && postList(posts.slice(0, 5), "", "")}
                    {comments.length > 0 && <div className="space-y-2"><h2 className="px-1 font-display text-[16px] text-ink">Recent comments</h2>{commentList}</div>}
                  </div>
            )}
            {tab === "posts" && postList(posts, "No posts yet", isSelf ? "Share your first finding with the community." : `${person.full_name} hasn’t posted yet.`)}
            {tab === "comments" && commentList}
            {tab === "saved" && isSelf && (
              saves.saves.length === 0
                ? <div className="card"><EmptyState title="No saved papers" hint="Papers you save in the library show up here." action={<Link href="/library" className="btn">Browse library</Link>} /></div>
                : <ul className="card divide-y divide-stone-100 overflow-hidden">{saves.saves.map((p) => <PaperRow key={p.paper_id} paper={p} />)}</ul>
            )}
          </div>
        </div>

        <aside className="min-w-0">
          <div className="card space-y-4 p-4 lg:sticky lg:top-[88px]">
            <h2 className="font-display text-[16px] text-ink">About</h2>
            {person.bio ? <p className="text-meta leading-relaxed text-stone-600">{person.bio}</p> : <p className="text-meta text-stone-400">No bio yet.</p>}
            <dl className="grid grid-cols-3 gap-2 border-y border-stone-100 py-3 text-center">
              {stat.map(({ label, value, icon: Icon }) => (
                <div key={label}>
                  <dt className="flex items-center justify-center gap-1 text-label text-stone-500"><Icon className="h-3 w-3" /> {label}</dt>
                  <dd className="num font-display text-[18px] text-ink">{fmtCount(value)}</dd>
                </div>
              ))}
            </dl>
            <ul className="space-y-2 text-meta text-stone-600">
              <li className="flex items-center gap-2"><Cake className="h-4 w-4 text-stone-400" /> Joined {joined(person.created_at)}</li>
              <li className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-stone-400" /> <span className="num">{fmtCount(stats.comment_count)}</span> comments · <span className="num">{fmtCount(stats.following_count)}</span> following</li>
            </ul>
            {interests.length > 0 && (
              <div>
                <h3 className="mb-2 text-label font-semibold text-stone-500">Research interests</h3>
                <div className="flex flex-wrap gap-1.5">{interests.map((t) => <Tag key={t}>{t}</Tag>)}</div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
