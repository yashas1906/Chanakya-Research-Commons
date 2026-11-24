import { ShieldAlert } from "lucide-react";
import { cx } from "@/lib/format";

/** Shown only to the author: the spam check flagged this post, so others cannot see it until an admin clears it. */
export function UnderReviewNote({ className }: { className?: string }) {
  return (
    <p className={cx("relative z-10 flex items-start gap-2 rounded-lg bg-saffron-50 px-3 py-2 text-meta text-stone-700 ring-1 ring-inset ring-saffron-200", className)}>
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-saffron-600" />
      <span>
        <span className="font-semibold text-ink">Under review.</span> Our spam check flagged this post, so only you can see it until an admin reviews it.
      </span>
    </p>
  );
}
