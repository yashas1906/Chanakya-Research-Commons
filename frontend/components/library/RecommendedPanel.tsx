"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ChevronDown, Info, Sparkles } from "lucide-react";
import { PaperRow } from "@/components/library/PaperRow";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { SkeletonList } from "@/components/ui/Skeleton";
import { Avatar } from "@/components/ui/Section";
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
      <details className="group border-b border-stone-100 px-4 py-2.5 sm:px-5">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-meta text-stone-600 [&::-webkit-details-marker]:hidden">
          <Info className="h-4 w-4 shrink-0 text-saffron-600" />
          <span className="min-w-0 flex-1">
            Matched to your profile{saves.saves.length > 0 ? ` and your ${saves.saves.length} saved paper${saves.saves.length === 1 ? "" : "s"}` : ""}.
          </span>
          <span className="font-medium text-stone-500 group-open:hidden">How?</span>
          <ChevronDown className="h-4 w-4 text-stone-400 transition-transform group-open:rotate-180" />
        </summary>
        <p className="mt-2 pl-6 text-meta leading-relaxed text-stone-600">
          Every paper and every member profile is turned into a meaning vector. Papers are ranked by how close they sit to your bio and interests
          {saves.saves.length > 0 ? " and to the papers you saved" : " (save a few papers and it will start learning from them)"}, and papers you already saved are hidden.
          The tier tag is the paper’s PageRank tier: how influential it is in the citation graph, not how well it matches you.
        </p>
      </details>
      {recs.loading && !recs.data ? (
        <SkeletonList rows={4} />
      ) : recs.error ? (
        <ErrorState error={recs.error} onRetry={recs.reload} />
      ) : papers.length === 0 ? (
        <EmptyState title="Nothing to recommend yet" hint="Add interests to your profile or save a few papers to tune this list." />
      ) : (
        <ul className="divide-y divide-stone-100">
          {papers.map((paper) => (
            <PaperRow
              key={paper.paper_id}
              paper={paper}
              badge={
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-0.5 font-semibold text-brand-700">
                    <Sparkles className="h-3.5 w-3.5" /> {pct(paper.match_score)} match
                  </span>
                  <span>{paper.reason === "co_saved" ? "Saved by readers with libraries like yours" : paper.reason === "saved" ? "Similar to papers you saved" : "Fits your profile and interests"}</span>
                </span>
              }
            />
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
