"use client";

import { AnomalyWatchlistCard } from "@/components/analytics/AnomalyWatchlistCard";
import { ResearcherArchetypesCard } from "@/components/analytics/ResearcherArchetypesCard";
import { TopicAssociationsCard } from "@/components/analytics/TopicAssociationsCard";
import { WarehouseActivityCard } from "@/components/analytics/WarehouseActivityCard";
import { PageHeader } from "@/components/ui/Section";

/** Executive view over the star-schema warehouse and the data-mining services. */
export function AnalyticsWorkspace() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Institutional analytics"
        title="Research intelligence"
        description="How Chanakya researches: what the warehouse records, which topics travel together, who the archetypal researchers are, and which works or submissions deserve attention."
      />
      <WarehouseActivityCard />
      <TopicAssociationsCard />
      <ResearcherArchetypesCard />
      <AnomalyWatchlistCard />
    </div>
  );
}
