import { Suspense } from "react";
import { SearchWorkspace } from "@/components/search/SearchWorkspace";
import { Skeleton } from "@/components/ui/Skeleton";

export default function SearchPage() {
  return <Suspense fallback={<Skeleton className="h-10 max-w-2xl" />}><SearchWorkspace /></Suspense>;
}
