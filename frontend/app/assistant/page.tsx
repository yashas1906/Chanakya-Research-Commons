import type { Metadata } from "next";
import { AssistantWorkspace } from "@/components/assistant/AssistantWorkspace";

export const metadata: Metadata = { title: "Research assistant" };

export default function AssistantPage() {
  return <AssistantWorkspace />;
}
