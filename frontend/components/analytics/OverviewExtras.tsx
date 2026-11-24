"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/States";
import { cx, fmtInt } from "@/lib/format";
import type { AnalyticsOverview, TopPaperRow } from "@/types/crc";

// Distinct in both themes (CSS variables flip with dark mode).
const LINE_COLORS = [
  "rgb(var(--c-brand-600))",
  "rgb(var(--c-sage-600))",
  "rgb(var(--c-saffron-500))",
  "rgb(var(--c-terracotta-500))",
  "rgb(var(--c-stone-500))",
  "rgb(var(--c-brand-300))",
];

/** F9: research topics over time (monthly activity for the most active topics). */
function TopicTrendsChart({ rows }: { rows: AnalyticsOverview["topic_trends"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const { months, series, max } = useMemo(() => {
    const monthKeys = [...new Set(rows.map((r) => r.year * 100 + r.month))].sort((a, b) => a - b);
    const labels = new Map(rows.map((r) => [r.year * 100 + r.month, `${r.month_name.slice(0, 3)} ’${String(r.year).slice(-2)}`]));
    const totals = new Map<string, number>();
    rows.forEach((r) => totals.set(r.topic_name, (totals.get(r.topic_name) ?? 0) + r.activity));
    const topics = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    const lookup = new Map(rows.map((r) => [`${r.topic_name}|${r.year * 100 + r.month}`, r.activity]));
    const s = topics.map((topic) => ({ topic, values: monthKeys.map((m) => lookup.get(`${topic}|${m}`) ?? 0) }));
    return { months: monthKeys.map((m) => labels.get(m) ?? String(m)), series: s, max: Math.max(1, ...s.flatMap((x) => x.values)) };
  }, [rows]);

  if (months.length < 2) return <EmptyState className="py-6" title="Not enough history yet" hint="Topic trends need at least two months of activity." />;

  const W = 640, H = 220, PX = 34, PY = 16;
  const x = (i: number) => PX + (i * (W - PX * 2)) / (months.length - 1);
  const y = (v: number) => H - PY - (v / max) * (H - PY * 2);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" role="img" aria-label="Monthly activity per topic" onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PX} x2={W - PX} y1={y(max * f)} y2={y(max * f)} stroke="rgb(var(--c-stone-200))" strokeWidth="1" />
            <text x={PX - 6} y={y(max * f) + 4} textAnchor="end" className="fill-stone-400 text-[10px]">{fmtInt(Math.round(max * f))}</text>
          </g>
        ))}
        {months.map((m, i) => (
          <text key={m} x={x(i)} y={H - 2} textAnchor="middle" className="fill-stone-500 text-[10px]">{m}</text>
        ))}
        {series.map((s, si) => (
          <polyline
            key={s.topic}
            fill="none"
            stroke={LINE_COLORS[si % LINE_COLORS.length]}
            strokeWidth={hover === null || hover === si ? 2.25 : 1}
            strokeOpacity={hover === null || hover === si ? 1 : 0.35}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
          />
        ))}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {series.map((s, si) => (
          <li key={s.topic}>
            <button type="button" onMouseEnter={() => setHover(si)} onFocus={() => setHover(si)} onBlur={() => setHover(null)}
              className={cx("inline-flex items-center gap-1.5 text-meta", hover !== null && hover !== si ? "text-stone-400" : "text-stone-700")}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: LINE_COLORS[si % LINE_COLORS.length] }} />
              {s.topic}
              <span className="num text-label text-stone-400">{fmtInt(s.values.reduce((a, b) => a + b, 0))}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PaperList({ rows, metric }: { rows: TopPaperRow[]; metric: (r: TopPaperRow) => string }) {
  if (rows.length === 0) return <EmptyState className="py-6" title="Nothing yet" />;
  return (
    <ol className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.paper_id} className="flex gap-3">
          <span className="num w-5 shrink-0 text-right text-label font-semibold text-stone-400">{i + 1}</span>
          <span className="min-w-0 flex-1">
            <Link href={`/papers/${r.paper_id}`} className="line-clamp-2 text-meta font-medium text-ink hover:underline">{r.canonical_title}</Link>
            <span className="text-label text-stone-500">{[r.item_type === "article" ? "Article" : null, r.publication_year, metric(r)].filter(Boolean).join(" · ")}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function OverviewExtras({ data }: { data: AnalyticsOverview }) {
  return (
    <div className="space-y-8 border-t border-stone-100 pt-6">
      <section className="min-w-0">
        <h3 className="eyebrow mb-3">Research topics over time · monthly saves, posts, comments and views</h3>
        <TopicTrendsChart rows={data.topic_trends} />
      </section>
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="min-w-0">
          <h3 className="eyebrow mb-3">Most saved</h3>
          <PaperList rows={data.top_saved_papers} metric={(r) => `${fmtInt(r.saves ?? 0)} saves`} />
        </section>
        <section className="min-w-0">
          <h3 className="eyebrow mb-3">Most discussed</h3>
          <PaperList rows={data.top_discussed_papers} metric={(r) => `${fmtInt(r.posts ?? 0)} posts · ${fmtInt(r.comments ?? 0)} comments`} />
        </section>
      </div>
    </div>
  );
}
