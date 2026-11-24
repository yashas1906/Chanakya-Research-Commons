"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnomalyWatchlistCard } from "@/components/analytics/AnomalyWatchlistCard";
import { DrilldownCard } from "@/components/analytics/DrilldownCard";
import { ResearcherArchetypesCard } from "@/components/analytics/ResearcherArchetypesCard";
import { TopicAssociationsCard } from "@/components/analytics/TopicAssociationsCard";
import { WarehouseActivityCard } from "@/components/analytics/WarehouseActivityCard";
import { PageHeader } from "@/components/ui/Section";
import { Tabs } from "@/components/ui/Tabs";

type AnalyticsTab = "activity" | "drilldown" | "associations" | "archetypes" | "anomalies";
const isTab = (value: string | null): value is AnalyticsTab => value === "activity" || value === "drilldown" || value === "associations" || value === "archetypes" || value === "anomalies";

/** Executive view over the star-schema warehouse and the data-mining services. */
export function AnalyticsWorkspace({ embedded = false, basePath = "/analytics" }: { embedded?: boolean; basePath?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<AnalyticsTab>(() => isTab(params.get("tab")) ? params.get("tab") as AnalyticsTab : "activity");
  // Follow ?tab= when it changes from outside (the browser Back button).
  const urlTab = params.get("tab");
  useEffect(() => {
    if (isTab(urlTab)) setTab(urlTab);
  }, [urlTab]);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const current = query.get("tab");
    if (current === tab) return;
    query.set("tab", tab);
    const next = `${basePath}?${query.toString()}`;
    // Filling in the default tab replaces; a tab the admin clicks gets its own history entry.
    if (current === null) router.replace(next, { scroll: false });
    else router.push(next, { scroll: false });
  }, [tab, router, basePath]);
  const tabs = [
    { id: "activity" as const, label: "Activity" },
    { id: "drilldown" as const, label: "Drill-down" },
    { id: "associations" as const, label: "Topic associations" },
    { id: "archetypes" as const, label: "Researcher archetypes" },
    { id: "anomalies" as const, label: "Anomalies" },
  ];
  return (
    <div className="space-y-8">
      {!embedded && (
        <PageHeader
          eyebrow="Institutional analytics"
          title="Research intelligence"
          description="How Chanakya researches: what the warehouse records, which topics travel together, who the archetypal researchers are, and which works or submissions deserve attention."
        />
      )}
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "activity" && <WarehouseActivityCard />}
      {tab === "drilldown" && <DrilldownCard />}
      {tab === "associations" && <TopicAssociationsCard />}
      {tab === "archetypes" && <ResearcherArchetypesCard />}
      {tab === "anomalies" && <AnomalyWatchlistCard />}
    </div>
  );
}
