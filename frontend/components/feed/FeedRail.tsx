"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, Flame, PenLine } from "lucide-react";
import { Avatar } from "@/components/ui/Section";
import { Skeleton } from "@/components/ui/Skeleton";
import { cx, shortSchool } from "@/lib/format";
import type { RecommendedPerson } from "@/types/crc";

const GUIDELINES = [
  "Be rigorous and cite the work you discuss.",
  "Keep criticism constructive and specific.",
  "Avoid promotional or repetitive posts.",
  "Respect authorship and research integrity.",
];

export function FeedRail({
  topics,
  people,
  peopleLoading,
  postCount,
  schoolCount,
  onTopic,
  onCompose,
}: {
  topics: Array<[string, number]>;
  people: RecommendedPerson[];
  peopleLoading: boolean;
  postCount: number;
  schoolCount: number;
  onTopic: (topic: string) => void;
  onCompose: () => void;
}) {
  const [rulesOpen, setRulesOpen] = useState(true);
  return (
    <div className="space-y-4">
      {/* Community card */}
      <section className="card overflow-hidden">
        <div className="hero h-14">
        </div>
        <div className="px-4 pb-4">
          <span className="relative -mt-6 flex h-12 w-12 items-center justify-center rounded-xl border-4 border-paper bg-saffron-400 font-display text-lg text-deep">R</span>
          <h2 className="mt-2 font-display text-[17px] text-ink">Research feed</h2>
          <p className="mt-1 text-meta leading-relaxed text-stone-600">Findings, questions and papers from scholars across Chanakya University.</p>
          <dl className="mt-3 grid grid-cols-3 gap-2 border-y border-stone-100 py-3 text-center">
            {[["Posts", postCount], ["Schools", schoolCount], ["Topics", topics.length]].map(([label, value]) => (
              <div key={label}>
                <dt className="text-label text-stone-500">{label}</dt>
                <dd className="num font-display text-[17px] text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <button type="button" onClick={onCompose} className="btn-primary mt-3 w-full"><PenLine className="h-4 w-4" /> Create post</button>
        </div>
      </section>

      {/* Rules */}
      <section className="card">
        <button type="button" onClick={() => setRulesOpen((v) => !v)} aria-expanded={rulesOpen} className="flex w-full items-center justify-between px-4 py-3 text-left">
          <h2 className="font-display text-[15px] text-ink">Community guidelines</h2>
          <ChevronDown className={cx("h-4 w-4 text-stone-500 transition-transform", rulesOpen && "rotate-180")} />
        </button>
        {rulesOpen && (
          <ol className="animate-fade space-y-2.5 border-t border-stone-100 px-4 py-3">
            {GUIDELINES.map((rule, index) => (
              <li key={rule} className="flex gap-3 text-meta leading-relaxed text-stone-600">
                <span className="num flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-100 text-label font-semibold text-stone-600">{index + 1}</span>
                {rule}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Trending */}
      {topics.length > 0 && (
        <section className="card">
          <h2 className="flex items-center gap-2 border-b border-stone-100 px-4 py-3 font-display text-[15px] text-ink">
            <Flame className="h-4 w-4 text-saffron-500" /> Trending topics
          </h2>
          <ul className="p-1.5">
            {topics.slice(0, 6).map(([topic, count], index) => (
              <li key={topic}>
                <button type="button" onClick={() => onTopic(topic)} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-stone-100">
                  <span className="num w-4 text-label font-semibold text-stone-400">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-meta font-medium text-ink">{topic}</span>
                  <span className="num text-label text-stone-500">{count} posts</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* People */}
      <section className="card">
        <h2 className="border-b border-stone-100 px-4 py-3 font-display text-[15px] text-ink">Scholars you may know</h2>
        {peopleLoading ? (
          <div className="space-y-3 p-4"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div>
        ) : people.length === 0 ? (
          <p className="px-4 py-5 text-meta text-stone-500">Log in to see researchers who work in areas close to yours.</p>
        ) : (
          <ul className="p-1.5">
            {people.slice(0, 3).map((person) => (
              <li key={person.user_id}>
                <Link href={`/u/${person.user_id}`} className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition hover:bg-stone-100">
                  <Avatar name={person.full_name} size={34} />
                  <span className="min-w-0">
                    <span className="block truncate text-meta font-semibold text-ink">{person.full_name}</span>
                    <span className="block truncate text-label capitalize text-stone-500">{person.role} · {shortSchool(person.department)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
