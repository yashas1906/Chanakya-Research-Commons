"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowUp, Info, Library, Plus, RotateCw, Sparkles, Square, X } from "lucide-react";
import { AnswerText } from "@/components/assistant/AnswerText";
import { SourcesPanel } from "@/components/assistant/EvidenceInspector";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { getPaper, isAbort, streamAssistant } from "@/lib/api";
import { cx } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/context/AuthContext";
import type { Citation } from "@/types/crc";

interface Turn {
  id: number;
  question: string;
  libraryOnly: boolean;
  paperId: string | null;
  /** pending: searching · streaming: sources in, answer being written · done · error */
  status: "pending" | "streaming" | "done" | "error";
  answer: string;
  citations: Citation[];
  /** The model didn't answer, so the text was assembled from the retrieved passages. */
  degraded: boolean;
  error?: unknown;
}

const SUGGESTIONS = [
  "What are the key applications and challenges of graph neural networks?",
  "How does federated learning protect privacy?",
  "What methods exist for detecting anomalies in citation data?",
];

function Dots() {
  return (
    <span className="flex gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-saffron-500" style={{ animationDelay: `${i * 160}ms` }} />
      ))}
    </span>
  );
}

function AssistantMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-900 font-display text-[16px] leading-none text-saffron-300 shadow-card", className)}>
      C
    </span>
  );
}

export function AssistantWorkspace() {
  const searchParams = useSearchParams();
  const { user, promptLogin } = useAuth();
  const [paperScope, setPaperScope] = useState<string | null>(searchParams.get("paper"));
  const scopedPaper = useAsync((signal) => getPaper(paperScope!, signal), [paperScope], !!paperScope);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState(searchParams.get("q") ?? "");
  const [libraryOnly, setLibraryOnly] = useState(false);
  const [focus, setFocus] = useState<{ turn: number; ref: number } | null>(null);
  const [openSources, setOpenSources] = useState<Set<number>>(() => new Set());
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const idRef = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const pendingTurn = turns.find((t) => t.status === "pending" || t.status === "streaming");

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

  // Grow the textarea with its content, like a chat box.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [question]);

  const ask = useCallback(
    async (q: string) => {
      const text = q.trim();
      if (!text || abortRef.current) return;
      if (!user) {
        promptLogin("login");
        return;
      }
      const id = ++idRef.current;
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const patch = (fn: (t: Turn) => Turn) => setTurns((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
      setTurns((prev) => [...prev, { id, question: text, libraryOnly, paperId: paperScope, status: "pending", answer: "", citations: [], degraded: false }]);
      setFocus(null);
      setQuestion("");
      try {
        await streamAssistant(text, libraryOnly, ctrl.signal, paperScope, {
          onMeta: (citations) => patch((t) => ({ ...t, status: "streaming", citations })),
          onToken: (piece) => patch((t) => ({ ...t, status: "streaming", answer: t.answer + piece })),
          onReplace: (answer) => patch((t) => ({ ...t, answer })),
          onDone: ({ degraded }) => patch((t) => ({ ...t, status: "done", degraded })),
        });
      } catch (e) {
        if (isAbort(e)) {
          // Stopping keeps whatever was already written; an empty turn is dropped.
          setTurns((prev) => prev.flatMap((t) => (t.id !== id ? [t] : t.answer ? [{ ...t, status: "done" as const }] : [])));
        } else {
          patch((t) => ({ ...t, status: "error", error: e }));
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

  // Follow the text as it is written, unless the reader has scrolled up to look at something.
  const streamedLength = pendingTurn?.answer.length ?? 0;
  useEffect(() => {
    if (!streamedLength) return;
    const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 260;
    if (nearBottom) endRef.current?.scrollIntoView({ block: "end" });
  }, [streamedLength]);

  const toggleSources = (id: number) =>
    setOpenSources((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const selectRef = (turn: number, ref: number) => {
    setFocus((cur) => (cur?.turn === turn && cur.ref === ref ? null : { turn, ref }));
    setOpenSources((prev) => new Set(prev).add(turn));
  };
  const newChat = () => {
    abortRef.current?.abort();
    setTurns([]);
    setFocus(null);
    setOpenSources(new Set());
    setQuestion("");
    inputRef.current?.focus();
  };

  const empty = turns.length === 0;

  const composer = (
    <div className="space-y-2">
      {paperScope && (
        <div className="flex items-center gap-2 rounded-xl border border-saffron-200 bg-saffron-50 px-3.5 py-2 text-meta text-stone-700">
          <span className="shrink-0 font-semibold text-saffron-600">Scoped to</span>
          <Link href={`/papers/${paperScope}`} className="min-w-0 flex-1 truncate font-medium text-ink hover:underline">{scopedPaper.data?.canonical_title ?? paperScope}</Link>
          <button type="button" onClick={() => setPaperScope(null)} className="rounded-full p-1 text-stone-500 hover:bg-saffron-100 hover:text-ink" aria-label="Remove paper scope">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="rounded-2xl border border-stone-200 bg-paper p-3 shadow-lift transition focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100"
      >
        <textarea
          ref={inputRef}
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
          className="block max-h-[200px] w-full resize-none border-0 bg-transparent px-2 py-1 text-[16px] leading-relaxed text-ink placeholder:text-stone-400 focus:outline-none"
        />
        <div className="mt-1 flex items-center justify-between gap-3 border-t border-stone-100 pt-2.5">
          <label className="flex cursor-pointer items-center gap-2 text-meta text-stone-600">
            <input type="checkbox" checked={libraryOnly} onChange={(e) => setLibraryOnly(e.target.checked)} className="h-3.5 w-3.5 rounded border-stone-300 accent-brand-600" />
            <Library className="h-3.5 w-3.5 text-stone-400" /> Chanakya Library only
          </label>
          {pendingTurn ? (
            <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>
              <Square className="h-3 w-3 fill-current" /> Stop
            </button>
          ) : (
            <button type="submit" disabled={!question.trim()} className="btn-primary h-9 w-9 !px-0" aria-label="Ask">
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>
      <p className="px-2 text-center text-label text-stone-400">Answers come from a local model using only retrieved library passages. Check the sources.</p>
    </div>
  );

  if (empty) {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-[720px] flex-col justify-center gap-8 pb-10">
        <div className="text-center">
          <AssistantMark className="mx-auto h-12 w-12 text-[24px]" />
          <h1 className="mt-5 font-display text-[34px] leading-tight text-ink sm:text-[40px]">What would you like to know?</h1>
          <p className="mx-auto mt-3 max-w-lg text-body leading-relaxed text-stone-600">
            Ask anything about Chanakya’s research. Every answer is grounded in the library’s papers, with sources you can check.
          </p>
        </div>
        {composer}
        <ul className="grid gap-2.5 sm:grid-cols-3" aria-label="Suggested questions">
          {SUGGESTIONS.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => ask(s)}
                className="card card-hover flex h-full w-full flex-col items-start gap-2 p-4 text-left"
              >
                <Sparkles className="h-4 w-4 text-saffron-500" />
                <span className="text-meta font-medium leading-snug text-stone-700">{s}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[760px]">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-[20px] text-ink">Research assistant</h1>
        <button type="button" onClick={newChat} className="btn h-9"><Plus className="h-4 w-4" /> New chat</button>
      </div>

      <section className="space-y-9 pb-8" aria-label="Research Q&A thread">
        {turns.map((t) => (
          <div key={t.id} className="space-y-6 animate-rise">
            {/* user */}
            <div className="flex justify-end">
              <div className="max-w-[88%] rounded-2xl rounded-br-md bg-brand-900 px-4 py-3 text-[16px] leading-relaxed text-white shadow-card sm:max-w-[80%]">
                {t.question}
                {(t.libraryOnly || t.paperId) && (
                  <p className="mt-1.5 text-label font-medium text-saffron-300">
                    {t.paperId ? "Scoped to a paper" : "Chanakya Library only"}
                  </p>
                )}
              </div>
            </div>

            {/* assistant */}
            <div className="flex gap-3.5">
              <AssistantMark className="mt-0.5" />
              <div className="min-w-0 flex-1 space-y-5">
                {t.status === "pending" && (
                  <div role="status" aria-live="polite" className="space-y-3">
                    <p className="flex items-center gap-2 text-meta text-stone-500">
                      <Dots />
                      Searching the library · <span className="num">{elapsed}s</span>
                    </p>
                    <div className="space-y-2.5">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-11/12" />
                      <Skeleton className="h-4 w-3/5" />
                    </div>
                  </div>
                )}

                {t.status === "error" && (
                  <div className="card">
                    <ErrorState compact error={t.error} onRetry={() => ask(t.question)} />
                  </div>
                )}

                {(t.status === "streaming" || t.status === "done") && (
                  <>
                    {t.degraded && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-saffron-200 bg-saffron-50 px-3.5 py-2.5 text-meta text-stone-700">
                        <span className="flex min-w-0 flex-1 items-start gap-2">
                          <Info className="mt-0.5 h-4 w-4 shrink-0 text-saffron-600" />
                          The language model didn’t respond in time, so this answer is assembled directly from the sources below.
                        </span>
                        <button type="button" onClick={() => ask(t.question)} className="inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:text-brand-700">
                          <RotateCw className="h-3.5 w-3.5" /> Try again
                        </button>
                      </div>
                    )}

                    {t.answer ? (
                      <AnswerText
                        text={t.status === "streaming" ? `${t.answer}▍` : t.answer}
                        citations={t.citations}
                        activeRef={focus?.turn === t.id ? focus.ref : null}
                        onSelect={(n) => selectRef(t.id, n)}
                      />
                    ) : (
                      <div role="status" aria-live="polite" className="space-y-3">
                        <p className="flex items-center gap-2 text-meta text-stone-500">
                          <Dots />
                          Reading {t.citations.length} {t.citations.length === 1 ? "passage" : "passages"} and writing an answer · <span className="num">{elapsed}s</span>
                          {elapsed > 20 && <span className="hidden sm:inline"> — the first answer after startup is the slowest.</span>}
                        </p>
                        <div className="space-y-2.5">
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-10/12" />
                        </div>
                      </div>
                    )}

                    {t.citations.length > 0 && (
                      <SourcesPanel
                        citations={t.citations}
                        answer={t.answer}
                        activeRef={focus?.turn === t.id ? focus.ref : null}
                        expanded={openSources.has(t.id)}
                        onToggle={() => toggleSources(t.id)}
                        onSelect={(n) => selectRef(t.id, n)}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </section>

      <div className="sticky bottom-0 -mx-4 bg-gradient-to-t from-canvas via-canvas to-transparent px-4 pb-4 pt-8 sm:-mx-6 sm:px-6">{composer}</div>
    </div>
  );
}
