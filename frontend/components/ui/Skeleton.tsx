import { cx } from "@/lib/format";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("skeleton", className)} />;
}

export function SkeletonLines({ lines = 3, className }: { lines?: number; className?: string }) {
  const widths = ["w-full", "w-11/12", "w-4/5", "w-2/3"];
  return (
    <div className={cx("space-y-2", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cx("h-3", widths[i % widths.length])} />
      ))}
    </div>
  );
}

/** A paper / post row placeholder. */
export function SkeletonRow() {
  return (
    <div className="space-y-2.5 px-4 py-3.5" aria-hidden>
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-11/12" />
    </div>
  );
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="divide-y divide-stone-100" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className, rows = 3 }: { className?: string; rows?: number }) {
  return (
    <div className={cx("card", className)}>
      <div className="border-b border-stone-100 px-4 py-3">
        <Skeleton className="h-3 w-28" />
      </div>
      <SkeletonList rows={rows} />
    </div>
  );
}
