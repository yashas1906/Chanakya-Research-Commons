import { cx } from "@/lib/format";

type Tone = "neutral" | "ink" | "brand" | "sage" | "terracotta";

const TONES: Record<Tone, string> = {
  neutral: "border-stone-200 bg-stone-100 text-stone-600",
  ink: "border-brand-600 bg-brand-600 text-white",
  brand: "border-brand-100 bg-brand-50 text-brand-700",
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
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-meta font-medium leading-4",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Topic flair: a soft brand-tinted pill. */
export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-[13px] font-medium leading-5 text-brand-700 transition-colors group-hover:bg-brand-100">
      {children}
    </span>
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
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-meta font-medium transition duration-150 active:scale-[0.97]",
        active
          ? "border-brand-200 bg-brand-50 text-brand-700"
          : "border-stone-200 bg-paper text-stone-600 hover:border-stone-300 hover:bg-stone-100",
      )}
    >
      {children}
      {count !== undefined && <span className={cx("num text-meta", active ? "text-brand-500" : "text-stone-400")}>{count}</span>}
    </button>
  );
}
