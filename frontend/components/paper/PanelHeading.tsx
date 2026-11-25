import type { LucideIcon } from "lucide-react";
import { fmtInt } from "@/lib/format";

/** Card header shared by the three panels at the bottom of the page. */
export function PanelHeading({ eyebrow, title, icon: Icon, count, action }: { eyebrow: string; title: string; icon: LucideIcon; count?: number; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Icon className="h-4 w-4" /></span>
        <div className="min-w-0">
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="font-display text-h3 leading-snug text-ink">
            {title}
            {count !== undefined && <span className="num ml-2 text-meta font-sans font-medium text-stone-400">{fmtInt(count)}</span>}
          </h2>
        </div>
      </div>
      {action}
    </div>
  );
}
