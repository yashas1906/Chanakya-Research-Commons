"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { hasInAppHistory } from "@/lib/nav-history";

/** "← Back" to the previous page when there is one in this tab, otherwise to `fallbackHref`. */
export function BackLink({ fallbackHref, fallbackLabel }: { fallbackHref: string; fallbackLabel: string }) {
  const router = useRouter();
  // Decided after mount so the server render and the first client render match.
  const [canGoBack, setCanGoBack] = useState(false);
  useEffect(() => setCanGoBack(hasInAppHistory()), []);

  return (
    <Link
      href={fallbackHref}
      onClick={(event) => {
        if (!canGoBack || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        router.back();
      }}
      className="inline-flex items-center gap-2 text-ui font-medium text-stone-600 hover:text-ink"
    >
      <ArrowLeft className="h-4 w-4" />
      {canGoBack ? "Back" : fallbackLabel}
    </Link>
  );
}
