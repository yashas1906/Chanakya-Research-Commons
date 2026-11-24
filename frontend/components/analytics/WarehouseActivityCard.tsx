"use client";

import { useMemo, useState } from "react";
import { MatrixHeatmap, Sparkline } from "@/components/analytics/charts";
import { Meter } from "@/components/ui/Meter";
import { Panel } from "@/components/ui/Section";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Skeleton } from "@/components/ui/Skeleton";
import { getOverview } from "@/lib/api";
import { cx, fmtInt, shortSchool } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { SCHOOLS } from "@/types/crc";
import { useAuth } from "@/context/AuthContext";

function pctDelta(points: { value: number }[]): { text: string; up: boolean } | null {
  if (points.length < 2) return null;
  const a = points[points.length - 2].value;
  const b = points[points.length - 1].value;
  if (a === 0) return null;
  const d = ((b - a) / a) * 100;
  return { text: `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(0)}% vs prior month`, up: d >= 0 };
}

function Skel() {
  return (
    <div className="space-y-4 p-5" role="status" aria-label="Loading warehouse activity">
      <div className="grid gap-5 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-[72px] w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

/** dw.fact_research_activity trends + dw.fact_dept_collaboration matrix. */
export function WarehouseActivityCard() {
  const { can } = useAuth();
  const canFilterDepartment = can("faculty");
  const [school, setSchool] = useState<string>("ALL");
  const [mode, setMode] = useState<"bars" | "table">("bars");
  const { data, error, loading, reload } = useAsync((s) => getOverview(school === "ALL" ? null : school, s), [school]);

  const months = useMemo(
    () => (data?.monthly_trends ?? []).map((m) => ({ label: `${m.month_name.slice(0, 3)} ’${String(m.year).slice(-2)}`, ...m })),
    [data],
  );

  const topics = useMemo(() => {
    // Aggregate by topic across schools (the API groups by department too).
    const m = new Map<string, { topic: string; cluster: string | null; saves: number; posts: number; views: number }>();
    (data?.topic_breakdown ?? []).forEach((r) => {
      const key = r.topic_name ?? "Unclassified";
      const cur = m.get(key) ?? { topic: key, cluster: r.parent_cluster, saves: 0, posts: 0, views: 0 };
      cur.saves += r.total_saves;
      cur.posts += r.total_posts;
      cur.views += r.total_views;
      m.set(key, cur);
    });
    return [...m.values()].sort((a, b) => b.saves - a.saves || b.views - a.views).slice(0, 8);
  }, [data]);
  const topMax = Math.max(1, ...topics.map((t) => t.saves));

  const collab = useMemo(() => data?.cross_dept_collaboration ?? [], [data]);
  const depts = useMemo(() => {
    const present = new Set<string>();
    collab.forEach((c) => {
      present.add(c.source_department);
      present.add(c.target_department);
    });
    const ordered = (SCHOOLS as readonly string[]).filter((s) => present.has(s));
    return [...ordered, ...[...present].filter((d) => !ordered.includes(d))];
  }, [collab]);

  const measures = [
    { key: "saves" as const, label: "Library saves" },
    { key: "posts" as const, label: "Posts" },
    { key: "views" as const, label: "Views" },
  ];

  return (
    <Panel
      eyebrow="Data warehouse"
      title="Research activity & cross-school collaboration"
      actions={canFilterDepartment ? (
        <label className="flex items-center gap-2 text-meta text-stone-500">
          School
          <select value={school} onChange={(e) => setSchool(e.target.value)} className="input w-auto py-1.5 pr-8 text-meta" aria-label="Filter topic activity by school">
            <option value="ALL">All schools</option>
            {SCHOOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      ) : undefined}
    >
      {loading && !data ? (
        <Skel />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? null : (
        <div className={cx("space-y-8 p-5 transition-opacity", loading && "opacity-60")}>
          {/* Monthly trend: one small multiple per measure (never a dual axis) */}
          <section>
            <h3 className="eyebrow mb-3">Monthly engagement · fact_research_activity</h3>
            {months.length === 0 ? (
              <EmptyState className="py-6" title="No monthly activity recorded" hint="Run the warehouse ELT to populate dw.fact_research_activity." />
            ) : (
              <div className="grid gap-6 md:grid-cols-3">
                {measures.map((m) => {
                  const pts = months.map((x) => ({ label: x.label, value: x[m.key] }));
                  const delta = pctDelta(pts);
                  const total = pts.reduce((s, p) => s + p.value, 0);
                  return (
                    <div key={m.key}>
                      <p className="text-meta text-stone-500">{m.label}</p>
                      <p className="num font-display text-[28px] leading-tight text-ink">{fmtInt(total)}</p>
                      <p className="num mb-2 h-4 text-meta text-stone-500">{delta?.text ?? ""}</p>
                      <Sparkline points={pts} name={m.label} />
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="grid gap-8 xl:grid-cols-2">
            {/* Topic activity */}
            <section className="min-w-0">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="eyebrow">Topic activity {school !== "ALL" && `· ${shortSchool(school)}`}</h3>
                <div role="group" aria-label="View as" className="flex rounded-md border border-stone-200/90 p-0.5 text-meta">
                  {(["bars", "table"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={mode === m}
                      onClick={() => setMode(m)}
                      className={cx("rounded px-2 py-0.5 font-medium capitalize transition-colors", mode === m ? "bg-ink text-paper" : "text-stone-500 hover:text-ink")}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              {topics.length === 0 ? (
                <EmptyState className="py-8" title="No topic activity" hint="Nothing recorded for this school yet." />
              ) : mode === "bars" ? (
                <ul className="space-y-2.5">
                  {topics.map((t) => (
                    <li key={t.topic} title={`${t.topic}: ${fmtInt(t.saves)} saves · ${fmtInt(t.posts)} posts · ${fmtInt(t.views)} views`}>
                      <div className="mb-1 flex items-baseline justify-between gap-3 text-meta">
                        <span className="truncate text-stone-800">{t.topic}</span>
                        <span className="num shrink-0 text-stone-500">{fmtInt(t.saves)} saves</span>
                      </div>
                      <Meter value={t.saves / topMax} tone="ink" label={`${t.topic} saves`} />
                    </li>
                  ))}
                </ul>
              ) : (
                <table className="w-full text-meta">
                  <thead>
                    <tr className="border-b border-stone-200/90 text-left text-meta uppercase tracking-eyebrow text-stone-500">
                      <th className="pb-1.5 font-medium">Topic</th>
                      <th className="pb-1.5 text-right font-medium">Saves</th>
                      <th className="pb-1.5 text-right font-medium">Posts</th>
                      <th className="pb-1.5 text-right font-medium">Views</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {topics.map((t) => (
                      <tr key={t.topic}>
                        <td className="py-1.5 text-stone-800">{t.topic}</td>
                        <td className="num py-1.5 text-right">{fmtInt(t.saves)}</td>
                        <td className="num py-1.5 text-right">{fmtInt(t.posts)}</td>
                        <td className="num py-1.5 text-right">{fmtInt(t.views)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* Collaboration matrix */}
            <section className="min-w-0">
              <h3 className="eyebrow mb-3">Cross-school collaboration · fact_dept_collaboration</h3>
              {collab.length === 0 ? (
                <EmptyState className="py-8" title="No collaboration recorded" hint="Cross-school follows and comments will appear here." />
              ) : (
                <MatrixHeatmap
                  rows={depts}
                  cols={depts}
                  rowLabel="From"
                  colLabel="To"
                  format={shortSchool}
                  cells={collab.map((c) => ({ row: c.source_department, col: c.target_department, value: c.interactions }))}
                />
              )}
            </section>
          </div>
        </div>
      )}
    </Panel>
  );
}
