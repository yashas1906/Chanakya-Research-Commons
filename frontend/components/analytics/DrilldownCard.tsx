"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Panel } from "@/components/ui/Section";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Skeleton } from "@/components/ui/Skeleton";
import { getDrilldown } from "@/lib/api";
import { cx, fmtInt } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import type { DrilldownRow } from "@/types/crc";

/** F9 drill-down over the star schema: university -> school -> topic -> member. */
export function DrilldownCard() {
  const [school, setSchool] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const { data, error, loading, reload } = useAsync((signal) => getDrilldown(school, topic, signal), [school, topic]);

  const crumbs = [
    { label: "University", onClick: () => { setSchool(null); setTopic(null); }, active: !school },
    ...(school ? [{ label: school, onClick: () => setTopic(null), active: !topic }] : []),
    ...(topic ? [{ label: topic, onClick: () => undefined, active: true }] : []),
  ];
  const rows = data?.data ?? [];
  const max = Math.max(1, ...rows.map((r) => r.activity));

  const name = (r: DrilldownRow) =>
    data?.level === "school" ? r.school ?? "" : data?.level === "topic" ? r.topic_name ?? "" : r.full_name ?? "";
  const sub = (r: DrilldownRow) =>
    data?.level === "school"
      ? `${fmtInt(r.members)} active members${r.top_topic ? ` · top topic: ${r.top_topic}` : ""}`
      : data?.level === "topic"
        ? `${fmtInt(r.members)} members${r.parent_cluster ? ` · ${r.parent_cluster}` : ""}`
        : null;
  const open = (r: DrilldownRow) => {
    if (data?.level === "school" && r.school) setSchool(r.school);
    else if (data?.level === "topic" && r.topic_name) setTopic(r.topic_name);
  };

  return (
    <Panel title="Drill-down: university → school → topic → member">
      <nav aria-label="Drill-down level" className="flex flex-wrap items-center gap-1 border-b border-stone-100 px-4 py-2.5 text-meta">
        {crumbs.map((c, i) => (
          <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-stone-400" />}
            <button type="button" onClick={c.onClick} disabled={c.active} aria-current={c.active ? "page" : undefined}
              className={cx("rounded px-1.5 py-0.5", c.active ? "font-semibold text-ink" : "text-brand-700 hover:bg-brand-50")}>
              {c.label}
            </button>
          </span>
        ))}
      </nav>
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState title="No activity recorded at this level" hint="Run the warehouse ELT to refresh dw.fact_research_activity." />
      ) : (
        <div className={cx("overflow-x-auto transition-opacity", loading && "opacity-60")}>
          <table className="w-full min-w-[560px] text-left text-meta">
            <thead>
              <tr className="border-b border-stone-200 text-label uppercase tracking-[0.1em] text-stone-500">
                <th className="px-4 py-2 font-semibold">{data?.level === "school" ? "School" : data?.level === "topic" ? "Topic" : "Member"}</th>
                <th className="px-3 py-2 text-right font-semibold">Saves</th>
                <th className="px-3 py-2 text-right font-semibold">Posts</th>
                <th className="hidden px-3 py-2 text-right font-semibold sm:table-cell">Comments</th>
                <th className="px-3 py-2 text-right font-semibold">Views</th>
                <th className="w-40 px-4 py-2 font-semibold">Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((r) => (
                <tr key={name(r)} className={cx("transition", data?.level !== "member" && "cursor-pointer hover:bg-stone-50")} onClick={() => open(r)}>
                  <td className="px-4 py-2.5">
                    {data?.level === "member" && r.user_id ? (
                      <span className="flex items-center gap-2">
                        <Link href={`/u/${r.user_id}`} className="font-medium text-ink hover:underline">{r.full_name}</Link>
                        {r.role && <RoleBadge role={r.role} />}
                      </span>
                    ) : (
                      <button type="button" onClick={(e) => { e.stopPropagation(); open(r); }} className="text-left">
                        <span className="block font-medium text-ink hover:underline">{name(r)}</span>
                        {sub(r) && <span className="block text-label text-stone-500">{sub(r)}</span>}
                      </button>
                    )}
                  </td>
                  <td className="num px-3 py-2.5 text-right">{fmtInt(r.saves)}</td>
                  <td className="num px-3 py-2.5 text-right">{fmtInt(r.posts)}</td>
                  <td className="num hidden px-3 py-2.5 text-right sm:table-cell">{fmtInt(r.comments)}</td>
                  <td className="num px-3 py-2.5 text-right">{fmtInt(r.views)}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
                        <span className="block h-full rounded-full bg-brand-600" style={{ width: `${(r.activity / max) * 100}%` }} />
                      </span>
                      <span className="num w-12 text-right text-label text-stone-500">{fmtInt(r.activity)}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
