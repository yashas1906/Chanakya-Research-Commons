import type { Metadata } from "next";
import { FeedWorkspace } from "@/components/feed/FeedWorkspace";

export const metadata: Metadata = { title: "Research feed" };

export default function FeedPage() {
  return <FeedWorkspace />;
}
