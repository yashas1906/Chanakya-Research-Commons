"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowUp, Square, TriangleAlert } from "lucide-react";
import { AnswerText } from "@/components/assistant/AnswerText";
import { EvidenceInspector } from "@/components/assistant/EvidenceInspector";
import { PageHeader } from "@/components/ui/Section";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { askAssistant, getPaper, isAbort } from "@/lib/api";
import { cx } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/context/AuthContext";
import type { AssistantAnswer } from "@/types/crc";

interface Turn {
  id: number;
  question: string;
  libraryOnly: boolean;
  paperId: string | null;
  status: "pending" | "done" | "error";
  result?: AssistantAnswer;
  error?: unknown;
}

const SUGGESTIONS = [
  "What are the key applications and challenges of graph neural networks?",
  "How does federated learning protect privacy?",
  "What methods exist for detecting anomalies in citation data?",
];

export function AssistantWorkspace() {
  const searchParams = useSearchParams();
  const { user, promptLogin } = useAuth();
  const [paperScope, setPaperScope] = useState<string | null>(searchParams.get("paper"));
  const scopedPaper = useAsync((signal) => getPaper(paperScope!, signal), [paperScope], !!paperScope);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState(searchParams.get("q") ?? "");
  const [libraryOnly, setLibraryOnly] = useState(false);
  const [activeTurn, setActiveTurn] = useState<number | null>(null);
  const [activeRef, setActiveRef] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const idRef = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  const pendingTurn = turns.find((t) => t.status === "pending");

  useEffect(() => {
    setPaperScope(searchParams.get("paper"));
    setQuestion(searchParams.get("q") ?? "");
  }, [searchParams]);

  // Elapsed timer while the local model is working.
  useEffect(() => {
    if (!pendingTurn) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [pendingTurn?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => abortRef.current?.abort(), []);

  const ask = useCallback(
    async (q: string) => {
      const text = q.trim();
      if (!text || abortRef.current) return;
      if (!user) {
        promptLogin();
        return;
      }
      const id = ++idRef.current;
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setTurns((prev) => [...prev, { id, question: text, libraryOnly, paperId: paperScope, status: "pending" }]);
      setActiveTurn(id);
      setActiveRef(null);
      setQuestion("");
      try {
        const result = await askAssistant(text, libraryOnly, ctrl.signal, paperScope);
        setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, status: "done", result } : t)));
      } catch (e) {
        if (isAbort(e)) {
          setTurns((prev) => prev.filter((t) => t.id !== id));
        } else {
          setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, status: "error", error: e } : t)));
        }
      } finally {
        abortRef.current = null;
      }
    },
    [libraryOnly, paperScope, user, promptLogin],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, pendingTurn?.status]);

  const active = turns.find((t) => t.id === activeTurn) ?? null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Grounded assistant"
        title="Ask the library"
        description="Answers are written by a local model using only passages retrieved from Chanakya's papers. Every claim carries a citation you can inspect."
      />

      {paperScope && <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-paper px-4 py-3">
        <p className="min-w-0 truncate text-ui text-stone-700">Scoped to: <Link href={`/papers/${paperScope}`} className="font-medium text-ink hover:underline">{scopedPaper.data?.canonical_title ?? paperScope}</Link></p>
        <button type="button" onClick={() => setPaperScope(null)} className="btn h-9">Remove scope</button>
      </div>}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* ----------------------------- thread ----------------------------- */}
        <section className="flex min-h-[520px] flex-col lg:col-span-7" aria-label="Research Q&A thread">
          <div className="flex-1 space-y-8 pb-6">
            {turns.length === 0 && (
              <div className="card px-6 py-8">
                <p className="eyebrow mb-2">Try asking</p>
                <ul className="space-y-1.5">
                  {SUGGESTIONS.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => ask(s)}
                        className="w-full rounded-lg px-3 py-2 text-left font-medium text-[17px] leading-snug text-stone-700 transition-colors hover:bg-sunken hover:text-ink"
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {turns.map((t) => {
              const selected = t.id === activeTurn;
              return (
                <article
                  key={t.id}
                  className={cx(
                    "space-y-4 rounded-xl transition-colors duration-200",
                    selected && turns.length > 1 && "-mx-4 bg-paper px-4 py-4 ring-1 ring-stone-200/90",
                  )}
                  onClick={() => {
                    if (t.status === "done" && !selected) {
                      setActiveTurn(t.id);
                      setActiveRef(null);
                    }
                  }}
                >
                  <h2 className="font-display text-[24px] leading-snug tracking-tight text-ink">{t.question}</h2>
                  {t.libraryOnly && <p className="eyebrow">Restricted to Chanakya Library</p>}
                  {t.paperId && <p className="eyebrow">Scoped to a paper</p>}

                  {t.status === "pending" && (
                    <div className="space-y-3" role="status" aria-live="polite">
                      <p className="text-meta text-stone-500">
                        Retrieving passages and writing an answer
                        <span className="num"> · {elapsed}s</span>
                        {elapsed > 15 && <span> — local models can take up to a minute.</span>}
                      </p>
                      <div className="space-y-2.5">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-11/12" />
                        <Skeleton className="h-4 w-4/5" />
                      </div>
                    </div>
                  )}

                  {t.status === "error" && (
                    <div className="card">
                      <ErrorState compact error={t.error} onRetry={() => ask(t.question)} />
                    </div>
                  )}

                  {t.status === "done" && t.result && (
                    <>
                      {t.result.degraded && (
                        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-terracotta-200 bg-terracotta-50 px-3.5 py-2.5 text-meta leading-relaxed text-terracotta-700">
                          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            {t.result.answer || "The local model returned nothing."}{" "}
                            {t.result.citations.length > 0 && "The retrieved passages are still shown in the inspector."}
                          </span>
                        </div>
                      )}
                      {!t.result.degraded && (
                        <AnswerText
                          text={t.result.answer}
                          citations={t.result.citations}
                          activeRef={selected ? activeRef : null}
                          onSelect={(n) => {
                            setActiveTurn(t.id);
                            setActiveRef((cur) => (selected && cur === n ? null : n));
                          }}
                        />
                      )}
                    </>
                  )}
                </article>
              );
            })}
            <div ref={endRef} />
          </div>

          {/* ----------------------------- composer ---------------------------- */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
            className="card sticky bottom-4 z-10 space-y-2.5 bg-paper p-3 shadow-[0_8px_24px_-16px_rgba(24,24,27,0.25)]"
          >
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(question);
                }
              }}
              rows={2}
              placeholder="Ask a research question…"
              aria-label="Research question"
              className="w-full resize-none border-0 bg-transparent px-2 py-1 text-[15.5px] leading-relaxed text-ink placeholder:text-stone-400 focus:outline-none"
            />
            <div className="flex items-center justify-between gap-3 border-t border-stone-100 pt-2.5">
              <label className="flex cursor-pointer items-center gap-2 text-meta text-stone-600">
                <input
                  type="checkbox"
                  checked={libraryOnly}
                  onChange={(e) => setLibraryOnly(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-stone-300 accent-ink"
                />
                Chanakya Library only
              </label>
              {pendingTurn ? (
                <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>
                  <Square className="h-3 w-3 fill-current" /> Stop
                </button>
              ) : (
                <button type="submit" disabled={!question.trim()} className="btn-primary">
                  Ask <ArrowUp className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </form>
        </section>

        {/* ---------------------------- inspector --------------------------- */}
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-24">
            <EvidenceInspector
              turn={active?.status === "done" ? (active.result ?? null) : null}
              pending={active?.status === "pending"}
              activeRef={activeRef}
              onSelect={setActiveRef}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
