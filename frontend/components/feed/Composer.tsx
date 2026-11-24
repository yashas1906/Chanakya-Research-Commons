"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2, Paperclip, PenLine, Search, X } from "lucide-react";
import { Avatar } from "@/components/ui/Section";
import { TagInput } from "@/components/feed/TagInput";
import { createPost, describeError, isAbort, suggestPapers, type PaperSuggestion } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useSaves } from "@/lib/saves-context";

export interface AttachedPaper {
  paper_id: string;
  canonical_title: string;
}

/** Search the Commons by title, or pick one of your saved papers. */
function PaperPicker({ onPick, onCancel }: { onPick: (paper: AttachedPaper) => void; onCancel: () => void }) {
  const { saves } = useSaves();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PaperSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      suggestPapers(q, controller.signal)
        .then((rows) => { setResults(rows); setError(null); })
        .catch((e) => { if (!isAbort(e)) setError(describeError(e)); })
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  const fromSaves = useMemo(() => {
    const q = term.trim().toLowerCase();
    return saves.filter((p) => !q || p.canonical_title.toLowerCase().includes(q)).slice(0, 5);
  }, [saves, term]);
  const savedIds = new Set(fromSaves.map((p) => p.paper_id));
  const others = results.filter((p) => !savedIds.has(p.paper_id));

  const option = (paper: AttachedPaper, meta: string) => (
    <li key={paper.paper_id}>
      <button
        type="button"
        onClick={() => onPick({ paper_id: paper.paper_id, canonical_title: paper.canonical_title })}
        className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-stone-100"
      >
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
        <span className="min-w-0">
          <span className="block text-meta font-medium leading-snug text-ink">{paper.canonical_title}</span>
          {meta && <span className="block text-label text-stone-500">{meta}</span>}
        </span>
      </button>
    </li>
  );

  return (
    <div className="rounded-xl border border-stone-200 bg-canvas p-2">
      <div className="flex items-center gap-2 px-1">
        <Search className="h-4 w-4 shrink-0 text-stone-400" />
        <input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search papers by title…"
          aria-label="Search papers to attach"
          className="h-9 min-w-0 flex-1 border-0 bg-transparent text-ui text-ink placeholder:text-stone-400 focus:outline-none"
        />
        {loading && <Loader2 className="h-4 w-4 animate-spin text-stone-400" />}
        <button type="button" onClick={onCancel} className="rounded-md p-1 text-stone-500 hover:bg-stone-200" aria-label="Close paper search">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="crc-scroll mt-1 max-h-64 overflow-y-auto">
        {fromSaves.length > 0 && (
          <>
            <p className="px-2.5 pb-1 pt-2 text-label font-semibold uppercase tracking-wide text-stone-500">From your saves</p>
            <ul>{fromSaves.map((p) => option(p, [p.venue, p.publication_year].filter(Boolean).join(" · ")))}</ul>
          </>
        )}
        {others.length > 0 && (
          <>
            <p className="px-2.5 pb-1 pt-2 text-label font-semibold uppercase tracking-wide text-stone-500">In the Commons</p>
            <ul>{others.map((p) => option(p, [p.in_chanakya_library ? "Chanakya library" : "Open literature", p.venue, p.publication_year].filter(Boolean).join(" · ")))}</ul>
          </>
        )}
        {error && <p role="alert" className="px-2.5 py-2 text-meta text-terracotta-600">{error}</p>}
        {!loading && !error && term.trim().length >= 2 && fromSaves.length === 0 && others.length === 0 && (
          <p className="px-2.5 py-3 text-meta text-stone-500">No paper titles match “{term.trim()}”. Papers outside the Commons can be added from the Library first.</p>
        )}
        {term.trim().length < 2 && fromSaves.length === 0 && (
          <p className="px-2.5 py-3 text-meta text-stone-500">Type at least two letters of the title.</p>
        )}
      </div>
    </div>
  );
}

/** Compact "create post" bar that opens into title / body / paper / tags. */
export function Composer({
  onPosted,
  autoOpen = false,
  onOpened,
  attach = null,
  topicSuggestions = [],
}: {
  onPosted: (postId: string) => void;
  autoOpen?: boolean;
  onOpened?: () => void;
  /** Paper to pre-attach (from "Start a discussion" on a paper page). */
  attach?: AttachedPaper | null;
  /** Topics already used on the Commons, offered while typing tags. */
  topicSuggestions?: string[];
}) {
  const { user, promptLogin } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [paper, setPaper] = useState<AttachedPaper | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // `/feed?compose=1` (the top-bar "Create" button) opens the composer straight away.
  useEffect(() => {
    if (!autoOpen) return;
    if (user) setOpen(true);
    onOpened?.();
  }, [autoOpen, user, onOpened]);

  // `/feed?attach=<paper>` opens the composer with that paper already attached.
  useEffect(() => {
    if (!attach || !user) return;
    setPaper(attach);
    setPicking(false);
    setOpen(true);
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [attach, user]);

  const reset = () => {
    setTitle("");
    setBody("");
    setTags([]);
    setPaper(null);
    setPicking(false);
    setErr(null);
    setOpen(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim() || !body.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const created = await createPost({
        author_id: user.user_id,
        title: title.trim(),
        body: body.trim(),
        tags,
        attached_paper_id: paper?.paper_id ?? null,
      });
      reset();
      onPosted(created.post_id);
    } catch (e2) {
      setErr(describeError(e2));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div ref={rootRef} className="card flex items-center gap-3 p-2.5 pl-3">
        <Avatar name={user?.full_name ?? "?"} size={34} />
        <button
          type="button"
          onClick={() => (user ? setOpen(true) : promptLogin("login"))}
          className="flex h-10 min-w-0 flex-1 items-center rounded-full bg-stone-100 px-4 text-left text-ui text-stone-500 transition hover:bg-stone-200/70"
        >
          <span className="truncate">{user ? "Share a finding, a question or a paper worth reading…" : "Log in to start a discussion"}</span>
        </button>
        <button type="button" onClick={() => (user ? setOpen(true) : promptLogin("login"))} className="btn-primary hidden sm:inline-flex" aria-label="Create post">
          <PenLine className="h-4 w-4" /> Post
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef}>
      <form onSubmit={submit} className="card animate-pop space-y-3 p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <Avatar name={user?.full_name ?? "?"} size={28} />
          <p className="text-meta text-stone-600">
            Posting as <span className="font-semibold text-ink">{user?.full_name}</span>
          </p>
        </div>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={250}
          placeholder={paper ? `Your take on “${paper.canonical_title.slice(0, 60)}${paper.canonical_title.length > 60 ? "…" : ""}”` : "An interesting title"}
          aria-label="Post title"
          className="w-full border-0 bg-transparent px-0 font-display text-[22px] leading-snug text-ink placeholder:text-stone-300 focus:outline-none"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="What did you find, or what are you stuck on?"
          aria-label="Post body"
          className="input resize-y leading-relaxed"
        />

        {paper ? (
          <div className="flex min-w-0 items-center gap-2.5 rounded-lg bg-stone-50 px-3 py-2 ring-1 ring-inset ring-stone-200">
            <FileText className="h-4 w-4 shrink-0 text-brand-600" />
            <span className="min-w-0 flex-1">
              <span className="block text-label font-semibold uppercase tracking-wide text-stone-500">Attached paper</span>
              <span className="block truncate text-meta font-medium text-ink">{paper.canonical_title}</span>
            </span>
            <button type="button" onClick={() => setPaper(null)} className="rounded-md p-1 text-stone-500 hover:bg-stone-200" aria-label="Remove attached paper">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : picking ? (
          <PaperPicker onPick={(p) => { setPaper(p); setPicking(false); }} onCancel={() => setPicking(false)} />
        ) : (
          <button type="button" onClick={() => setPicking(true)} className="btn">
            <Paperclip className="h-4 w-4" /> Attach a paper
          </button>
        )}

        <TagInput value={tags} onChange={setTags} suggestions={topicSuggestions} />
        {err && <p role="alert" className="text-meta text-terracotta-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={reset} className="btn">Cancel</button>
          <button type="submit" disabled={!title.trim() || !body.trim() || busy} className="btn-primary">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Publish
          </button>
        </div>
      </form>
    </div>
  );
}
