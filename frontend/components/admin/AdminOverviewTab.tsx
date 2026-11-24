"use client";

import Link from "next/link";
import { AlertTriangle, BookOpen, FileText, MessageSquare, ThumbsUp, Users } from "lucide-react";
import { Sparkline } from "@/components/analytics/charts";
import { AlertsPanel } from "@/components/admin/AlertsPanel";
import { Avatar, Panel } from "@/components/ui/Section";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Skeleton } from "@/components/ui/Skeleton";
import type { AsyncState } from "@/lib/hooks";
import { cx, fmtInt } from "@/lib/format";
import type { AdminOverview } from "@/types/crc";

const ROLE_LABEL: Record<string, string> = { student: "Students", faculty: "Faculty", researcher: "Researchers", admin: "Admins" };

function Kpi({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: number; note?: string; tone?: "alert" }) {
  return (
    <div className="card p-4">
      <div className={cx("flex items-center gap-2 text-label font-semibold uppercase tracking-[0.12em]", tone === "alert" && value > 0 ? "text-terracotta-600" : "text-stone-500")}>
        {icon}
        {label}
      </div>
      <p className="num mt-2 font-display text-[28px] leading-none text-ink">{fmtInt(value)}</p>
      {note && <p className="mt-1.5 text-label text-stone-500">{note}</p>}
    </div>
  );
}

function Bars({ rows, total }: { rows: Array<{ label: string; count: number }>; total: number }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <ul className="space-y-3 p-4">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-meta">
            <span className="truncate text-stone-700">{r.label}</span>
            <span className="num shrink-0 text-stone-500">
              <span className="font-semibold text-ink">{fmtInt(r.count)}</span> · {total ? Math.round((r.count / total) * 100) : 0}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100" role="presentation">
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Skel() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading admin overview">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-[92px]" />)}
      </div>
      <Skeleton className="h-56" />
      <div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
    </div>
  );
}

export function AdminOverviewTab({ state, onOpenMembers }: { state: AsyncState<AdminOverview>; onOpenMembers: () => void }) {
  const { data, error, loading, reload } = state;
  if (!data) return error ? <ErrorState error={error} onRetry={reload} /> : loading ? <Skel /> : null;

  const t = data.totals;
  const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const series = (key: "posts" | "comments" | "votes" | "saves") => data.activity.map((a) => ({ label: day(a.day), value: a[key] }));
  const sum = (key: "posts" | "comments" | "votes" | "saves") => data.activity.reduce((n, a) => n + a[key], 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={<Users className="h-3.5 w-3.5" />} label="Members" value={t.members} note={t.flagged_members ? `${t.flagged_members} flagged as spam` : "None flagged"} />
        <Kpi icon={<BookOpen className="h-3.5 w-3.5" />} label="Papers" value={t.papers} note={`${fmtInt(t.library_papers)} in the library`} />
        <Kpi icon={<FileText className="h-3.5 w-3.5" />} label="Posts" value={t.posts} />
        <Kpi icon={<MessageSquare className="h-3.5 w-3.5" />} label="Comments" value={t.comments} />
        <Kpi icon={<ThumbsUp className="h-3.5 w-3.5" />} label="Votes" value={t.votes} />
        <Kpi icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Open alerts" value={t.open_alerts} tone="alert" note={t.open_alerts ? "Needs review" : "All clear"} />
      </div>

      <Panel title="Activity, last 30 days" meta="per day">
        <div className="grid gap-x-8 gap-y-6 p-5 sm:grid-cols-2 xl:grid-cols-4">
          {(["posts", "comments", "votes", "saves"] as const).map((k) => (
            <div key={k}>
              <p className="text-label font-semibold uppercase tracking-[0.12em] text-stone-500">{k}</p>
              <p className="num mb-1 font-display text-[22px] leading-tight text-ink">{fmtInt(sum(k))}</p>
              <Sparkline points={series(k)} name={`Daily ${k}`} />
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Members by role" meta={fmtInt(t.members)}>
          <Bars rows={data.members_by_role.map((r) => ({ label: ROLE_LABEL[r.role] ?? r.role, count: r.count }))} total={t.members} />
        </Panel>
        <Panel title="Members by department">
          <Bars rows={data.members_by_department.map((r) => ({ label: r.department, count: r.count }))} total={t.members} />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Top contributors"
          actions={<button type="button" onClick={onOpenMembers} className="text-meta font-medium text-brand-700 hover:text-brand-600">All members →</button>}
        >
          {data.top_contributors.length === 0 ? (
            <EmptyState title="No posts yet" />
          ) : (
            <ul className="divide-y divide-stone-100">
              {data.top_contributors.map((c) => (
                <li key={c.user_id}>
                  <Link href={`/u/${c.user_id}`} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-stone-50">
                    <Avatar name={c.full_name} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ui font-medium text-ink">{c.full_name}</span>
                      <span className="block truncate text-label text-stone-500">{c.department}</span>
                    </span>
                    <RoleBadge role={c.role} />
                    <span className="num w-20 shrink-0 text-right text-meta text-stone-500"><span className="font-semibold text-ink">{fmtInt(c.karma)}</span> karma</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <AlertsPanel onChanged={reload} />
      </div>
    </div>
  );
}
