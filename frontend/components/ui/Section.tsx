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
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="font-serif text-[34px] leading-[1.1] tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-2.5 text-[15px] leading-relaxed text-stone-500">{description}</p>}
      </div>
      {actions}
    </header>
  );
}

/** Card with an eyebrow + serif title strip. */
export function Panel({
  eyebrow,
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
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-stone-100 px-4 py-3">
        <div className="min-w-0 flex-1 basis-56">
          {eyebrow && <p className="eyebrow mb-0.5">{eyebrow}</p>}
          <h2 className="font-serif text-[17px] leading-snug text-ink">
            {title}
            {meta !== undefined && <span className="num ml-2 font-sans text-xs font-normal text-stone-400">{meta}</span>}
          </h2>
        </div>
        {actions}
      </header>
      <div className={cx("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-stone-200/90 bg-sunken font-sans text-meta font-semibold tracking-wide text-stone-600"
      style={{ width: size, height: size }}
    >
      {initials(name)}
    </span>
  );
}
