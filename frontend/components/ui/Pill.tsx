import { cx } from "@/lib/format";

type Tone = "neutral" | "ink" | "sage" | "terracotta";

const TONES: Record<Tone, string> = {
  neutral: "border-stone-200/90 bg-sunken text-stone-600",
  ink: "border-ink bg-ink text-white",
  sage: "border-sage-200 bg-sage-50 text-sage-700",
  terracotta: "border-terracotta-200 bg-terracotta-50 text-terracotta-700",
};

export function Pill({
  tone = "neutral",
  className,
  children,
  title,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-meta font-medium leading-4",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Quiet inline topic tag. */
export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-md bg-sunken px-1.5 py-0.5 text-meta leading-4 text-stone-500">{children}</span>
  );
}

/** Selectable filter chip. */
export function Chip({
  active,
  onClick,
  children,
  count,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-meta font-medium transition-colors duration-150",
        active
          ? "border-ink bg-ink text-white"
          : "border-stone-200/90 bg-paper text-stone-600 hover:border-stone-300 hover:bg-sunken",
      )}
    >
      {children}
      {count !== undefined && (
        <span className={cx("num text-meta", active ? "text-stone-300" : "text-stone-400")}>{count}</span>
      )}
    </button>
  );
}
