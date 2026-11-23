"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, GraduationCap, MessageSquare } from "lucide-react";
import { PaperCard } from "@/components/paper/PaperCard";
import { Avatar, Panel } from "@/components/ui/Section";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { Tag } from "@/components/ui/Pill";
import { getAnomalies, getHome, getTopicAssociations } from "@/lib/api";
import { fmtInt, relTime, shortSchool } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/context/AuthContext";
import { SCHOOLS, type HomePayload } from "@/types/crc";

function Welcome() {
  const { user, promptLogin } = useAuth();
  const first = user?.full_name.split(" ")[0];
  return (
    <section className="relative overflow-hidden rounded-2xl bg-brand-600 px-6 py-8 text-white sm:px-9 sm:py-10">
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full text-white/[0.07]" fill="none" stroke="currentColor" strokeWidth="1.2">
        {[40, 80, 120, 160, 200, 240].map((r) => <circle key={r} cx="92%" cy="-10%" r={r} />)}
      </svg>
      <div className="relative max-w-2xl">
        <p className="text-meta font-semibold text-saffron-300">{user ? "Welcome back" : "Chanakya Research Commons"}</p>
        <h1 className="mt-2 font-display text-[30px] leading-tight sm:text-[36px]">
          {first ? `Good to see you, ${first}.` : "Find the work, the people and the conversation."}
        </h1>
        <p className="mt-3 max-w-xl text-body leading-relaxed text-white/80">
          Discover research across disciplines, follow scholars on campus and join discussions around the work. Use the search bar above to look across everything.
        </p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link href="/library" className="btn bg-white text-brand-700 hover:bg-brand-50"><BookOpen className="h-4 w-4" /> Browse library</Link>
          <Link href="/feed" className="btn border-white/30 bg-white/10 text-white hover:bg-white/20"><MessageSquare className="h-4 w-4" /> Join the feed</Link>
          {!user && <button type="button" onClick={() => promptLogin("register")} className="btn border-transparent bg-saffron-400 text-ink hover:bg-saffron-300">Create account</button>}
        </div>
      </div>
    </section>
  );
}

function SchoolStrip() {
  return (
    <section aria-label="Browse by school" className="card p-4 sm:p-5">
      <h2 className="font-display text-[16px] text-ink">Browse by school</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {SCHOOLS.map((school) => (
          <Link key={school} href={`/library?school=${encodeURIComponent(school)}`} className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-paper px-3.5 py-1.5 text-meta font-medium text-stone-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700">
            <GraduationCap className="h-3.5 w-3.5" /> {shortSchool(school)}
          </Link>
        ))}
      </div>
    </section>
  );
}

function StatsStrip({ loading, error, stats }: { loading: boolean; error: unknown; stats: { papers: number; scholars: number; clusters: number; posts: number } | null }) {
  const items = [["Indexed papers", stats?.papers], ["Active scholars", stats?.scholars], ["Research clusters", stats?.clusters], ["Campus discussions", stats?.posts]];
  return (
    <section aria-label="Commons statistics" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="card p-4">
          {loading && !stats ? <Skeleton className="h-8 w-20" /> : error ? <span className="text-meta text-stone-400">—</span> : <p className="num font-display text-[26px] leading-8 text-ink">{fmtInt(Number(value ?? 0))}</p>}
          <p className="mt-1 text-meta text-stone-500">{label}</p>
        </div>
      ))}
    </section>
  );
}

function TrendingThemes() {
  const { data, error, loading, reload } = useAsync((signal) => getTopicAssociations("ALL", signal), []);
  return (
    <Panel eyebrow="Across the corpus" title="Research themes" actions={<Link href="/analytics?tab=associations" className="inline-flex items-center gap-1 text-meta font-semibold text-brand-600 hover:text-brand-700">See all themes <ArrowRight className="h-4 w-4" /></Link>}>
      {loading && !data ? <div className="space-y-3 p-5"><Skeleton className="h-7 w-2/3" /><Skeleton className="h-7 w-4/5" /></div>
        : error ? <ErrorState error={error} onRetry={reload} />
          : !data || data.bundles.length === 0 ? <EmptyState title="No themes to show yet" hint="Research clusters will appear as the corpus grows." />
            : <div className="flex flex-wrap gap-2 p-5">{data.bundles.slice(0, 6).map((bundle, index) => <Link key={`${bundle.items.join("-")}-${index}`} href={`/search?q=${encodeURIComponent(bundle.items.join(" "))}`} className="rounded-full border border-stone-200 bg-sunken px-3 py-1.5 text-meta font-medium text-stone-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700">{bundle.items.join(" · ")}</Link>)}</div>}
    </Panel>
  );
}

function BreakoutScholars() {
  const { data, error, loading, reload } = useAsync((signal) => getAnomalies(signal), []);
  return (
    <Panel eyebrow="High impact" title="Breakout scholar spotlights" actions={<Link href="/analytics?tab=anomalies" className="inline-flex items-center gap-1 text-meta font-semibold text-brand-600 hover:text-brand-700">View all <ArrowRight className="h-4 w-4" /></Link>}>
      {loading && !data ? <SkeletonCard rows={3} className="border-0" />
        : error ? <ErrorState error={error} onRetry={reload} />
          : !data || data.spotlights.length === 0 ? <EmptyState title="No spotlights right now" hint="Notable research impact will appear here." />
            : <ul className="divide-y divide-stone-100">{data.spotlights.slice(0, 3).map((person) => <li key={person.id} className="flex gap-3 p-4"><Avatar name={person.title} size={38} /><div className="min-w-0"><p className="font-medium text-ink">{person.title}</p><p className="text-meta text-stone-500">{person.reason ?? person.entity_ref}</p></div></li>)}</ul>}
    </Panel>
  );
}

function RecentDiscussions({ loading, error, posts }: { loading: boolean; error: unknown; posts: HomePayload["recent_posts"] | null }) {
  return (
    <Panel eyebrow="Campus community" title="Recent discussions" actions={<Link href="/feed" className="inline-flex items-center gap-1 text-meta font-semibold text-brand-600 hover:text-brand-700">View all <ArrowRight className="h-4 w-4" /></Link>}>
      {loading && !posts ? <SkeletonCard rows={3} className="border-0" />
        : error ? <ErrorState error={error} />
          : !posts || posts.length === 0 ? <EmptyState title="The feed is quiet" hint="Start a conversation with the Chanakya community." />
            : <ul className="divide-y divide-stone-100">{posts.slice(0, 4).map((post) => <li key={post.post_id} className="flex items-start gap-3 p-4"><Avatar name={post.author_name} size={34} /><div className="min-w-0 flex-1"><Link href={`/feed/${post.post_id}`} className="font-display text-h3 text-ink hover:underline">{post.title}</Link><p className="mt-1 text-meta text-stone-500">{post.author_name} · {shortSchool(post.author_dept)} · {relTime(post.created_at)}</p><div className="mt-2 flex flex-wrap items-center gap-2">{post.tags?.slice(0, 1).map((tag) => <Tag key={tag}>{tag}</Tag>)}<span className="num inline-flex items-center gap-1 text-meta text-stone-500"><MessageSquare className="h-3.5 w-3.5" />{fmtInt(post.comment_count)}</span><span className="num text-meta text-stone-500">{fmtInt(post.upvote_count)} score</span></div></div></li>)}</ul>}
    </Panel>
  );
}

export function HomeWorkspace() {
  const home = useAsync((signal) => getHome(signal), []);
  return (
    <div className="space-y-5">
      <Welcome />
      <StatsStrip loading={home.loading} error={home.error} stats={home.data?.stats ?? null} />
      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="font-display text-h2 text-ink">Featured papers</h2>
              <Link href="/library" className="inline-flex items-center gap-1 text-meta font-semibold text-brand-600 hover:text-brand-700">Browse the library <ArrowRight className="h-4 w-4" /></Link>
            </div>
            {home.loading && !home.data ? <div className="grid gap-3 md:grid-cols-2">{[0, 1].map((n) => <SkeletonCard key={n} rows={3} />)}</div>
              : home.error ? <ErrorState error={home.error} onRetry={home.reload} />
                : !home.data?.featured_papers.length ? <EmptyState title="No featured papers yet" hint="Papers in the university collection will be highlighted here." />
                  : <div className="grid min-w-0 gap-3 md:grid-cols-2">{home.data.featured_papers.slice(0, 6).map((paper) => <PaperCard key={paper.paper_id} paper={paper} />)}</div>}
          </section>
          <RecentDiscussions loading={home.loading} error={home.error} posts={home.data?.recent_posts ?? null} />
        </div>
        <aside className="min-w-0 space-y-5">
          <SchoolStrip />
          <TrendingThemes />
          <BreakoutScholars />
        </aside>
      </div>
    </div>
  );
}
