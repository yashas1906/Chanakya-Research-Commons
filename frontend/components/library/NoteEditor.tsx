"use client";

import { useEffect, useState } from "react";
import { Lock, NotebookPen } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { describeError, updateSaveNotes } from "@/lib/api";
import { cx } from "@/lib/format";

/** Private note on a saved paper (F3). Only the member who saved it can see it. */
export function NoteEditor({
  paperId,
  initial,
  onSaved,
  className,
  startOpen = false,
}: {
  paperId: string;
  initial: string | null;
  onSaved?: (note: string | null) => void;
  className?: string;
  startOpen?: boolean;
}) {
  const toast = useToast();
  const [note, setNote] = useState(initial ?? "");
  const [draft, setDraft] = useState(initial ?? "");
  const [editing, setEditing] = useState(startOpen);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNote(initial ?? "");
    setDraft(initial ?? "");
  }, [initial]);

  const save = async () => {
    setBusy(true);
    try {
      const saved = await updateSaveNotes(paperId, draft.trim());
      setNote(saved ?? "");
      setEditing(false);
      onSaved?.(saved);
      toast(saved ? "Note saved" : "Note removed");
    } catch (error) {
      toast(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return note ? (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cx("group block w-full border-l-2 border-brand-200 pl-3 text-left text-meta italic text-stone-600 hover:border-brand-500", className)}
        title="Edit your private note"
      >
        {note}
        <span className="ml-2 not-italic text-label font-semibold text-brand-600 opacity-0 transition group-hover:opacity-100">Edit</span>
      </button>
    ) : (
      <button type="button" onClick={() => setEditing(true)} className={cx("inline-flex items-center gap-1.5 text-meta font-medium text-stone-500 hover:text-brand-600", className)}>
        <NotebookPen className="h-4 w-4" /> Add a private note
      </button>
    );
  }

  return (
    <div className={cx("space-y-2", className)}>
      <textarea
        className="input min-h-20 resize-y text-meta"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={5000}
        placeholder="Why it matters, what to read next, how it connects to your work…"
        aria-label="Private note"
        autoFocus
      />
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-label text-stone-500"><Lock className="h-3 w-3" /> Only you can see this</span>
        <span className="flex gap-2">
          <button type="button" className="btn-ghost min-h-8 px-2.5 text-meta" onClick={() => { setDraft(note); setEditing(false); }} disabled={busy}>Cancel</button>
          <button type="button" className="btn-primary min-h-8 px-3 text-meta" onClick={save} disabled={busy || draft.trim() === note.trim()}>
            {busy ? "Saving…" : "Save note"}
          </button>
        </span>
      </div>
    </div>
  );
}
