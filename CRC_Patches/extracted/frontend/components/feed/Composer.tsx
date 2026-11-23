"use client";

import { useEffect, useState } from "react";
import { Loader2, PenLine } from "lucide-react";
import { Avatar } from "@/components/ui/Section";
import { createPost, describeError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

/** Compact "create post" bar that opens into title / body / tags. */
export function Composer({ onPosted, autoOpen = false, onOpened }: { onPosted: () => void; autoOpen?: boolean; onOpened?: () => void }) {
  const { user, promptLogin } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // `/feed?compose=1` (the top-bar "Create" button) opens the composer straight away.
  useEffect(() => {
    if (!autoOpen) return;
    if (user) setOpen(true);
    onOpened?.();
  }, [autoOpen, user, onOpened]);

  const reset = () => {
    setTitle("");
    setBody("");
    setTags("");
    setErr(null);
    setOpen(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim() || !body.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await createPost({
        author_id: user.user_id,
        title: title.trim(),
        body: body.trim(),
        tags: tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      });
      reset();
      onPosted();
    } catch (e2) {
      setErr(describeError(e2));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="card flex items-center gap-3 p-2.5 pl-3">
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
        placeholder="An interesting title"
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
      <input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="Topics, comma-separated: data mining, graph neural networks"
        aria-label="Topics"
        className="input"
      />
      {err && <p role="alert" className="text-meta text-terracotta-600">{err}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={reset} className="btn">Cancel</button>
        <button type="submit" disabled={!title.trim() || !body.trim() || busy} className="btn-primary">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Publish
        </button>
      </div>
    </form>
  );
}
