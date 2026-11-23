import { AlertTriangle, PlugZap, Inbox, RefreshCw } from "lucide-react";
import { ApiError, describeError } from "@/lib/api";
import { cx } from "@/lib/format";

export function EmptyState({
  title,
  hint,
  icon,
  className,
  action,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cx("flex flex-col items-center px-6 py-10 text-center", className)}>
      <div className="mb-3 text-stone-300">{icon ?? <Inbox className="h-6 w-6" strokeWidth={1.5} />}</div>
      <p className="font-display text-[17px] leading-snug text-stone-700">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-meta leading-relaxed text-stone-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Renders the right message for each failure mode:
 *  - network: backend isn't running
 *  - unsupported: the route doesn't exist on this backend (not an outage)
 *  - http: backend answered with an error
 */
export function ErrorState({
  error,
  onRetry,
  className,
  compact,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const kind = error instanceof ApiError ? error.kind : "http";
  const Icon = kind === "network" ? PlugZap : kind === "unsupported" ? Inbox : AlertTriangle;
  const title =
    kind === "network" ? "Backend unreachable" : kind === "unsupported" ? "Not available on this backend" : "Something went wrong";

  return (
    <div
      role="alert"
      className={cx(
        "flex flex-col items-center text-center",
        compact ? "px-4 py-6" : "px-6 py-10",
        className,
      )}
    >
      <Icon
        className={cx("mb-3 h-6 w-6", kind === "unsupported" ? "text-stone-300" : "text-terracotta-500")}
        strokeWidth={1.5}
      />
      <p className="font-display text-[17px] leading-snug text-stone-800">{title}</p>
      <p className="mt-1 max-w-md text-meta leading-relaxed text-stone-500">{describeError(error)}</p>
      {error instanceof ApiError && kind === "unsupported" && (
        <code className="mt-2 rounded bg-sunken px-1.5 py-0.5 font-mono text-meta text-stone-500">{error.path}</code>
      )}
      {onRetry && kind !== "unsupported" && (
        <button type="button" onClick={onRetry} className="btn mt-4">
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </button>
      )}
    </div>
  );
}
