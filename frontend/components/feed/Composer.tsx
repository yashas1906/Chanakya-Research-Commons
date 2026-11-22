"use client";

import { useState } from "react";
import { Loader2, PenLine } from "lucide-react";
import { Avatar } from "@/components/ui/Section";
import { createPost, describeError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

/** Inline composer: collapsed prompt that opens into title / body / tags. */
export function Composer({ onPosted }: { onPosted: () => void }) {
  const { user, promptLogin } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      <button
        type="button"
        onClick={() => user ? setOpen(true) : promptLogin()}
        className="card card-hover flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <Avatar name={user?.full_name ?? "?"} size={36} />
        <span className="flex-1 text-ui text-stone-500">{user ? "Share a finding, a question or a paper worth reading…" : "Sign in to start a discussion"}</span>
        <PenLine className="h-4 w-4 text-stone-400" strokeWidth={1.5} />
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card animate-rise space-y-3 p-4">
      <div className="flex items-center gap-3">
        <Avatar name={user?.full_name ?? "?"} size={32} />
        <p className="text-ui text-stone-500">
          Posting as <span className="font-medium text-ink">{user?.full_name}</span>
        </p>
      </div>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={250}
        placeholder="Title"
        aria-label="Post title"
        className="w-full border-0 bg-transparent px-0 font-serif text-[22px] leading-snug text-ink placeholder:text-stone-300 focus:outline-none"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="What did you find, or what are you stuck on?"
        aria-label="Post body"
        className="input resize-y text-[14.5px] leading-relaxed"
      />
      <input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="Tags, comma-separated — e.g. data mining, graph neural networks"
        aria-label="Tags"
        className="input text-meta"
      />
      {err && (
        <p role="alert" className="text-meta text-terracotta-600">
          {err}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={reset} className="btn">
          Cancel
        </button>
        <button type="submit" disabled={!title.trim() || !body.trim() || busy} className="btn-primary">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Publish
        </button>
      </div>
    </form>
  );
}
