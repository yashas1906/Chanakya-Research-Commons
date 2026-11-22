"use client";

import { Panel, Avatar } from "@/components/ui/Section";
import { Tag } from "@/components/ui/Pill";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/States";
import { shortSchool } from "@/lib/format";
import type { RecommendedPerson } from "@/types/crc";

const GUIDELINES = ["Be rigorous and cite the work you discuss.", "Keep criticism constructive and specific.", "Avoid promotional or repetitive posts.", "Respect authorship and research integrity."];

export function FeedRail({ topics, people, peopleLoading, onTopic }: {
  topics: Array<[string, number]>;
  people: RecommendedPerson[];
  peopleLoading: boolean;
  onTopic: (topic: string) => void;
}) {
  return (
    <div className="space-y-5">
      <Panel eyebrow="Community" title="Guidelines">
        <ul className="space-y-2.5 p-4 text-meta leading-relaxed text-stone-600">{GUIDELINES.map((item) => <li key={item} className="flex gap-2"><span className="text-stone-400">•</span><span>{item}</span></li>)}</ul>
      </Panel>
      {topics.length > 0 && <Panel eyebrow="In the conversation" title="Trending topics">
        <div className="flex flex-wrap gap-2 p-4">{topics.slice(0, 8).map(([topic, count]) => <button key={topic} type="button" onClick={() => onTopic(topic)}><Tag>{topic} · {count}</Tag></button>)}</div>
      </Panel>}
      <Panel eyebrow="Meet the community" title="Scholars you may know">
        {peopleLoading ? <SkeletonCard rows={2} className="border-0" />
          : people.length === 0 ? <EmptyState className="py-6" title="No suggestions yet" hint="Sign in to see researcher recommendations." />
            : <ul className="divide-y divide-stone-100">{people.slice(0, 3).map((person) => <li key={person.user_id} className="flex gap-3 px-4 py-3"><Avatar name={person.full_name} size={34} /><div className="min-w-0"><p className="truncate text-ui font-medium text-ink">{person.full_name}</p><p className="truncate text-meta text-stone-500">{person.role} · {shortSchool(person.department)}</p></div></li>)}</ul>}
      </Panel>
      <a href="#compose" className="btn-primary flex w-full">Start a discussion</a>
    </div>
  );
}
