"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { PaperCard } from "@/components/paper/PaperCard";
import { Avatar } from "@/components/ui/Section";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Tag } from "@/components/ui/Pill";
import { useAuth } from "@/context/AuthContext";
import { getHome, search } from "@/lib/api";
import { authorsLine, fmtInt, relTime, shortSchool } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { SCHOOLS, SCHOOL_CODES, type Paper, type SearchResponse } from "@/types/crc";

const EXAMPLES = ["graph neural networks", "contract law and AI", "protein structure", "supply chain resilience", "signal processing"];

/** Counts up once when the figure first arrives; respects reduced motion. */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!value) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1100);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span className="num">{fmtInt(shown)}</span>;
}

function useRotatingExample() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setIndex((i) => (i + 1) % EXAMPLES.length), 3200);
    return () => window.clearInterval(id);
  }, []);
  return EXAMPLES[index];
}

function PanelGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-stone-100 px-5 py-4 first:border-t-0">
      <h3 className="text-meta font-semibold text-stone-500">{title}</h3>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

/** The page answers as you type: real library, discussion and people matches, no page change needed. */
function LivePanel({ query, featured, recent, homeLoading }: { query: string; featured: Paper[]; recent: { post_id: string; title: string; author_name: string; created_at: string }[]; homeLoading: boolean }) {
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const term = query.trim();

  useEffect(() => {
    if (term.length < 2) {
      setResult(null);
      setFailed(false);
      setBusy(false);
      return;
    }
    const ctrl = new AbortController();
    setBusy(true);
    const timer = window.setTimeout(() => {
      search(term, ctrl.signal)
        .then((r) => {
          setResult(r);
          setFailed(false);
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setFailed(true);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setBusy(false);
        });
    }, 280);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [term]);

  const searching = term.length >= 2;
  const papers = searching ? (result?.panels.library ?? []).slice(0, 3) : featured.slice(0, 3);
  const posts = searching ? (result?.panels.posts ?? []).slice(0, 2).map((p) => ({ post_id: p.post_id, title: p.title, author_name: p.author_name, created_at: "" })) : recent.slice(0, 2);
  const people = searching ? (result?.panels.people ?? []).slice(0, 2) : [];
  const nothing = searching && !busy && !failed && papers.length + posts.length + people.length === 0;

  return (
    <div className="card flex min-h-[420px] flex-col overflow-hidden" aria-live="polite">
      <header className="flex items-center justify-between gap-3 border-b border-stone-100 bg-stone-50 px-5 py-3">
        <p className="min-w-0 truncate font-display text-[17px] text-ink">
          {searching ? <>Matches for “{term}”</> : "Most saved this week"}
        </p>
        {searching && (
          <Link href={`/search?q=${encodeURIComponent(term)}`} className="shrink-0 text-meta font-medium text-brand-600 hover:underline">See all results</Link>
        )}
      </header>
      <div className="min-h-0 flex-1">
        {(searching && busy && !result) || (!searching && homeLoading) ? (
          <div className="space-y-4 p-5"><Skeleton className="h-5 w-4/5" /><Skeleton className="h-4 w-2/5" /><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/3" /></div>
        ) : failed ? (
          <p className="p-5 text-meta text-stone-500">Search is unavailable right now. Press Enter to try the full search page.</p>
        ) : nothing ? (
          <EmptyState className="py-10" title="Nothing matches yet" hint="Try a broader topic, an author or a school name." />
        ) : (
          <div className={busy ? "opacity-60 transition-opacity" : "transition-opacity"}>
            {papers.length > 0 && (
              <PanelGroup title="Papers">
                {papers.map((paper) => (
                  <div key={paper.paper_id}>
                    <Link href={`/papers/${paper.paper_id}`} className="font-display text-[16px] leading-snug text-ink hover:text-brand-600 hover:underline">{paper.canonical_title}</Link>
                    <p className="mt-0.5 truncate text-label text-stone-500">{[authorsLine(paper.authors, 2), paper.publication_year].filter(Boolean).join(", ")}</p>
                  </div>
                ))}
              </PanelGroup>
            )}
            {posts.length > 0 && (
              <PanelGroup title="Discussions">
                {posts.map((post) => (
                  <div key={post.post_id}>
                    <Link href={`/feed/${post.post_id}`} className="text-ui font-medium text-ink hover:text-brand-600 hover:underline">{post.title}</Link>
                    <p className="text-label text-stone-500">{post.author_name}{post.created_at ? `, ${relTime(post.created_at)}` : ""}</p>
                  </div>
                ))}
              </PanelGroup>
            )}
            {people.length > 0 && (
              <PanelGroup title="Scholars">
                {people.map((person) => (
                  <Link key={person.user_id} href={`/u/${person.user_id}`} className="flex items-center gap-3 hover:text-brand-600">
                    <Avatar name={person.full_name} size={30} />
                    <span className="min-w-0"><span className="block truncate text-ui font-medium text-ink">{person.full_name}</span><span className="block truncate text-label text-stone-500">{shortSchool(person.department)}</span></span>
                  </Link>
                ))}
              </PanelGroup>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Hero({ home }: { home: ReturnType<typeof useAsync<Awaited<ReturnType<typeof getHome>>>> }) {
  const router = useRouter();
  const { user } = useAuth();
  const example = useRotatingExample();
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const first = user?.full_name.split(" ")[0];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const term = query.trim();
    if (term) router.push(`/search?q=${encodeURIComponent(term)}`);
    else input.current?.focus();
  };

  return (
    <section className="grid min-w-0 items-start gap-10 py-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14 lg:py-10">
      <div className="min-w-0">
        <p className="text-ui font-medium text-brand-600">{first ? `Welcome back, ${first}` : "Chanakya University Research Commons"}</p>
        <h1 className="mt-3 font-display text-[40px] font-semibold leading-[1.06] tracking-tight text-ink sm:text-[52px] lg:text-[60px]">
          What is Chanakya reading this week?
        </h1>
        <p className="mt-5 max-w-lg text-body leading-relaxed text-stone-600">
          Search papers, scholars and discussions from all six schools, or see what your colleagues are saving and debating right now.
        </p>

        <form onSubmit={submit} role="search" className="mt-8 flex h-14 max-w-xl items-center gap-2 rounded-xl border border-stone-300 bg-paper pl-4 pr-1.5 shadow-card transition focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
          <Search aria-hidden className="h-5 w-5 shrink-0 text-stone-400" />
          <div className="relative min-w-0 flex-1">
            <input
              ref={input}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search the commons"
              autoComplete="off"
              className="h-14 w-full bg-transparent text-body text-ink focus:outline-none"
            />
            {!query && (
              <span aria-hidden key={example} className="pointer-events-none absolute inset-y-0 left-0 flex animate-fade items-center truncate text-body text-stone-400">
                Try “{example}”
              </span>
            )}
          </div>
          <button type="submit" className="btn-primary h-11">Search</button>
        </form>

        <p className="mt-4 flex max-w-xl flex-wrap items-center gap-x-2 gap-y-2 text-meta text-stone-500">
          Popular:
          {EXAMPLES.slice(0, 4).map((item) => (
            <button key={item} type="button" onClick={() => { setQuery(item); input.current?.focus(); }} className="rounded-md border border-stone-200 bg-paper px-2.5 py-1 text-stone-700 transition hover:border-brand-300 hover:text-brand-700">{item}</button>
          ))}
        </p>
      </div>

      <LivePanel
        query={query}
        featured={home.data?.featured_papers ?? []}
        recent={home.data?.recent_posts ?? []}
        homeLoading={home.loading && !home.data}
      />
    </section>
  );
}

function StatsSentence({ stats }: { stats: { papers: number; scholars: number; clusters: number; posts: number } | null }) {
  return (
    <section aria-label="The commons in numbers" className="border-y border-stone-200 py-7">
      {stats ? (
        <p className="max-w-4xl font-display text-[24px] font-normal leading-snug text-stone-700 sm:text-[30px]">
          The commons holds <strong className="font-semibold text-ink"><CountUp value={stats.papers} /></strong> papers, <strong className="font-semibold text-ink"><CountUp value={stats.scholars} /></strong> scholars and <strong className="font-semibold text-ink"><CountUp value={stats.posts} /></strong> discussions, grouped into <strong className="font-semibold text-ink"><CountUp value={stats.clusters} /></strong> research clusters.
        </p>
      ) : (
        <div className="space-y-2"><Skeleton className="h-8 w-full max-w-3xl" /><Skeleton className="h-8 w-2/3 max-w-xl" /></div>
      )}
    </section>
  );
}

function SchoolIndex() {
  return (
    <section aria-label="Browse by school" className="py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-[28px] leading-tight text-ink">Six schools, one library</h2>
        <Link href="/library" className="text-ui font-medium text-brand-600 hover:underline">Browse all papers</Link>
      </div>
      <ul className="mt-5 grid border-t border-stone-200 sm:grid-cols-2 sm:gap-x-12">
        {SCHOOLS.map((school) => (
          <li key={school} className="border-b border-stone-200">
            <Link href={`/library?school=${encodeURIComponent(school)}`} className="group flex items-center gap-4 py-4">
              <span className="w-[4.25rem] shrink-0 font-display text-[18px] text-brand-600">{SCHOOL_CODES[school]}</span>
              <span className="min-w-0 flex-1 text-body text-ink">{school.replace("School of ", "")}</span>
              <ArrowRight aria-hidden className="h-4 w-4 -translate-x-1 text-stone-400 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const ENTRY_POINTS = [
  { href: "/feed", title: "Join a discussion", text: "Share a finding, ask a question and get replies from scholars in other schools." },
  { href: "/library", title: "Build your reading list", text: "Save papers, group them into collections and get recommendations that learn from them." },
  { href: "/assistant", title: "Ask with sources", text: "Get answers drawn from the library, with the passages they came from." },
];

function EntryPoints() {
  return (
    <section aria-label="Ways to use the commons" className="grid gap-8 border-t border-stone-200 py-10 md:grid-cols-3 md:gap-0">
      {ENTRY_POINTS.map((item, index) => (
        <div key={item.href} className={index > 0 ? "md:border-l md:border-stone-200 md:pl-8" : "md:pr-8"}>
          <h2 className="font-display text-[22px] leading-snug text-ink">{item.title}</h2>
          <p className="mt-2 max-w-xs text-ui leading-relaxed text-stone-600">{item.text}</p>
          <Link href={item.href} className="mt-3 inline-flex items-center gap-1.5 text-ui font-medium text-brand-600 hover:underline">Open <ArrowRight className="h-4 w-4" /></Link>
        </div>
      ))}
    </section>
  );
}

export function HomeWorkspace() {
  const home = useAsync((signal) => getHome(signal), []);
  const posts = useMemo(() => home.data?.recent_posts ?? [], [home.data]);
  return (
    <div>
      <Hero home={home} />
      <StatsSentence stats={home.data?.stats ?? null} />
      <SchoolIndex />
      <EntryPoints />

      <section className="border-t border-stone-200 py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-[28px] leading-tight text-ink">Featured papers</h2>
          <Link href="/library" className="text-ui font-medium text-brand-600 hover:underline">Open the library</Link>
        </div>
        <div className="mt-5">
          {home.loading && !home.data ? <div className="grid gap-3 md:grid-cols-2">{[0, 1].map((n) => <SkeletonCard key={n} rows={3} />)}</div>
            : home.error ? <ErrorState error={home.error} onRetry={home.reload} />
              : !home.data?.featured_papers.length ? <EmptyState title="No featured papers yet" hint="Papers in the university collection will be highlighted here." />
                : <div className="grid min-w-0 gap-3 md:grid-cols-2">{home.data.featured_papers.slice(0, 6).map((paper) => <PaperCard key={paper.paper_id} paper={paper} />)}</div>}
        </div>
      </section>

      <section className="border-t border-stone-200 py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-[28px] leading-tight text-ink">Latest from the feed</h2>
          <Link href="/feed" className="text-ui font-medium text-brand-600 hover:underline">See every discussion</Link>
        </div>
        <ul className="mt-5 divide-y divide-stone-200 border-y border-stone-200">
          {home.loading && !home.data ? <li className="py-5"><Skeleton className="h-6 w-2/3" /></li>
            : posts.length === 0 ? <li className="py-8"><EmptyState title="The feed is quiet" hint="Start a conversation with the Chanakya community." /></li>
              : posts.slice(0, 4).map((post) => (
                <li key={post.post_id} className="flex items-start gap-4 py-5">
                  <Avatar name={post.author_name} size={38} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/feed/${post.post_id}`} className="font-display text-[20px] leading-snug text-ink hover:text-brand-600 hover:underline">{post.title}</Link>
                    <p className="mt-1 text-meta text-stone-500">{post.author_name}, {shortSchool(post.author_dept)}, {relTime(post.created_at)}</p>
                  </div>
                  <div className="hidden shrink-0 items-center gap-3 sm:flex">
                    {post.tags?.slice(0, 1).map((tag) => <Tag key={tag}>{tag}</Tag>)}
                    <span className="num text-meta text-stone-500">{fmtInt(post.comment_count)} replies</span>
                  </div>
                </li>
              ))}
        </ul>
      </section>
    </div>
  );
}
