"use client";

import { useState } from "react";
import { ArrowUp, ExternalLink, MessageCircle } from "lucide-react";
import { Panel, Avatar } from "@/components/ui/Section";
import { Meter } from "@/components/ui/Meter";
import { PrestigeTier } from "@/components/ui/PrestigeTier";
import { Pill, Tag } from "@/components/ui/Pill";
import { SaveButton } from "@/components/ui/SaveButton";
import { EmptyState } from "@/components/ui/States";
import { authorsLine, cx, fmtInt, fmtPct, shortSchool } from "@/lib/format";
import Link from "next/link";
import type { Paper, PersonMatch, PostHit } from "@/types/crc";

const SOURCE_LABELS: Record<string, string> = { openalex: "OpenAlex", arxiv: "arXiv", rss: "RSS feed", crossref: "Crossref", external: "External" };

/* ----------------------------- shared pieces ----------------------------- */

function PanelEmpty({ what }: { what: string }) {
  return <EmptyState className="py-8" title={`No ${what} matched`} hint="Try a broader phrase or one of the related topics above." />;
}

function doiUrl(doi: string | null | undefined): string | null {
  if (!doi) return null;
  return doi.startsWith("http") ? doi : `https://doi.org/${doi}`;
}

function rankedPapers(papers: Paper[]): Paper[] {
  const sorted = [...papers].sort((a, b) => a.pagerank_score - b.pagerank_score);
  const ranks = new Map(sorted.map((paper, index) => [paper.paper_id, sorted.length < 2 ? 0 : index / (sorted.length - 1)]));
  return papers.map((paper) => ({ ...paper, pagerank_percentile: paper.pagerank_percentile ?? ranks.get(paper.paper_id) ?? 0 }));
}

/* ------------------------------ 1. library ------------------------------ */

export function LibraryPanel({ papers }: { papers: Paper[] }) {
  const ranked = rankedPapers(papers);
  return (
    <Panel eyebrow="Panel 1" title="Chanakya Library holdings" meta={papers.length} bodyClassName="max-h-[640px] overflow-y-auto">
      {papers.length === 0 ? (
        <PanelEmpty what="library holdings" />
      ) : (
        <ul className="divide-y divide-stone-100">
          {ranked.map((p) => (
            <li key={p.paper_id} className="group px-4 py-3.5 transition-colors hover:bg-canvas/70">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/papers/${p.paper_id}`} className="min-w-0 text-left">
                  <h3 className="font-display text-[16.5px] leading-snug text-ink underline decoration-transparent underline-offset-[3px] transition-colors group-hover:decoration-stone-300">
                    {p.canonical_title}
                  </h3>
                </Link>
                <SaveButton paperId={p.paper_id} className="shrink-0" />
              </div>
              <p className="mt-1 text-meta text-stone-500">
                {[authorsLine(p.authors, 2), p.venue, p.publication_year].filter(Boolean).join(" · ")}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-meta text-stone-500">
                <PrestigeTier percentile={p.pagerank_percentile} score={p.pagerank_score} compact />
                <span className="num">
                  Saved by {fmtInt(p.save_count)} member{p.save_count === 1 ? "" : "s"}
                </span>
              </div>
              {p.topics && p.topics.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {p.topics.slice(0, 4).map((t) => (
                    <Tag key={t}>{t}</Tag>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------ 2. external ------------------------------ */

function ExternalItem({ p }: { p: Paper }) {
  const [expanded, setExpanded] = useState(false);
  const href = doiUrl(p.doi);
  return (
    <li className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/papers/${p.paper_id}`} className="min-w-0 text-left">
          <h3 className="font-display text-[16.5px] leading-snug text-ink hover:underline hover:decoration-stone-300 hover:underline-offset-[3px]">
            {p.canonical_title}
          </h3>
        </Link>
        <SaveButton paperId={p.paper_id} className="shrink-0" />
      </div>
      <p className="mt-1 text-meta text-stone-500">
        {[authorsLine(p.authors, 2), p.venue, p.publication_year].filter(Boolean).join(" · ")}
      </p>
      {p.abstract && (
        <div className="mt-2">
          <p className={cx("text-meta leading-relaxed text-stone-600", !expanded && "line-clamp-3")}>{p.abstract}</p>
          {p.abstract.length > 220 && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-1 text-meta font-medium text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-ink"
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {p.item_type === "article" && <Pill>Article</Pill>}
        {p.sources?.map((s) => (
          <Pill key={s}>{SOURCE_LABELS[s.toLowerCase()] ?? s}</Pill>
        ))}
        {p.item_type === "article" && p.url && (
          <a
            href={p.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-meta font-medium text-stone-600 underline decoration-stone-300 underline-offset-2 hover:text-ink"
          >
            Original <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-meta font-medium text-stone-600 underline decoration-stone-300 underline-offset-2 hover:text-ink"
          >
            DOI <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {p.rrf_score !== undefined && (
          <span className="num ml-auto text-meta text-stone-400" title="Reciprocal Rank Fusion score (semantic + keyword + PageRank)">
            RRF {p.rrf_score.toFixed(4)}
          </span>
        )}
      </div>
    </li>
  );
}

export function ExternalPanel({ papers }: { papers: Paper[] }) {
  const ranked = rankedPapers(papers);
  return (
    <Panel eyebrow="Panel 2" title="External open literature" meta={papers.length} bodyClassName="max-h-[640px] overflow-y-auto">
      {papers.length === 0 ? (
        <PanelEmpty what="external works" />
      ) : (
        <ul className="divide-y divide-stone-100">
          {ranked.map((p) => <ExternalItem key={p.paper_id} p={p} />)}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------- 3. people ------------------------------- */

export function PeoplePanel({ people }: { people: PersonMatch[] }) {
  return (
    <Panel eyebrow="Panel 3" title="University scholars" meta={people.length} bodyClassName="max-h-[640px] overflow-y-auto">
      {people.length === 0 ? (
        <PanelEmpty what="scholars" />
      ) : (
        <ul className="divide-y divide-stone-100">
          {people.map((u) => (
            <li key={u.user_id} className="flex gap-3 px-4 py-3.5">
              <Avatar name={u.full_name} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="truncate text-[14.5px] font-medium text-ink">{u.full_name}</h3>
                  <span className="num shrink-0 text-meta text-stone-500">{fmtPct(u.similarity)} match</span>
                </div>
                <p className="text-meta text-stone-500">
                  <span className="capitalize">{u.role}</span> · {shortSchool(u.department)}
                </p>
                <Meter value={u.similarity} tone="stone" className="mt-2" label="Profile similarity" />
                {u.interest_tags && u.interest_tags.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {u.interest_tags.slice(0, 5).map((t) => (
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
  );
}

/* ------------------------------- 4. posts -------------------------------- */

export function PostsPanel({ posts }: { posts: PostHit[] }) {
  return (
    <Panel
      eyebrow="Panel 4"
      title="Campus discussions"
      meta={posts.length}
      actions={
        <Link href="/feed" className="text-meta font-medium text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-ink">
          Open feed
        </Link>
      }
      bodyClassName="max-h-[640px] overflow-y-auto"
    >
      {posts.length === 0 ? (
        <PanelEmpty what="discussions" />
      ) : (
        <ul className="divide-y divide-stone-100">
          {posts.map((p) => (
            <li key={p.post_id} className="px-4 py-3.5">
              <h3 className="font-display text-[16.5px] leading-snug text-ink"><Link href={`/feed/${p.post_id}`} className="hover:underline">{p.title}</Link></h3>
              <p className="mt-1.5 line-clamp-2 text-meta leading-relaxed text-stone-600">{p.body}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-stone-500">
                <span>
                  {p.author_name} · {shortSchool(p.department)}
                </span>
                <span className="num inline-flex items-center gap-1">
                  <ArrowUp className="h-3 w-3" /> {fmtInt(p.upvote_count)}
                </span>
                <span className="num ml-auto inline-flex items-center gap-1 text-stone-400">
                  <MessageCircle className="h-3 w-3" /> {fmtPct(p.similarity)} relevant
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
