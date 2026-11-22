"use client";

import { AlertTriangle, Sparkles } from "lucide-react";
import { GatekeeperTester } from "@/components/analytics/GatekeeperTester";
import { Pill } from "@/components/ui/Pill";
import { Panel } from "@/components/ui/Section";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Skeleton } from "@/components/ui/Skeleton";
import { getAnomalies } from "@/lib/api";
import { cx, relTime } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import type { AnomalyItem, Severity } from "@/types/crc";

const SEVERITY: Record<Severity, { label: string; cls: string }> = {
  high: { label: "High", cls: "border-terracotta-500 bg-terracotta-500 text-white" },
  medium: { label: "Medium", cls: "border-terracotta-200 bg-terracotta-100 text-terracotta-700" },
  low: { label: "Low", cls: "border-stone-200 bg-sunken text-stone-600" },
};

function Ledger({
  tone,
  eyebrow,
  title,
  blurb,
  icon,
  items,
  empty,
  showSeverity,
}: {
  tone: "sage" | "terracotta";
  eyebrow: string;
  title: string;
  blurb: string;
  icon: React.ReactNode;
  items: AnomalyItem[];
  empty: string;
  showSeverity?: boolean;
}) {
  const rail = tone === "sage" ? "bg-sage-500" : "bg-terracotta-500";
  const head = tone === "sage" ? "border-sage-200 bg-sage-50" : "border-terracotta-200 bg-terracotta-50";
  const headText = tone === "sage" ? "text-sage-700" : "text-terracotta-700";

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-stone-200/90 bg-paper">
      <header className={cx("border-b px-4 py-3", head)}>
        <p className={cx("eyebrow mb-0.5 flex items-center gap-1.5 !text-current", headText)}>
          {icon} {eyebrow}
        </p>
        <h3 className="flex items-baseline justify-between gap-3 font-serif text-[18px] leading-snug text-ink">
          {title}
          <span className="num font-sans text-[12px] font-normal text-stone-500">{items.length}</span>
        </h3>
        <p className="mt-0.5 text-[12px] leading-relaxed text-stone-600">{blurb}</p>
      </header>
      {items.length === 0 ? (
        <EmptyState className="py-10" title={empty} />
      ) : (
        <ul className="max-h-[560px] divide-y divide-stone-100 overflow-y-auto">
          {items.map((it) => (
            <li key={it.id} className="relative px-4 py-3.5 pl-5">
              <span aria-hidden className={cx("absolute inset-y-3 left-0 w-0.5 rounded-full", rail)} />
              <div className="flex items-start justify-between gap-3">
                <h4 className="font-serif text-[16px] leading-snug text-ink">{it.title}</h4>
                {showSeverity ? (
                  <span
                    className={cx("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4", SEVERITY[it.severity].cls)}
                    title={`Severity score ${it.score.toFixed(3)}`}
                  >
                    {it.severity === "high" && <AlertTriangle className="h-3 w-3" />}
                    {SEVERITY[it.severity].label}
                  </span>
                ) : (
                  <Pill tone="sage" title="Impact score">
                    <span className="num">{it.score.toFixed(2)}</span>
                  </Pill>
                )}
              </div>
              {it.title !== it.entity_ref && <p className="mt-0.5 truncate font-mono text-[10.5px] text-stone-400">{it.entity_ref}</p>}
              {it.reason && <p className="mt-1.5 text-[13px] leading-relaxed text-stone-600">{it.reason}</p>}
              {(it.facts.length > 0 || it.detected_at) && (
                <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
                  {it.facts.map((f) => (
                    <div key={f.label} className="flex items-baseline gap-1.5 text-[12px]">
                      <dt className="text-stone-400">{f.label}</dt>
                      <dd className="num font-medium text-stone-700">{f.value}</dd>
                    </div>
                  ))}
                  {it.detected_at && (
                    <div className="flex items-baseline gap-1.5 text-[12px]">
                      <dt className="text-stone-400">Detected</dt>
                      <dd className="text-stone-700">{relTime(it.detected_at)}</dd>
                    </div>
                  )}
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Split ledger: breakout impact on the left, integrity / metadata watchlist on the right, plus the live gatekeeper. */
export function AnomalyWatchlistCard() {
  const { data, error, loading, reload } = useAsync((s) => getAnomalies(s), []);

  return (
    <Panel eyebrow="Outlier detection" title="Anomaly watchlist">
      <div className="space-y-5 p-5">
        {loading && !data ? (
          <div className="grid gap-4 lg:grid-cols-2" role="status" aria-label="Loading anomalies">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : data ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Ledger
              tone="sage"
              eyebrow="High impact"
              title="Breakout spotlights"
              blurb="Works far above the median for citations and PageRank — worth featuring."
              icon={<Sparkles className="h-3 w-3" />}
              items={data.spotlights}
              empty="No breakout works detected"
            />
            <Ledger
              tone="terracotta"
              eyebrow="Integrity review"
              title="Integrity & metadata watchlist"
              blurb="Unusual submission velocity or metadata patterns that merit a human look."
              icon={<AlertTriangle className="h-3 w-3" />}
              items={data.integrity}
              empty="Nothing flagged for review"
              showSeverity
            />
          </div>
        ) : null}
        <GatekeeperTester />
      </div>
    </Panel>
  );
}
