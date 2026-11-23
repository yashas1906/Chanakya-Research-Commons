"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, Gauge, Loader2, ShieldAlert } from "lucide-react";
import { scoreSubmission, describeError } from "@/lib/api";
import { cx } from "@/lib/format";
import type { GatekeeperInput, GatekeeperVerdict } from "@/types/crc";

const TYPICAL: GatekeeperInput = {
  title: "Hierarchical attention networks for citation recommendation",
  abstract:
    "We propose a hierarchical attention model that ranks candidate references for a manuscript, evaluated on two open citation corpora with consistent gains over strong baselines.",
  author_count: 4,
  reference_count: 38,
  submissions_last_24h: 1,
  publication_year: 2025,
};

const SUSPICIOUS: GatekeeperInput = {
  title: "Best cheap results click here guaranteed publication",
  abstract: "Great results.",
  author_count: 1,
  reference_count: 0,
  submissions_last_24h: 47,
  publication_year: 2025,
};

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="eyebrow mb-1 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-meta text-stone-400">{hint}</span>}
    </label>
  );
}

/** Collapsible live tester for the submission gatekeeper (Isolation Forest scorer, target < 5 ms server-side). */
export function GatekeeperTester() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<GatekeeperInput>(TYPICAL);
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<GatekeeperVerdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const set = <K extends keyof GatekeeperInput>(k: K, v: GatekeeperInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const numField = (k: "author_count" | "reference_count" | "submissions_last_24h" | "publication_year") => (
    <input
      type="number"
      min={0}
      value={form[k]}
      onChange={(e) => set(k, Math.max(0, Number(e.target.value) || 0))}
      className="input num"
    />
  );

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setVerdict(await scoreSubmission(form));
    } catch (err) {
      setVerdict(null);
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const serverMs = verdict?.server_ms;
  const budgetOk = serverMs != null ? serverMs < 5 : null;

  return (
    <div className="rounded-lg border border-stone-200/90 bg-paper">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-canvas/70"
      >
        <span className="flex items-center gap-2.5">
          <Gauge className="h-4 w-4 text-stone-400" strokeWidth={1.5} />
          <span>
            <span className="block font-display text-[16px] leading-tight text-ink">Live submission gatekeeper</span>
            <span className="block text-meta text-stone-500">Score sample metadata against the Isolation Forest — target under 5 ms</span>
          </span>
        </span>
        <ChevronDown className={cx("h-4 w-4 shrink-0 text-stone-400 transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div className="animate-rise border-t border-stone-100 p-4">
          <form onSubmit={run} className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3.5">
              <div className="flex gap-2">
                <button type="button" className="btn" onClick={() => setForm(TYPICAL)}>
                  Typical submission
                </button>
                <button type="button" className="btn" onClick={() => setForm(SUSPICIOUS)}>
                  Suspicious burst
                </button>
              </div>
              <Field label="Title">
                <input value={form.title} onChange={(e) => set("title", e.target.value)} className="input" />
              </Field>
              <Field label="Abstract" hint={`${form.abstract.length} characters`}>
                <textarea value={form.abstract} onChange={(e) => set("abstract", e.target.value)} rows={3} className="input resize-y" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Authors">{numField("author_count")}</Field>
                <Field label="References">{numField("reference_count")}</Field>
                <Field label="Submissions / 24h">{numField("submissions_last_24h")}</Field>
                <Field label="Year">{numField("publication_year")}</Field>
              </div>
              <button type="submit" disabled={busy} className="btn-primary">
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Score submission
              </button>
            </div>

            <div aria-live="polite" className="min-h-[200px]">
              {error ? (
                <div role="alert" className="rounded-lg border border-terracotta-200 bg-terracotta-50 px-4 py-3 text-meta leading-relaxed text-terracotta-700">
                  {error}
                </div>
              ) : verdict ? (
                <div className="space-y-4">
                  <div
                    className={cx(
                      "flex items-center gap-3 rounded-lg border px-4 py-3.5",
                      verdict.flagged ? "border-terracotta-200 bg-terracotta-50" : "border-sage-200 bg-sage-50",
                    )}
                  >
                    {verdict.flagged ? (
                      <ShieldAlert className="h-6 w-6 shrink-0 text-terracotta-600" strokeWidth={1.5} />
                    ) : (
                      <CheckCircle2 className="h-6 w-6 shrink-0 text-sage-600" strokeWidth={1.5} />
                    )}
                    <div>
                      <p className={cx("font-display text-[20px] leading-tight", verdict.flagged ? "text-terracotta-700" : "text-sage-700")}>
                        {verdict.flagged ? "Held for integrity review" : "Cleared for submission"}
                      </p>
                      {verdict.score !== null && <p className="num text-meta text-stone-600">Anomaly score {verdict.score.toFixed(3)}</p>}
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 divide-x divide-stone-100 rounded-lg border border-stone-200/90">
                    <div className="px-3 py-2.5">
                      <dt className="eyebrow">Scorer time</dt>
                      <dd className="num mt-0.5 text-[15px] font-medium text-ink">
                        {serverMs != null ? `${serverMs.toFixed(2)} ms` : "not reported"}
                        {budgetOk !== null && (
                          <span className={cx("ml-1.5 text-meta font-medium", budgetOk ? "text-sage-600" : "text-terracotta-600")}>
                            {budgetOk ? "within 5 ms" : "over 5 ms"}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="px-3 py-2.5">
                      <dt className="eyebrow">Round trip</dt>
                      <dd className="num mt-0.5 text-[15px] font-medium text-ink">{verdict.round_trip_ms.toFixed(0)} ms</dd>
                    </div>
                  </dl>

                  {verdict.reasons.length > 0 && (
                    <ul className="list-disc space-y-1 pl-5 text-meta leading-relaxed text-stone-700 marker:text-stone-300">
                      {verdict.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  )}

                  <div>
                    <button type="button" onClick={() => setShowRaw((s) => !s)} className="text-meta font-medium text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-ink">
                      {showRaw ? "Hide" : "Show"} raw response
                    </button>
                    {showRaw && (
                      <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-sunken p-3 font-mono text-meta leading-relaxed text-stone-700">
                        {JSON.stringify(verdict.raw, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[200px] items-center justify-center rounded-lg border border-dashed border-stone-200 px-6 text-center text-meta leading-relaxed text-stone-500">
                  Choose a preset or edit the fields, then score the submission to see the gatekeeper&apos;s decision.
                </div>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
