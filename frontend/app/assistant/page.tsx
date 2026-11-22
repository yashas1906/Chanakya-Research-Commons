import type { Metadata } from "next";
import { Suspense } from "react";
import { AssistantWorkspace } from "@/components/assistant/AssistantWorkspace";
import { Skeleton } from "@/components/ui/Skeleton";

export const metadata: Metadata = { title: "Research assistant" };

export default function AssistantPage() {
  return <Suspense fallback={<Skeleton className="h-10 max-w-2xl" />}><AssistantWorkspace /></Suspense>;
}
