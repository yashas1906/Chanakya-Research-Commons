import { redirect } from "next/navigation";

/** Analytics lives inside the admin dashboard only; old links land there (and are refused for non-admins). */
export default function AnalyticsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const tab = typeof searchParams.tab === "string" ? `&tab=${encodeURIComponent(searchParams.tab)}` : "";
  redirect(`/admin?section=analytics${tab}`);
}
