import { clamp, cx } from "@/lib/format";

/** Hairline horizontal bar; `value` is 0..1. Used for support, similarity, PageRank. */
export function Meter({
  value,
  tone = "ink",
  className,
  label,
}: {
  value: number;
  tone?: "ink" | "sage" | "terracotta" | "stone";
  className?: string;
  label?: string;
}) {
  const fill = { ink: "bg-ink", sage: "bg-sage-500", terracotta: "bg-terracotta-500", stone: "bg-stone-400" }[tone];
  return (
    <div
      className={cx("h-1.5 w-full overflow-hidden rounded-full bg-stone-200/70", className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={clamp(value, 0, 1)}
      aria-label={label}
    >
      <div
        className={cx("h-full rounded-full transition-[width] duration-500 ease-out", fill)}
        style={{ width: `${clamp(value, 0, 1) * 100}%` }}
      />
    </div>
  );
}

/**
 * PageRank "prestige" indicator: five hairline pips, filled relative to the strongest
 * paper in the current result set (PageRank values are tiny and only meaningful relatively).
 */
export function PrestigePips({ value, max, className }: { value: number; max: number; className?: string }) {
  const rel = max > 0 ? clamp(value / max, 0, 1) : 0;
  const filled = value > 0 ? Math.max(1, Math.round(rel * 5)) : 0;
  return (
    <span
      className={cx("inline-flex items-center gap-[3px]", className)}
      role="img"
      aria-label={`Prestige ${filled} of 5 relative to this result set`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={cx("h-2.5 w-[3px] rounded-full", i < filled ? "bg-ink" : "bg-stone-200")} />
      ))}
    </span>
  );
}
