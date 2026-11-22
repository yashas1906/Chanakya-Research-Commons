import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalyticsWorkspace } from "@/components/analytics/AnalyticsWorkspace";
import { Skeleton } from "@/components/ui/Skeleton";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return <Suspense fallback={<Skeleton className="h-10 max-w-2xl" />}><AnalyticsWorkspace /></Suspense>;
}
