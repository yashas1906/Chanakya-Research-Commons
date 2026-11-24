import { cx, initials } from "@/lib/format";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="font-display text-h1 text-ink">{title}</h1>
        {description && <p className="mt-1.5 text-ui leading-relaxed text-stone-600">{description}</p>}
      </div>
      {actions}
    </header>
  );
}

/** White card with a compact title strip. The `eyebrow` prop is accepted for older call sites but no longer rendered. */
export function Panel({
  title,
  meta,
  actions,
  children,
  className,
  bodyClassName,
}: {
  eyebrow?: string;
  title: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx("card flex min-w-0 flex-col", className)}>
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-stone-100 px-4 py-3">
        <h2 className="min-w-0 flex-1 basis-40 font-display text-[16px] leading-snug text-ink">
          {title}
          {meta !== undefined && <span className="num ml-2 font-sans text-meta font-normal text-stone-400">{meta}</span>}
        </h2>
        {actions}
      </header>
      <div className={cx("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Deterministic, friendly avatar colour per person so lists are easy to scan. */
const AVATAR_HUES = ["#1E3F7D", "#7A1F33", "#8F6A0C", "#2B6F8E", "#5F4590", "#A0522D", "#1F6F78", "#4B556B", "#8C2F4B", "#3F6A3A"];
function hueFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[hash % AVATAR_HUES.length];
}

export function Avatar({ name, size = 28, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 select-none items-center justify-center rounded-full font-sans font-semibold text-white", className)}
      style={{ width: size, height: size, backgroundColor: hueFor(name), fontSize: Math.max(11, Math.round(size * 0.38)) }}
    >
      {initials(name)}
    </span>
  );
}
