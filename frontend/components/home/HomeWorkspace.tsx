"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, MessageSquare, Search } from "lucide-react";
import { PaperCard } from "@/components/paper/PaperCard";
import { Avatar, Panel } from "@/components/ui/Section";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { Tag } from "@/components/ui/Pill";
import { getAnomalies, getHome, getTopicAssociations } from "@/lib/api";
import { fmtInt, relTime, shortSchool } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { SCHOOLS, type HomePayload } from "@/types/crc";

const EXAMPLES = ["graph neural networks", "federated learning", "protein structure prediction", "contract law and AI"];

function Hero() {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const go = (value: string) => {
    const term = value.trim();
    if (term) router.push(`/search?q=${encodeURIComponent(term)}`);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    go(query);
  };
  return (
    <section className="rounded-2xl border border-stone-200 bg-paper px-5 py-10 sm:px-10 sm:py-14">
      <div className="mx-auto max-w-4xl">
        <p className="eyebrow">A research commons for Chanakya University</p>
        <h1 className="mt-3 max-w-3xl font-serif text-h1 tracking-tight text-ink">Find the work, the people and the conversation.</h1>
        <p className="mt-4 max-w-2xl text-body leading-relaxed text-stone-600">Discover research across disciplines, learn from campus scholars and join thoughtful discussions around the work.</p>
        <form role="search" onSubmit={submit} className="mt-7 flex max-w-3xl gap-2">
          <label className="relative min-w-0 flex-1">
            <Search aria-hidden className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="input h-12 pl-12 text-body" aria-label="Search the research commons" placeholder="Search papers, people and discussions" />
          </label>
          <button type="submit" className="btn-primary h-12 px-5">Search</button>
        </form>
        <div className="mt-5 flex flex-wrap gap-2">
          {SCHOOLS.map((school) => <button key={school} type="button" onClick={() => go(school)} className="rounded-full border border-stone-200 px-3 py-1.5 text-meta text-stone-700 hover:bg-sunken">{shortSchool(school)}</button>)}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="self-center text-meta text-stone-500">Explore</span>
          {EXAMPLES.map((example) => <button key={example} type="button" onClick={() => go(example)} className="text-meta text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-ink">{example}</button>)}
        </div>
      </div>
    </section>
  );
}

function StatsStrip({ loading, error, stats }: { loading: boolean; error: unknown; stats: { papers: number; scholars: number; clusters: number; posts: number } | null }) {
  const items = [["Indexed papers", stats?.papers], ["Active scholars", stats?.scholars], ["Research clusters", stats?.clusters], ["Campus discussions", stats?.posts]];
  return (
    <section aria-label="Commons statistics" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-stone-200 bg-paper p-4 sm:p-5">
          {loading && !stats ? <Skeleton className="h-8 w-20" /> : error ? <span className="text-meta text-stone-400">—</span> : <p className="num font-serif text-[26px] leading-8 text-ink">{fmtInt(Number(value ?? 0))}</p>}
          <p className="mt-1 text-meta text-stone-500">{label}</p>
        </div>
      ))}
    </section>
  );
}

function TrendingThemes() {
  const { data, error, loading, reload } = useAsync((signal) => getTopicAssociations("ALL", signal), []);
  return (
    <Panel eyebrow="Across the corpus" title="Research themes" actions={<Link href="/analytics?tab=associations" className="inline-flex items-center gap-1 text-meta font-medium text-stone-600 hover:text-ink">See all themes <ArrowRight className="h-4 w-4" /></Link>}>
      {loading && !data ? <div className="space-y-3 p-5"><Skeleton className="h-7 w-2/3" /><Skeleton className="h-7 w-4/5" /></div>
        : error ? <ErrorState error={error} onRetry={reload} />
          : !data || data.bundles.length === 0 ? <EmptyState title="No themes to show yet" hint="Research clusters will appear as the corpus grows." />
            : <div className="flex flex-wrap gap-2 p-5">{data.bundles.slice(0, 6).map((bundle, index) => <Link key={`${bundle.items.join("-")}-${index}`} href={`/search?q=${encodeURIComponent(bundle.items.join(" "))}`} className="rounded-full border border-stone-200 bg-canvas px-3.5 py-2 text-ui text-stone-700 hover:border-stone-300 hover:text-ink">{bundle.items.join(" · ")}</Link>)}</div>}
    </Panel>
  );
}

function BreakoutScholars() {
  const { data, error, loading, reload } = useAsync((signal) => getAnomalies(signal), []);
  return (
    <Panel eyebrow="High impact" title="Breakout scholar spotlights" actions={<Link href="/analytics?tab=anomalies" className="inline-flex items-center gap-1 text-meta font-medium text-stone-600 hover:text-ink">View all <ArrowRight className="h-4 w-4" /></Link>}>
      {loading && !data ? <SkeletonCard rows={3} className="border-0" />
        : error ? <ErrorState error={error} onRetry={reload} />
          : !data || data.spotlights.length === 0 ? <EmptyState title="No spotlights right now" hint="Notable research impact will appear here." />
            : <ul className="divide-y divide-stone-100">{data.spotlights.slice(0, 3).map((person) => <li key={person.id} className="flex gap-3 p-4"><Avatar name={person.title} size={38} /><div className="min-w-0"><p className="font-medium text-ink">{person.title}</p><p className="text-meta text-stone-500">{person.reason ?? person.entity_ref}</p></div></li>)}</ul>}
    </Panel>
  );
}

function RecentDiscussions({ loading, error, posts }: { loading: boolean; error: unknown; posts: HomePayload["recent_posts"] | null }) {
  return (
    <Panel eyebrow="Campus community" title="Recent discussions" actions={<Link href="/feed" className="inline-flex items-center gap-1 text-meta font-medium text-stone-600 hover:text-ink">View all <ArrowRight className="h-4 w-4" /></Link>}>
      {loading && !posts ? <SkeletonCard rows={3} className="border-0" />
        : error ? <ErrorState error={error} />
          : !posts || posts.length === 0 ? <EmptyState title="The feed is quiet" hint="Start a conversation with the Chanakya community." />
            : <ul className="divide-y divide-stone-100">{posts.slice(0, 4).map((post) => <li key={post.post_id} className="flex items-start gap-3 p-4"><Avatar name={post.author_name} size={34} /><div className="min-w-0 flex-1"><Link href={`/feed/${post.post_id}`} className="font-serif text-h3 text-ink hover:underline">{post.title}</Link><p className="mt-1 text-meta text-stone-500">{post.author_name} · {shortSchool(post.author_dept)} · {relTime(post.created_at)}</p><div className="mt-2 flex flex-wrap items-center gap-2">{post.tags?.slice(0, 1).map((tag) => <Tag key={tag}>{tag}</Tag>)}<span className="num inline-flex items-center gap-1 text-meta text-stone-500"><MessageSquare className="h-3.5 w-3.5" />{fmtInt(post.comment_count)}</span><span className="num text-meta text-stone-500">{fmtInt(post.upvote_count)} score</span></div></div></li>)}</ul>}
    </Panel>
  );
}

export function HomeWorkspace() {
  const home = useAsync((signal) => getHome(signal), []);
  return (
    <div className="space-y-10">
      <Hero />
      <StatsStrip loading={home.loading} error={home.error} stats={home.data?.stats ?? null} />
      <TrendingThemes />
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="eyebrow">Selected from the collection</p><h2 className="mt-1 font-serif text-h2 text-ink">Featured papers</h2></div>
          <Link href="/library" className="text-meta font-medium text-stone-600 hover:text-ink">Browse the library</Link>
        </div>
        {home.loading && !home.data ? <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((n) => <SkeletonCard key={n} rows={3} />)}</div>
          : home.error ? <ErrorState error={home.error} onRetry={home.reload} />
            : !home.data?.featured_papers.length ? <EmptyState title="No featured papers yet" hint="Papers in the university collection will be highlighted here." />
              : <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3">{home.data.featured_papers.slice(0, 6).map((paper) => <PaperCard key={paper.paper_id} paper={paper} />)}</div>}
      </section>
      <BreakoutScholars />
      <RecentDiscussions loading={home.loading} error={home.error} posts={home.data?.recent_posts ?? null} />
    </div>
  );
}
