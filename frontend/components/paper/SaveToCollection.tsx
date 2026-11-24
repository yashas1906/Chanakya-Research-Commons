"use client";

import Link from "next/link";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSaves } from "@/lib/saves-context";
import { useToast } from "@/components/ui/Toast";
import { describeError, getCollections } from "@/lib/api";
import { useAsync } from "@/lib/hooks";

export function SaveToCollection({ paperId, isSaved }: { paperId: string; isSaved: boolean }) {
  const { user, promptLogin } = useAuth();
  const { savedIds, save, remove } = useSaves();
  const toast = useToast();
  const collections = useAsync((signal) => getCollections(user!.user_id, signal), [user?.user_id], !!user);
  const [collectionId, setCollectionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedLocally, setSavedLocally] = useState(isSaved);
  const saved = savedIds.has(paperId) || savedLocally;

  const toggle = async () => {
    if (!user) {
      promptLogin();
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      if (saved) {
        await remove(paperId);
        setSavedLocally(false);
        toast("Removed from your library");
      } else {
        await save(paperId, "", collectionId || null);
        setSavedLocally(true);
        toast("Saved to your library");
      }
    } catch (error) {
      toast(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {user && !saved && <select aria-label="Choose a collection" value={collectionId} onChange={(event) => setCollectionId(event.target.value)} className="min-h-10 rounded-lg border border-stone-200 bg-paper px-3 text-ui text-stone-700">
        <option value="">No collection</option>
        {(collections.data ?? []).map((collection) => <option key={collection.collection_id} value={collection.collection_id}>{collection.name}</option>)}
      </select>}
      <button type="button" onClick={toggle} disabled={busy} aria-pressed={saved} className="btn-primary">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        {saved ? "Saved" : "Save to library"}
      </button>
      {user && !saved && collections.data && collections.data.length === 0 && <Link href="/library?tab=collections" className="text-meta font-medium text-brand-700 hover:underline">Create a collection</Link>}
      {collections.error !== null && <span role="alert" className="text-meta text-stone-500">Collections unavailable; you can still save without one.</span>}
    </div>
  );
}
