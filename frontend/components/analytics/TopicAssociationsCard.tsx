"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Meter } from "@/components/ui/Meter";
import { Chip, Tag } from "@/components/ui/Pill";
import { Panel } from "@/components/ui/Section";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Skeleton } from "@/components/ui/Skeleton";
import { getTopicAssociations } from "@/lib/api";
import { cx, fmtInt, fmtLift, fmtPct, shortSchool } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { MIN_RULE_LIFT } from "@/lib/normalize";
import type { AssociationRule, ThematicBundle } from "@/types/crc";
import { SCHOOLS } from "@/types/crc";

const SCOPES = ["ALL", ...SCHOOLS] as const;
type SortKey = "lift" | "confidence";

function BundleCard({ b, maxSupport }: { b: ThematicBundle; maxSupport: number }) {
  return (
    <li className="flex flex-col rounded-lg border border-stone-200/90 bg-paper p-3.5 transition-colors duration-150 hover:border-stone-300">
      <div className="flex flex-wrap gap-1.5">
        {b.items.map((k) => (
          <Tag key={k}>{k}</Tag>
        ))}
      </div>
      <div className="mt-auto pt-3.5">
        <div className="mb-1.5 flex items-baseline justify-between text-meta text-stone-500">
          <span className="num">
            {b.paper_count !== null ? (
              <>
                <span className="font-medium text-ink">{fmtInt(b.paper_count)}</span> papers
              </>
            ) : (
              "—"
            )}
          </span>
          <span className="num" title="Share of papers containing every keyword in the bundle">
            support {fmtPct(b.support, b.support < 0.1 ? 1 : 0)}
          </span>
        </div>
        <Meter value={maxSupport > 0 ? b.support / maxSupport : 0} tone="ink" label={`Support ${fmtPct(b.support, 1)}`} />
        <p className="mt-2 text-meta text-stone-400">{b.items.length}-keyword bundle</p>
      </div>
    </li>
  );
}

function RuleRow({ r, maxLift }: { r: AssociationRule; maxLift: number }) {
  return (
    <tr className="group transition-colors hover:bg-canvas/70">
      <td className="py-2.5 pl-4 pr-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="flex flex-wrap gap-1">
            {r.antecedents.map((a) => (
              <Tag key={a}>{a}</Tag>
            ))}
          </span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-stone-300" />
          <span className="flex flex-wrap gap-1">
            {r.consequents.map((c) => (
              <span key={c} className="inline-block rounded-md bg-ink px-1.5 py-0.5 text-meta leading-4 text-white">
                {c}
              </span>
            ))}
          </span>
        </div>
      </td>
      <td className="num w-28 px-3 py-2.5 text-right text-meta text-stone-700">
        <div className="flex items-center justify-end gap-2">
          <Meter value={r.confidence} tone="stone" className="w-10" label="Confidence" />
          {fmtPct(r.confidence)}
        </div>
      </td>
      <td className="num w-24 py-2.5 pl-3 pr-4 text-right">
        <span className={cx("text-[14px] font-semibold", r.lift >= maxLift * 0.8 ? "text-ink" : "text-stone-700")}>{fmtLift(r.lift)}</span>
      </td>
    </tr>
  );
}

function CardSkeleton() {
  return (
    <div className="space-y-6 p-5" role="status" aria-label="Loading topic associations">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}

/** FP-Max bundles and FP-Growth rules, stratified by school to avoid cross-department confounding. */
export function TopicAssociationsCard() {
  const [scope, setScope] = useState<(typeof SCOPES)[number]>("ALL");
  const [sort, setSort] = useState<SortKey>("lift");
  const [allBundles, setAllBundles] = useState(false);
  const [allRules, setAllRules] = useState(false);
  const { data, error, loading, reload } = useAsync((s) => getTopicAssociations(scope, s), [scope]);

  const bundles = data?.bundles ?? [];
  const rules = [...(data?.rules ?? [])].sort((a, b) => (sort === "lift" ? b.lift - a.lift : b.confidence - a.confidence));
  const maxSupport = Math.max(0, ...bundles.map((b) => b.support));
  const maxLift = Math.max(0, ...rules.map((r) => r.lift));
  const shownBundles = allBundles ? bundles : bundles.slice(0, 6);
  const shownRules = allRules ? rules : rules.slice(0, 10);

  return (
    <Panel
      eyebrow="Association mining"
      title="Topic associations"
      meta={data?.total_papers != null ? `${fmtInt(data.total_papers)} papers` : undefined}
    >
      <div className="border-b border-stone-100 px-5 py-3.5">
        <p className="eyebrow mb-2">Stratify by school</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="School stratification">
          {SCOPES.map((s) => (
            <Chip key={s} active={scope === s} onClick={() => setScope(s)}>
              {s === "ALL" ? "All schools" : shortSchool(s)}
            </Chip>
          ))}
        </div>
        <p className="mt-2.5 text-meta leading-relaxed text-stone-500">
          Rules are mined inside one school at a time, so a pattern reflects how that discipline actually writes — not a blend of departments.
        </p>
      </div>

      {loading && !data ? (
        <CardSkeleton />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? null : (
        <div className={cx("space-y-8 p-5 transition-opacity", loading && "opacity-60")}>
          <section>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <div>
                <h3 className="font-serif text-[18px] text-ink">Maximal thematic bundles</h3>
                <p className="text-meta text-stone-500">Longest keyword sets that appear together, with no larger set containing them (FP-Max).</p>
              </div>
              {bundles.length > 6 && (
                <button type="button" onClick={() => setAllBundles((a) => !a)} className="shrink-0 text-meta font-medium text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-ink">
                  {allBundles ? "Show fewer" : `Show all ${bundles.length}`}
                </button>
              )}
            </div>
            {bundles.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-200">
                <EmptyState className="py-8" title="No maximal bundles" hint="No keyword set cleared the support threshold for this scope." />
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {shownBundles.map((b) => (
                  <BundleCard key={b.items.join("|")} b={b} maxSupport={maxSupport} />
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h3 className="font-serif text-[18px] text-ink">High-lift topic associations</h3>
                <p className="text-meta text-stone-500">
                  Topics that co-occur more than chance: lift ≥ {MIN_RULE_LIFT.toFixed(1)}× (FP-Growth).
                </p>
              </div>
              <div role="group" aria-label="Sort rules by" className="flex rounded-md border border-stone-200/90 p-0.5 text-meta">
                {(["lift", "confidence"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={sort === k}
                    onClick={() => setSort(k)}
                    className={cx("rounded px-2 py-0.5 font-medium capitalize transition-colors", sort === k ? "bg-ink text-white" : "text-stone-500 hover:text-ink")}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
            {rules.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-200">
                <EmptyState className="py-8" title="No high-lift rules" hint={`No association reached ${MIN_RULE_LIFT.toFixed(1)}× lift for this scope.`} />
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-stone-200/90">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-stone-200/90 bg-sunken/60 text-left text-meta uppercase tracking-eyebrow text-stone-500">
                      <th className="py-2 pl-4 pr-3 font-medium">Antecedents → Consequents</th>
                      <th className="px-3 py-2 text-right font-medium">Confidence</th>
                      <th className="py-2 pl-3 pr-4 text-right font-medium">Lift</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {shownRules.map((r) => (
                      <RuleRow key={`${r.antecedents.join("+")}>${r.consequents.join("+")}`} r={r} maxLift={maxLift} />
                    ))}
                  </tbody>
                </table>
                {rules.length > 10 && (
                  <button
                    type="button"
                    onClick={() => setAllRules((a) => !a)}
                    className="w-full border-t border-stone-100 py-2 text-meta font-medium text-stone-500 transition-colors hover:bg-sunken hover:text-ink"
                  >
                    {allRules ? "Show top 10" : `Show all ${rules.length} rules`}
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </Panel>
  );
}
