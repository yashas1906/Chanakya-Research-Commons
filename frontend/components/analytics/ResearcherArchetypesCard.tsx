"use client";

import { ArrowRight } from "lucide-react";
import { Meter } from "@/components/ui/Meter";
import { Pill } from "@/components/ui/Pill";
import { Panel } from "@/components/ui/Section";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Skeleton } from "@/components/ui/Skeleton";
import { getResearcherArchetypes } from "@/lib/api";
import { fmtInt, fmtPct } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import type { ClusterSummary, DefiningRule, ResearcherArchetypes } from "@/types/crc";

/** "Coauthors_High" -> { name: "Coauthors", level: "High" } */
function splitTrait(trait: string): { name: string; level: string | null } {
  const m = trait.match(/^(.*?)[_\s-]+(High|Medium|Mid|Low)$/i);
  if (!m) return { name: trait.replace(/_/g, " "), level: null };
  return { name: m[1].replace(/_/g, " "), level: m[2].replace(/^mid$/i, "Medium") };
}

function traitLabel(trait: string): string {
  const { name, level } = splitTrait(trait);
  return level ? `${level} ${name.toLowerCase()}` : name;
}

function ruleSentence(rule: DefiningRule): string {
  const parts = rule.traits.map(traitLabel);
  const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : (parts[0] ?? "these traits");
  return `Researchers with ${joined} fall into Cluster ${rule.cluster_id}.`;
}

function silhouetteReading(s: number): { label: string; tone: "sage" | "neutral" | "terracotta" } {
  if (s >= 0.5) return { label: "Well-separated", tone: "sage" };
  if (s >= 0.25) return { label: "Reasonable structure", tone: "neutral" };
  return { label: "Overlapping", tone: "terracotta" };
}

function TraitChip({ trait }: { trait: string }) {
  const { name, level } = splitTrait(trait);
  const tone = level === "High" ? "bg-ink text-paper" : level === "Low" ? "bg-stone-200 text-stone-700" : "bg-sunken text-stone-700 border border-stone-200/90";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-meta leading-4 ${tone}`} title={trait}>
      {name}
      {level && <span className="font-semibold opacity-80">· {level}</span>}
    </span>
  );
}

function ClusterCard({ c, total, maxima, rules }: { c: ClusterSummary; total: number; maxima: Record<string, number>; rules: DefiningRule[] }) {
  const share = total > 0 ? c.size / total : 0;
  const metrics = Object.entries(c.metrics).slice(0, 5);
  return (
    <li className="flex flex-col rounded-lg border border-stone-200/90 bg-paper p-4 transition-colors duration-150 hover:border-stone-300">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Cluster {c.cluster_id}</p>
          <h4 className="font-display text-[18px] leading-snug text-ink">{c.label ?? `Archetype ${c.cluster_id}`}</h4>
        </div>
        <div className="text-right">
          <p className="num font-display text-[22px] leading-none text-ink">{fmtInt(c.size)}</p>
          <p className="num mt-0.5 text-meta text-stone-500">{fmtPct(share)} of cohort</p>
        </div>
      </div>
      <Meter value={share} tone="ink" className="mt-3" label={`Cluster ${c.cluster_id} share`} />

      {metrics.length > 0 && (
        <dl className="mt-4 space-y-1.5">
          {metrics.map(([name, v]) => (
            <div key={name} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-2 text-meta">
              <dt className="truncate text-stone-500" title={name}>
                {name}
              </dt>
              <dd>
                <Meter value={maxima[name] > 0 ? v / maxima[name] : 0} tone="stone" label={name} />
              </dd>
              <dd className="num text-right text-stone-700">{Number.isInteger(v) ? v : v.toFixed(2)}</dd>
            </div>
          ))}
        </dl>
      )}

      {(c.traits.length > 0 || rules.length > 0) && (
        <div className="mt-4 space-y-2.5 border-t border-stone-100 pt-3.5">
          <p className="eyebrow">Behavioural signature</p>
          {c.traits.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {c.traits.map((t) => (
                <TraitChip key={t} trait={t} />
              ))}
            </div>
          )}
          {rules.map((r, i) => (
            <div key={i} className="space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {r.traits.map((t, j) => (
                  <span key={t} className="inline-flex items-center gap-1.5">
                    {j > 0 && <span className="text-meta text-stone-300">+</span>}
                    <TraitChip trait={t} />
                  </span>
                ))}
                <ArrowRight className="h-3 w-3 text-stone-300" />
                <Pill tone="ink">Cluster {r.cluster_id}</Pill>
              </div>
              <p className="text-meta leading-relaxed text-stone-600">
                {ruleSentence(r)}
                {(r.confidence !== null || r.lift !== null) && (
                  <span className="num text-stone-400">
                    {" "}
                    {r.confidence !== null && `${fmtPct(r.confidence)} confidence`}
                    {r.confidence !== null && r.lift !== null && " · "}
                    {r.lift !== null && `${r.lift.toFixed(2)}× lift`}
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

function Body({ data }: { data: ResearcherArchetypes }) {
  const total = data.total_researchers ?? data.clusters.reduce((s, c) => s + c.size, 0);
  const maxima: Record<string, number> = {};
  data.clusters.forEach((c) => Object.entries(c.metrics).forEach(([k, v]) => (maxima[k] = Math.max(maxima[k] ?? 0, v))));
  const known = new Set(data.clusters.map((c) => c.cluster_id));
  const orphanRules = data.rules.filter((r) => !known.has(r.cluster_id));

  if (data.clusters.length === 0 && data.rules.length === 0) {
    return <EmptyState title="No archetypes computed" hint="The clustering run returned no cohorts. Check that enough researcher profiles exist." />;
  }

  return (
    <div className="space-y-6 p-5">
      {data.clusters.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.clusters.map((c) => (
            <ClusterCard key={c.cluster_id} c={c} total={total} maxima={maxima} rules={data.rules.filter((r) => r.cluster_id === c.cluster_id)} />
          ))}
        </ul>
      )}
      {orphanRules.length > 0 && (
        <section>
          <h3 className="eyebrow mb-2">Defining rules</h3>
          <ul className="space-y-2">
            {orphanRules.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-1.5 text-meta">
                {r.traits.map((t, j) => (
                  <span key={t} className="inline-flex items-center gap-1.5">
                    {j > 0 && <span className="text-stone-300">+</span>}
                    <TraitChip trait={t} />
                  </span>
                ))}
                <ArrowRight className="h-3 w-3 text-stone-300" />
                <Pill tone="ink">Cluster {r.cluster_id}</Pill>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Ward agglomerative cohorts, plus plain-English trait rules that explain each archetype. */
export function ResearcherArchetypesCard() {
  const { data, error, loading, reload } = useAsync((s) => getResearcherArchetypes(s), []);
  const sil = data?.silhouette_score != null ? silhouetteReading(data.silhouette_score) : null;

  return (
    <Panel
      eyebrow="Clustering"
      title="Researcher archetypes"
      actions={
        data && (
          <div className="flex items-center gap-2">
            {data.total_researchers != null && <span className="num text-meta text-stone-500">{fmtInt(data.total_researchers)} researchers</span>}
            {sil && data.silhouette_score != null && (
              <Pill tone={sil.tone} title="Silhouette score: −1 (mis-assigned) to 1 (cleanly separated)">
                <span className="num">Silhouette {data.silhouette_score.toFixed(2)}</span> · {sil.label}
              </Pill>
            )}
          </div>
        )
      }
    >
      {loading && !data ? (
        <div className="grid gap-4 p-5 md:grid-cols-3" role="status" aria-label="Loading archetypes">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data ? (
        <Body data={data} />
      ) : null}
    </Panel>
  );
}

