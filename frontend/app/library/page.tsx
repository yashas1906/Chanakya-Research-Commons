import type { Metadata } from "next";
import { Suspense } from "react";
import { LibraryWorkspace } from "@/components/library/LibraryWorkspace";
import { Skeleton } from "@/components/ui/Skeleton";

export const metadata: Metadata = { title: "Library" };

export default function LibraryPage() {
  return <Suspense fallback={<Skeleton className="h-10 max-w-2xl" />}><LibraryWorkspace /></Suspense>;
}
