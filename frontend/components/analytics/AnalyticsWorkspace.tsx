"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnomalyWatchlistCard } from "@/components/analytics/AnomalyWatchlistCard";
import { ResearcherArchetypesCard } from "@/components/analytics/ResearcherArchetypesCard";
import { TopicAssociationsCard } from "@/components/analytics/TopicAssociationsCard";
import { WarehouseActivityCard } from "@/components/analytics/WarehouseActivityCard";
import { PageHeader } from "@/components/ui/Section";
import { Tabs } from "@/components/ui/Tabs";

type AnalyticsTab = "activity" | "associations" | "archetypes" | "anomalies";
const isTab = (value: string | null): value is AnalyticsTab => value === "activity" || value === "associations" || value === "archetypes" || value === "anomalies";

/** Executive view over the star-schema warehouse and the data-mining services. */
export function AnalyticsWorkspace() {
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<AnalyticsTab>(() => isTab(params.get("tab")) ? params.get("tab") as AnalyticsTab : "activity");
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    query.set("tab", tab);
    const next = `?${query.toString()}`;
    if (window.location.search !== next) router.replace(`/analytics${next}`, { scroll: false });
  }, [tab, router]);
  const tabs = [
    { id: "activity" as const, label: "Activity" },
    { id: "associations" as const, label: "Topic associations" },
    { id: "archetypes" as const, label: "Researcher archetypes" },
    { id: "anomalies" as const, label: "Anomalies" },
  ];
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Institutional analytics"
        title="Research intelligence"
        description="How Chanakya researches: what the warehouse records, which topics travel together, who the archetypal researchers are, and which works or submissions deserve attention."
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "activity" && <WarehouseActivityCard />}
      {tab === "associations" && <TopicAssociationsCard />}
      {tab === "archetypes" && <ResearcherArchetypesCard />}
      {tab === "anomalies" && <AnomalyWatchlistCard />}
    </div>
  );
}
