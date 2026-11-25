"use client";

import { useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { deleteComment, describeError, updateComment } from "@/lib/api";

/** Inline editor for one of your own comments. */
export function CommentEditor({
  commentId,
  initial,
  onSaved,
  onCancel,
}: {
  commentId: string;
  initial: string;
  onSaved: (body: string, editedAt: string | null) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unchanged = body.trim() === initial.trim();

  const save = async () => {
    if (!body.trim() || busy) return;
    if (unchanged) {
      onCancel();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await updateComment(commentId, body.trim());
      toast("Comment updated");
      onSaved(saved.body, saved.edited_at);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1 space-y-2">
      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
        }}
        rows={3}
        maxLength={5000}
        aria-label="Edit your comment"
        className="input resize-y leading-relaxed"
      />
      {error && <p role="alert" className="text-meta text-terracotta-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn h-9" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="btn-primary h-9" onClick={save} disabled={busy || !body.trim()}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </button>
      </div>
    </div>
  );
}

/** Edit and Delete buttons for a comment you wrote. Delete asks first. */
export function CommentOwnerActions({ commentId, hasReplies, onEdit, onDeleted }: { commentId: string; /** Unknown (e.g. on a profile) when left out. */ hasReplies?: boolean; onEdit: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteComment(commentId);
      toast("Comment deleted");
      setConfirming(false);
      onDeleted();
    } catch (e) {
      toast(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const action = "inline-flex items-center gap-1 text-meta font-medium text-stone-600 hover:text-ink";
  return (
    <>
      <button type="button" onClick={onEdit} className={action}><Pencil className="h-3.5 w-3.5" /> Edit</button>
      <button type="button" onClick={() => setConfirming(true)} className={`${action} hover:text-terracotta-600`}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
      <Dialog
        open={confirming}
        onClose={() => !busy && setConfirming(false)}
        title="Delete this comment?"
        description={
          hasReplies === undefined
            ? "It will be removed from the discussion for everyone. If people replied to it, their replies stay under a “This comment was deleted” note. This can’t be undone."
            : hasReplies
              ? "Its text and your name will be removed. The replies stay, under a “This comment was deleted” note. This can’t be undone."
              : "It will be removed from the discussion for everyone. This can’t be undone."
        }
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
            <button type="button" className="btn-primary bg-terracotta-600 hover:bg-terracotta-700" onClick={remove} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Delete comment
            </button>
          </div>
        }
      />
    </>
  );
}
