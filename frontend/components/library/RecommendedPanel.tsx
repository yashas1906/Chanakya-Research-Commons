"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Info, Sparkles } from "lucide-react";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { SaveButton } from "@/components/ui/SaveButton";
import { SkeletonList } from "@/components/ui/Skeleton";
import { Avatar } from "@/components/ui/Section";
import { Tag } from "@/components/ui/Pill";
import { PrestigeTier } from "@/components/ui/PrestigeTier";
import { useAuth } from "@/context/AuthContext";
import { getRecommendations } from "@/lib/api";
import { shortSchool } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useSaves } from "@/lib/saves-context";
import type { RecommendedPaper } from "@/types/crc";

function dedupe(papers: RecommendedPaper[]): RecommendedPaper[] {
  const ids = new Set<string>();
  const titles = new Set<string>();
  return papers.filter((paper) => {
    const title = paper.canonical_title.trim().toLowerCase().replace(/\s+/g, " ");
    if (ids.has(paper.paper_id) || titles.has(title)) return false;
    ids.add(paper.paper_id);
    titles.add(title);
    return true;
  });
}

const pct = (value: number) => `${Math.max(0, Math.min(99, Math.round(value * 100)))}%`;

export function RecommendedPanel() {
  const { user, status: authStatus, promptLogin } = useAuth();
  const saves = useSaves();
  const userId = user?.user_id ?? null;
  const recs = useAsync((signal) => getRecommendations(userId!, signal), [userId, saves.saves.length], authStatus === "authenticated" && !!userId);
  const papers = useMemo(() => dedupe(recs.data?.papers ?? []).slice(0, 8), [recs.data]);
  const people = (recs.data?.people ?? []).slice(0, 4);

  if (authStatus !== "authenticated") {
    return <EmptyState className="py-12" icon={<Sparkles className="h-6 w-6" />} title="Log in for recommendations" hint="We match papers to your bio, interests and the papers you save." action={<button type="button" className="btn-primary" onClick={() => promptLogin("login")}>Log in</button>} />;
  }

  return (
    <div>
      <div className="flex items-start gap-3 border-b border-stone-100 bg-saffron-50/60 px-4 py-3 sm:px-5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-saffron-600" />
        <p className="text-meta leading-relaxed text-stone-600">
          <span className="font-semibold text-ink">How this list is made.</span> Every paper and every member profile is turned into a meaning vector. We rank papers by how close they sit to your bio and interests
          {saves.saves.length > 0 ? ` and to the ${saves.saves.length} paper${saves.saves.length === 1 ? "" : "s"} you saved` : " (save a few papers and it will start learning from them)"}, then hide what you already saved.
          The grey tag shows the paper’s <span className="font-semibold text-ink">PageRank tier</span>: how influential it is in the citation graph, not how well it matches you.
        </p>
      </div>
      {recs.loading && !recs.data ? (
        <SkeletonList rows={4} />
      ) : recs.error ? (
        <ErrorState error={recs.error} onRetry={recs.reload} />
      ) : papers.length === 0 ? (
        <EmptyState title="Nothing to recommend yet" hint="Add interests to your profile or save a few papers to tune this list." />
      ) : (
        <ul className="divide-y divide-stone-100">
          {papers.map((paper) => (
            <li key={paper.paper_id} className="min-w-0 px-4 py-4 transition-colors hover:bg-sunken sm:px-5">
              <div className="flex min-w-0 items-start justify-between gap-4">
                <div className="min-w-0">
                  <Link href={`/papers/${paper.paper_id}`} className="font-display text-h3 leading-snug text-ink hover:underline hover:decoration-stone-300 hover:underline-offset-4">{paper.canonical_title}</Link>
                  <p className="mt-1 text-meta text-stone-500">{[paper.venue, paper.publication_year].filter(Boolean).join(" · ") || "Publication details unavailable"}</p>
                </div>
                <SaveButton paperId={paper.paper_id} className="shrink-0" />
              </div>
              <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-meta text-stone-500">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-0.5 font-semibold text-brand-700">
                  <Sparkles className="h-3.5 w-3.5" /> {pct(paper.match_score)} match
                </span>
                <span>{paper.reason === "saved" ? "Similar to papers you saved" : "Fits your profile and interests"}</span>
                <PrestigeTier percentile={paper.pagerank_percentile} score={paper.pagerank_score} compact />
                {paper.topics?.slice(0, 2).map((tag) => <Tag key={tag}>{tag}</Tag>)}
              </div>
            </li>
          ))}
        </ul>
      )}
      {people.length > 0 && (
        <div className="border-t border-stone-100 px-4 py-4 sm:px-5">
          <h3 className="font-display text-[16px] text-ink">Scholars with similar interests</h3>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {people.map((person) => (
              <li key={person.user_id}>
                <Link href={`/u/${person.user_id}`} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-paper p-3 transition hover:border-brand-200 hover:bg-brand-50">
                  <Avatar name={person.full_name} size={36} />
                  <span className="min-w-0">
                    <span className="block truncate text-ui font-medium text-ink">{person.full_name}</span>
                    <span className="flex items-center gap-2 text-label text-stone-500"><RoleBadge role={person.role} />{shortSchool(person.department)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
