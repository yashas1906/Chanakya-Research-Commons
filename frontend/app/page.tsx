import { Suspense } from "react";
import { SearchWorkspace } from "@/components/search/SearchWorkspace";
import { Skeleton } from "@/components/ui/Skeleton";

/** Home = Hybrid 4-panel search. The other four workspaces live at /feed, /library, /assistant, /analytics. */
export default function HomePage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-24 h-14 max-w-3xl rounded-2xl" />}>
      <SearchWorkspace />
    </Suspense>
  );
}
