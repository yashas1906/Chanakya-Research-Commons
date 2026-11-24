"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUp, ExternalLink, FileText, Info, Library, MessageSquare } from "lucide-react";
import { Avatar } from "@/components/ui/Section";
import { PrestigeTier } from "@/components/ui/PrestigeTier";
import { Pill, Tag } from "@/components/ui/Pill";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { SaveButton } from "@/components/ui/SaveButton";
import { FollowUserButton } from "@/components/ui/FollowUserButton";
import { authorsLine, cx, fmtInt, fmtPct, relTime, shortSchool } from "@/lib/format";
import type { Paper, PersonMatch, PostHit } from "@/types/crc";

const SOURCE_LABELS: Record<string, string> = { openalex: "OpenAlex", arxiv: "arXiv", rss: "RSS feed", crossref: "Crossref", external: "External" };

function doiUrl(doi: string | null | undefined): string | null {
  if (!doi) return null;
  return doi.startsWith("http") ? doi : `https://doi.org/${doi}`;
}

/** Ranking details stay out of the way: one small "Why this result" hint with the numbers on hover/focus. */
function WhyThis({ text }: { text: string }) {
  return (
    <span tabIndex={0} title={text} aria-label={`Why this result: ${text}`} className="ml-auto inline-flex cursor-help items-center gap-1 text-label text-stone-400 hover:text-stone-600 focus:text-stone-600 focus:outline-none">
      <Info className="h-3.5 w-3.5" /> Why this result
    </span>
  );
}

/* --------------------------------- papers -------------------------------- */

export function PaperResult({ paper }: { paper: Paper }) {
  const [expanded, setExpanded] = useState(false);
  const href = doiUrl(paper.doi);
  const inLibrary = paper.in_chanakya_library === true;
  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/papers/${paper.paper_id}`} className="font-display text-h3 leading-snug text-ink hover:underline hover:decoration-stone-300 hover:underline-offset-4">
            {paper.canonical_title}
          </Link>
          <p className="mt-1 text-meta text-stone-500">{[authorsLine(paper.authors, 3), paper.venue, paper.publication_year].filter(Boolean).join(" · ") || "Publication details unavailable"}</p>
        </div>
        <SaveButton paperId={paper.paper_id} className="shrink-0" />
      </div>
      {paper.abstract && (
        <div className="mt-2">
          <p className={cx("max-w-3xl text-meta leading-relaxed text-stone-600", !expanded && "line-clamp-2")}>{paper.abstract}</p>
          {paper.abstract.length > 220 && (
            <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-1 text-meta font-medium text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-ink">
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-meta text-stone-500">
        {inLibrary ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 font-semibold text-brand-700"><Library className="h-3.5 w-3.5" /> In Chanakya library</span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 font-medium text-stone-600">Open literature</span>
        )}
        {paper.item_type === "article" && <Pill>Article</Pill>}
        <PrestigeTier percentile={paper.pagerank_percentile} score={paper.pagerank_score} compact />
        {paper.save_count > 0 && <span className="num">{fmtInt(paper.save_count)} {paper.save_count === 1 ? "save" : "saves"}</span>}
        {paper.sources && paper.sources.length > 0 && <span>via {paper.sources.map((s) => SOURCE_LABELS[s.toLowerCase()] ?? s).join(", ")}</span>}
        {paper.item_type === "article" && paper.url && (
          <a href={paper.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-stone-600 underline decoration-stone-300 underline-offset-2 hover:text-ink">Original <ExternalLink className="h-3 w-3" /></a>
        )}
        {href && <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-stone-600 underline decoration-stone-300 underline-offset-2 hover:text-ink">DOI <ExternalLink className="h-3 w-3" /></a>}
        {paper.rrf_score !== undefined && (
          <WhyThis text={`Matches your words and their meaning (hybrid score ${paper.rrf_score.toFixed(4)}: semantic + keyword ranks fused with Reciprocal Rank Fusion).`} />
        )}
      </div>
    </li>
  );
}

/* --------------------------------- people -------------------------------- */

export function PersonResult({ person }: { person: PersonMatch }) {
  return (
    <li className="flex items-start gap-3 px-4 py-4 sm:px-5">
      <Link href={`/u/${person.user_id}`} className="shrink-0" aria-label={`Open ${person.full_name}'s profile`}>
        <Avatar name={person.full_name} size={40} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={`/u/${person.user_id}`} className="truncate text-ui font-semibold text-ink hover:text-brand-700 hover:underline">{person.full_name}</Link>
          <RoleBadge role={person.role} />
          <FollowUserButton userId={person.user_id} name={person.full_name} compact />
        </div>
        <p className="mt-0.5 text-meta text-stone-500">{shortSchool(person.department)}</p>
        {person.bio && <p className="mt-1.5 line-clamp-2 max-w-3xl text-meta leading-relaxed text-stone-600">{person.bio}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {person.interest_tags?.slice(0, 5).map((t) => <Tag key={t}>{t}</Tag>)}
          <WhyThis text={`Their profile and interests are a ${fmtPct(person.similarity)} match for this search.`} />
        </div>
      </div>
    </li>
  );
}

/* ------------------------------- discussions ------------------------------ */

export function DiscussionResult({ post }: { post: PostHit }) {
  return (
    <li className="px-4 py-4 sm:px-5">
      <Link href={`/feed/${post.post_id}`} className="font-display text-h3 leading-snug text-ink hover:underline hover:decoration-stone-300 hover:underline-offset-4">{post.title}</Link>
      <p className="mt-1 text-meta text-stone-500">
        {post.author_id ? <Link href={`/u/${post.author_id}`} className="font-medium text-stone-700 hover:text-ink hover:underline">{post.author_name}</Link> : post.author_name}
        {" · "}{shortSchool(post.department)}{post.created_at ? ` · ${relTime(post.created_at)}` : ""}
      </p>
      <p className="mt-1.5 line-clamp-2 max-w-3xl text-meta leading-relaxed text-stone-600">{post.body}</p>
      {post.attached_paper_id && post.attached_paper_title && (
        <Link href={`/papers/${post.attached_paper_id}`} className="mt-2.5 flex min-w-0 max-w-3xl items-center gap-2.5 rounded-lg bg-stone-50 px-3 py-2 ring-1 ring-inset ring-stone-200 transition hover:bg-brand-50 hover:ring-brand-200">
          <FileText className="h-4 w-4 shrink-0 text-brand-600" />
          <span className="min-w-0 flex-1 truncate text-meta font-medium text-ink">{post.attached_paper_title}</span>
          <span className="shrink-0 text-label font-semibold text-brand-600">Open paper →</span>
        </Link>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-stone-500">
        <span className="num inline-flex items-center gap-1"><ArrowUp className="h-3.5 w-3.5" /> {fmtInt(post.upvote_count)}</span>
        {post.comment_count !== undefined && <span className="num inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> {fmtInt(post.comment_count)}</span>}
        {post.tags?.slice(0, 3).map((t) => <Tag key={t}>{t}</Tag>)}
        <WhyThis text={`The discussion is a ${fmtPct(post.similarity)} match in meaning for this search.`} />
      </div>
    </li>
  );
}
