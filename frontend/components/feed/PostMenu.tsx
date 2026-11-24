"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { deletePost, describeError, updatePost } from "@/lib/api";
import type { FeedPost } from "@/types/crc";

export interface PostEdit {
  title: string;
  body: string;
  tags: string[];
  edited_at: string | null;
}

/**
 * "⋯" menu shown to the author (and to admins, for deletion only).
 * Edit opens a dialog; delete asks for confirmation. Both report back through callbacks.
 */
export function PostMenu({
  post,
  canEdit,
  canDelete,
  onEdited,
  onDeleted,
}: {
  post: Pick<FeedPost, "post_id" | "title" | "body" | "tags">;
  canEdit: boolean;
  canDelete: boolean;
  onEdited: (next: PostEdit) => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [tags, setTags] = useState((post.tags ?? []).join(", "));
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOpen(false);
        return;
      }
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!canEdit && !canDelete) return null;

  const startEdit = () => {
    setTitle(post.title);
    setBody(post.body);
    setTags((post.tags ?? []).join(", "));
    setOpen(false);
    setEditing(true);
  };

  const parsedTags = tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 6);
  const unchanged = title.trim() === post.title && body.trim() === post.body && parsedTags.join("|") === (post.tags ?? []).join("|");

  const save = async () => {
    if (busy || !title.trim() || !body.trim()) return;
    if (unchanged) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      const result = await updatePost(post.post_id, { title: title.trim(), body: body.trim(), tags: parsedTags });
      onEdited(result);
      setEditing(false);
      toast("Post updated");
    } catch (error) {
      toast(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deletePost(post.post_id);
      setConfirming(false);
      toast("Post deleted");
      onDeleted();
    } catch (error) {
      toast(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={root} className="relative z-20 shrink-0">
      <button
        type="button"
        aria-label="Post options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-ink"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-9 w-44 animate-pop overflow-hidden rounded-xl border border-stone-200 bg-paper py-1 shadow-pop">
          {canEdit && (
            <button type="button" role="menuitem" onClick={startEdit} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-ui text-stone-700 hover:bg-stone-100">
              <Pencil className="h-4 w-4" /> Edit post
            </button>
          )}
          {canDelete && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); setConfirming(true); }} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-ui text-terracotta-700 hover:bg-terracotta-50">
              <Trash2 className="h-4 w-4" /> Delete post
            </button>
          )}
        </div>
      )}

      <Dialog
        open={editing}
        onClose={() => !busy && setEditing(false)}
        title="Edit post"
        description="Your changes are marked as “edited” for readers."
        wide
        footer={
          <>
            <button type="button" className="btn" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
            <button type="button" className="btn-primary" onClick={save} disabled={busy || !title.trim() || !body.trim() || unchanged}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="flex flex-col gap-1.5 text-meta font-semibold text-stone-700">
            Title
            <input className="input font-normal" value={title} maxLength={250} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-meta font-semibold text-stone-700">
            Body
            <textarea className="input min-h-[180px] resize-y font-normal leading-relaxed" value={body} onChange={(event) => setBody(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-meta font-semibold text-stone-700">
            Tags <span className="text-label font-normal text-stone-500">Comma-separated, up to 6</span>
            <input className="input font-normal" value={tags} onChange={(event) => setTags(event.target.value)} />
          </label>
        </div>
      </Dialog>

      <Dialog
        open={confirming}
        onClose={() => !busy && setConfirming(false)}
        title="Delete this post?"
        description="The post, its comments and its votes will be removed permanently."
        footer={
          <>
            <button type="button" className="btn" onClick={() => setConfirming(false)} disabled={busy}>Keep post</button>
            <button type="button" onClick={remove} disabled={busy} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-terracotta-600 bg-terracotta-600 px-4 text-ui font-semibold text-white transition hover:bg-terracotta-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
            </button>
          </>
        }
      >
        <p className="text-ui text-stone-700">“{post.title}”</p>
      </Dialog>
    </div>
  );
}

export function EditedMark({ editedAt }: { editedAt?: string | null }) {
  if (!editedAt) return null;
  const date = new Date(editedAt);
  const title = Number.isNaN(date.getTime()) ? "Edited" : `Edited ${date.toLocaleString()}`;
  return (
    <span title={title} className="italic text-stone-400">
      <span className="mx-1.5 not-italic text-stone-300">•</span>edited
    </span>
  );
}
