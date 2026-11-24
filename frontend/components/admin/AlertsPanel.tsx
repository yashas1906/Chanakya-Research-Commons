"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Check, Radar, ShieldCheck, ShieldX, TrendingUp, X } from "lucide-react";
import { Panel } from "@/components/ui/Section";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { describeError, getAlerts, resolveAlert, runSpamScan, runSpikeScan } from "@/lib/api";
import { cx, relTime } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import type { SystemAlert } from "@/types/crc";

const isSpam = (a: SystemAlert) => a.alert_type === "spam_account" || a.alert_type === "USER_SPAM";

/** F7 moderation queue: topic spikes and suspected spam accounts, with actions. */
export function AlertsPanel({ onChanged }: { onChanged?: () => void }) {
  const toast = useToast();
  const alerts = useAsync((signal) => getAlerts(signal), []);
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, fn: () => Promise<unknown>, message: string | null) => {
    setBusy(id);
    try {
      await fn();
      if (message) toast(message);
      alerts.reload();
      onChanged?.();
    } catch (e) {
      toast(describeError(e));
    } finally {
      setBusy(null);
    }
  };

  const scan = (kind: "spike" | "spam") =>
    act(`scan-${kind}`, async () => {
      if (kind === "spike") {
        const r = await runSpikeScan();
        toast(r.alerts_raised.length ? `New spike alerts: ${r.alerts_raised.join(", ")}` : `No new spikes (${r.spiking_topics.length} already flagged)`);
      } else {
        const r = await runSpamScan();
        toast(`Checked ${r.evaluated_users} members; ${r.flagged_count} newly flagged`);
      }
    }, null);

  const list = alerts.data ?? [];
  return (
    <Panel title="Alerts to review" meta={alerts.data ? String(list.length) : undefined}>
      <div className="flex flex-wrap gap-2 border-b border-stone-100 px-4 py-2.5">
        <button type="button" className="btn-ghost min-h-8 px-2.5 text-meta" onClick={() => scan("spike")} disabled={busy !== null}>
          <Radar className="h-4 w-4" /> {busy === "scan-spike" ? "Scanning…" : "Scan for topic spikes"}
        </button>
        <button type="button" className="btn-ghost min-h-8 px-2.5 text-meta" onClick={() => scan("spam")} disabled={busy !== null}>
          <ShieldX className="h-4 w-4" /> {busy === "scan-spam" ? "Scanning…" : "Scan for spam accounts"}
        </button>
      </div>
      {alerts.error ? (
        <ErrorState error={alerts.error} onRetry={alerts.reload} />
      ) : !alerts.data ? (
        <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : list.length === 0 ? (
        <EmptyState title="Nothing to review" hint="Topic spikes and suspected spam accounts appear here after each scan or scheduled refresh." />
      ) : (
        <ul className="divide-y divide-stone-100">
          {list.map((a) => {
            const spam = isSpam(a);
            const d = a.details ?? {};
            return (
              <li key={a.alert_id} className={cx("px-4 py-3 transition-opacity", busy === a.alert_id && "opacity-50")}>
                <div className="flex items-start gap-3">
                  {spam ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" /> : <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />}
                  <div className="min-w-0 flex-1">
                    {spam ? (
                      <p className="text-ui font-medium text-ink">
                        Suspected spam:{" "}
                        <Link href={`/u/${a.entity_ref}`} className="hover:underline">{a.entity_name ?? a.entity_ref}</Link>
                      </p>
                    ) : (
                      <p className="text-ui font-medium text-ink">
                        Topic spike: <Link href={`/search?q=${encodeURIComponent(a.entity_ref)}`} className="hover:underline">{a.entity_ref}</Link>
                      </p>
                    )}
                    <p className="text-label text-stone-500">
                      {spam
                        ? `${a.entity_department ?? ""}${d.post_count !== undefined ? ` · ${d.post_count} posts` : ""} · anomaly score ${a.severity_score.toFixed(3)}`
                        : `${d.recent_7d ?? "?"} activities in 7 days vs ${d.baseline_weekly_avg ?? "?"} a week usually · +${Math.round(a.severity_score * 100)}%`}
                      {a.detected_at && ` · ${relTime(a.detected_at)}`}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 pl-7">
                  {spam ? (
                    <>
                      <button type="button" className="btn min-h-8 px-3 text-meta" disabled={busy !== null}
                        onClick={() => act(a.alert_id, () => resolveAlert(a.alert_id, "dismiss"), `${a.entity_name ?? "Member"} cleared; later scans will skip them`)}>
                        <ShieldCheck className="h-4 w-4" /> Not spam, clear flag
                      </button>
                      <button type="button" className="btn-ghost min-h-8 px-3 text-meta text-terracotta-700" disabled={busy !== null}
                        onClick={() => act(a.alert_id, () => resolveAlert(a.alert_id, "confirm"), "Confirmed; the account stays hidden")}>
                        <Check className="h-4 w-4" /> Confirm spam
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn-ghost min-h-8 px-3 text-meta" disabled={busy !== null}
                      onClick={() => act(a.alert_id, () => resolveAlert(a.alert_id), "Spike alert closed")}>
                      <X className="h-4 w-4" /> Mark reviewed
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
