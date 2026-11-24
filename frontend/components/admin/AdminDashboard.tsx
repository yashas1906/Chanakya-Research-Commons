"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminMembersTab } from "@/components/admin/AdminMembersTab";
import { AdminOverviewTab } from "@/components/admin/AdminOverviewTab";
import { AnalyticsWorkspace } from "@/components/analytics/AnalyticsWorkspace";
import { RequireRole } from "@/components/auth/RequireRole";
import { PageHeader } from "@/components/ui/Section";
import { Tabs } from "@/components/ui/Tabs";
import { getAdminOverview } from "@/lib/api";
import { useAsync } from "@/lib/hooks";

type Section = "overview" | "members" | "analytics";
const isSection = (v: string | null): v is Section => v === "overview" || v === "members" || v === "analytics";

/**
 * Admin-only control room: platform overview, the member directory and the institutional analytics.
 * The route is wrapped in RequireRole and every /api/admin/* call is also enforced server-side.
 */
export function AdminDashboard() {
  return (
    <RequireRole min="admin">
      <Dashboard />
    </RequireRole>
  );
}

function Dashboard() {
  const params = useSearchParams();
  const router = useRouter();
  const [section, setSection] = useState<Section>(() => (isSection(params.get("section")) ? (params.get("section") as Section) : "overview"));
  const overview = useAsync((s) => getAdminOverview(s), []);

  // Follow ?section= when it changes from outside (e.g. the Analytics icon in the top bar).
  const urlSection = params.get("section");
  useEffect(() => {
    if (isSection(urlSection)) setSection(urlSection as Section);
  }, [urlSection]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("section") === section) return;
    query.set("section", section);
    if (section !== "analytics") query.delete("tab");
    router.replace(`/admin?${query.toString()}`, { scroll: false });
  }, [section, router]);

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "members" as const, label: "Members", count: overview.data?.totals.members },
    { id: "analytics" as const, label: "Analytics" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Admin dashboard"
        description="Platform health, everyone on the Commons, and the institutional analytics, in one place. Visible to administrators only."
      />
      <Tabs tabs={tabs} value={section} onChange={setSection} />
      {section === "overview" && <AdminOverviewTab state={overview} onOpenMembers={() => setSection("members")} />}
      {section === "members" && <AdminMembersTab departments={overview.data?.members_by_department.map((d) => d.department) ?? []} />}
      {section === "analytics" && <AnalyticsWorkspace embedded basePath="/admin" />}
    </div>
  );
}
