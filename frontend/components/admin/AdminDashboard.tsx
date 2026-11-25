"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AdminHoldingsTab } from "@/components/admin/AdminHoldingsTab";
import { AdminMembersTab } from "@/components/admin/AdminMembersTab";
import { AdminOverviewTab } from "@/components/admin/AdminOverviewTab";
import { AnalyticsWorkspace } from "@/components/analytics/AnalyticsWorkspace";
import { RequireRole } from "@/components/auth/RequireRole";
import { PageHeader } from "@/components/ui/Section";
import { Tabs } from "@/components/ui/Tabs";
import { getAdminOverview } from "@/lib/api";
import { useAsync } from "@/lib/hooks";

type Section = "overview" | "members" | "holdings" | "analytics";
const isSection = (v: string | null): v is Section => v === "overview" || v === "members" || v === "holdings" || v === "analytics";

/**
 * Admin-only control room: platform overview, members and their posts, the Chanakya holdings and the institutional analytics.
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
  // The section lives only in the URL, so the top-bar Dashboard link (/admin) always lands on Overview.
  const raw = params.get("section");
  const section: Section = isSection(raw) ? raw : "overview";
  const setSection = (next: Section) => {
    if (next === section) return;
    router.push(next === "overview" ? "/admin" : `/admin?section=${next}`, { scroll: false });
  };
  const overview = useAsync((s) => getAdminOverview(s), []);

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "members" as const, label: "Members", count: overview.data?.totals.members },
    { id: "holdings" as const, label: "Chanakya holdings" },
    { id: "analytics" as const, label: "Analytics" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Dashboard"
        description="Platform health, every member and their posts, the Chanakya holdings and the institutional analytics, in one place. Visible to administrators only."
      />
      <Tabs tabs={tabs} value={section} onChange={setSection} />
      {section === "overview" && <AdminOverviewTab state={overview} onOpenMembers={() => setSection("members")} />}
      {section === "members" && <AdminMembersTab departments={overview.data?.members_by_department.map((d) => d.department) ?? []} />}
      {section === "holdings" && <AdminHoldingsTab />}
      {section === "analytics" && <AnalyticsWorkspace embedded basePath="/admin" />}
    </div>
  );
}
