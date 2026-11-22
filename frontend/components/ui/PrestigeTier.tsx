import { Meter } from "@/components/ui/Meter";
import { fmtPagerank, pagerankTier } from "@/lib/format";

export function PrestigeTier({
  percentile,
  score,
  compact = false,
}: {
  percentile?: number | null;
  score?: number;
  compact?: boolean;
}) {
  const tier = percentile ?? 0;
  return (
    <span className="inline-flex min-w-0 items-center gap-2" title={score === undefined ? pagerankTier(percentile) : `${pagerankTier(percentile)} · PageRank ${fmtPagerank(score)}`}>
      <span className="shrink-0 rounded-full border border-stone-200 bg-sunken px-2 py-0.5 text-meta font-medium text-stone-700">{pagerankTier(percentile)}</span>
      {!compact && <Meter value={tier} className="max-w-16" label="PageRank percentile" />}
    </span>
  );
}
