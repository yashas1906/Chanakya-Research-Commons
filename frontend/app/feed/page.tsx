import type { Metadata } from "next";
import { Suspense } from "react";
import { FeedWorkspace } from "@/components/feed/FeedWorkspace";

export const metadata: Metadata = { title: "Research feed" };

export default function FeedPage() {
  return (
    <Suspense fallback={null}>
      <FeedWorkspace />
    </Suspense>
  );
}
