"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import { describeError, getCollections, saveByIdentifier, type SaveByIdentifierResult } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useSaves } from "@/lib/saves-context";

const EXAMPLES = ["10.1038/nature14539", "arXiv:1706.03762", "https://arxiv.org/abs/1810.04805", "https://… (any article page)"];

/** Save a paper or article by DOI, arXiv ID or web link (F3). */
export function AddByIdentifierDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { refresh } = useSaves();
  const toast = useToast();
  const collections = useAsync((signal) => getCollections(user!.user_id, signal), [user?.user_id, open], !!user && open);
  const [identifier, setIdentifier] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SaveByIdentifierResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setIdentifier("");
    setNotes("");
    setError(null);
    setResult(null);
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!identifier.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const saved = await saveByIdentifier(identifier.trim(), collectionId || null, notes.trim());
      setResult(saved);
      refresh();
      toast(saved.created ? "Added to the corpus and saved" : "Saved to your library");
      setIdentifier("");
      setNotes("");
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add by DOI, arXiv ID or link"
      description="We look it up in the Chanakya library first, then in Crossref, arXiv or the page itself."
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>{result ? "Done" : "Cancel"}</button>
          <button type="submit" form="add-by-identifier" className="btn-primary" disabled={busy || !identifier.trim()}>
            {busy ? "Looking it up…" : "Save"}
          </button>
        </div>
      }
    >
      <form id="add-by-identifier" onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-meta font-semibold text-stone-700">DOI, arXiv ID or web link</span>
          <input
            className="input"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="10.1038/nature14539"
            autoComplete="off"
            spellCheck={false}
            maxLength={500}
            required
          />
          <span className="mt-1.5 block text-label text-stone-500">e.g. {EXAMPLES.join(" · ")}</span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-meta font-semibold text-stone-700">Collection (optional)</span>
          <select className="input" value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
            <option value="">No collection</option>
            {(collections.data ?? []).map((c) => <option key={c.collection_id} value={c.collection_id}>{c.name}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-meta font-semibold text-stone-700">Private note (optional)</span>
          <textarea className="input min-h-16 resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} placeholder="Only you can see this" />
        </label>

        {error && <p role="alert" className="rounded-lg bg-terracotta-50 px-3 py-2 text-meta text-terracotta-700">{error}</p>}
        {result && (
          <p role="status" className="rounded-lg bg-sage-50 px-3 py-2 text-meta text-sage-700">
            {result.created ? "New to the Commons and saved: " : "Already in the Commons, now in your library: "}
            <Link href={`/papers/${result.paper.paper_id}`} className="font-semibold underline underline-offset-2" onClick={onClose}>
              {result.paper.canonical_title}
            </Link>
          </p>
        )}
      </form>
    </Dialog>
  );
}
