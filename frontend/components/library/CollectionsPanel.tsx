"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, FolderOpen, Loader2, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import {
  addPaperToCollection,
  createCollection,
  deleteCollection,
  describeError,
  getCollectionPapers,
  getCollections,
  removePaperFromCollection,
  updateCollection,
} from "@/lib/api";
import { authorsLine, cx } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useSaves } from "@/lib/saves-context";
import type { Collection, Paper } from "@/types/crc";

type FormState = { mode: "create" } | { mode: "edit"; collection: Collection } | null;

function CollectionForm({ state, onClose, onDone }: { state: FormState; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state) return;
    setName(state.mode === "edit" ? state.collection.name : "");
    setDescription(state.mode === "edit" ? state.collection.description ?? "" : "");
  }, [state]);

  const submit = async () => {
    if (!state || busy || !name.trim()) return;
    setBusy(true);
    try {
      if (state.mode === "create") {
        await createCollection(name.trim(), description.trim());
        toast("Collection created");
      } else {
        await updateCollection(state.collection.collection_id, { name: name.trim(), description: description.trim() || null });
        toast("Collection updated");
      }
      onDone();
      onClose();
    } catch (error) {
      toast(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!state}
      onClose={() => !busy && onClose()}
      title={state?.mode === "edit" ? "Edit collection" : "New collection"}
      description="Group saved papers by project, course or theme."
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn-primary" onClick={submit} disabled={busy || !name.trim()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {state?.mode === "edit" ? "Save changes" : "Create collection"}
          </button>
        </>
      }
    >
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-4">
        <label className="flex flex-col gap-1.5 text-meta font-semibold text-stone-700">
          Name
          <input className="input font-normal" value={name} maxLength={120} placeholder="e.g. Thesis background" onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 text-meta font-semibold text-stone-700">
          Description <span className="text-label font-normal text-stone-500">Optional</span>
          <textarea className="input min-h-[88px] resize-y font-normal" value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}

function CollectionItem({
  collection,
  onEdit,
  onDelete,
  onChanged,
}: {
  collection: Collection;
  onEdit: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const saves = useSaves();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [adding, setAdding] = useState("");
  const detail = useAsync((signal) => getCollectionPapers(collection.collection_id, signal), [collection.collection_id, collection.paper_count], open);
  const papers = useMemo<Paper[]>(() => detail.data?.papers ?? [], [detail.data]);
  const inCollection = useMemo(() => new Set(papers.map((p) => p.paper_id)), [papers]);
  const addable = saves.saves.filter((p) => !inCollection.has(p.paper_id));

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);

  const remove = async (paperId: string) => {
    try {
      await removePaperFromCollection(collection.collection_id, paperId);
      toast("Removed from collection");
      detail.reload();
      onChanged();
      saves.refresh();
    } catch (error) {
      toast(describeError(error));
    }
  };

  const add = async (paperId: string) => {
    if (!paperId) return;
    setAdding(paperId);
    try {
      await addPaperToCollection(collection.collection_id, paperId);
      toast("Added to collection");
      detail.reload();
      onChanged();
      saves.refresh();
    } catch (error) {
      toast(describeError(error));
    } finally {
      setAdding("");
    }
  };

  return (
    <li className="group">
      <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><FolderOpen className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-h3 text-ink">{collection.name}</span>
            <span className="mt-0.5 block text-meta text-stone-500">
              <span className="num">{collection.paper_count ?? 0}</span> {(collection.paper_count ?? 0) === 1 ? "paper" : "papers"}
              {collection.description ? ` · ${collection.description}` : ""}
            </span>
          </span>
          <ChevronDown className={cx("mt-2 h-4 w-4 shrink-0 text-stone-400 transition-transform", open && "rotate-180")} />
        </button>
        <div className="relative shrink-0">
          <button type="button" aria-label={`Options for ${collection.name}`} onClick={(event) => { event.stopPropagation(); setMenu((v) => !v); }} className="flex h-9 w-9 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-ink">
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 top-10 z-20 w-44 animate-pop overflow-hidden rounded-xl border border-stone-200 bg-paper py-1 shadow-pop">
              <button type="button" role="menuitem" onClick={onEdit} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-ui text-stone-700 hover:bg-stone-100"><Pencil className="h-4 w-4" /> Edit details</button>
              <button type="button" role="menuitem" onClick={onDelete} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-ui text-terracotta-700 hover:bg-terracotta-50"><Trash2 className="h-4 w-4" /> Delete collection</button>
            </div>
          )}
        </div>
      </div>
      {open && (
        <div className="animate-fade border-t border-stone-100 bg-stone-50/60 px-4 py-4 sm:px-5">
          {detail.loading && !detail.data ? (
            <SkeletonList rows={2} />
          ) : detail.error ? (
            <ErrorState compact error={detail.error} onRetry={detail.reload} />
          ) : papers.length === 0 ? (
            <p className="text-meta text-stone-500">No papers here yet. Add one from your saved papers below, or use “Save to library” on any paper page.</p>
          ) : (
            <ul className="divide-y divide-stone-200/70">
              {papers.map((paper) => (
                <li key={paper.paper_id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/papers/${paper.paper_id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">{paper.canonical_title}</Link>
                    <p className="truncate text-label text-stone-500">{[authorsLine(paper.authors, 2), paper.venue, paper.publication_year].filter(Boolean).join(" · ")}</p>
                  </div>
                  <button type="button" onClick={() => remove(paper.paper_id)} aria-label={`Remove ${paper.canonical_title} from collection`} className="mt-0.5 shrink-0 rounded-full p-1.5 text-stone-400 hover:bg-stone-200 hover:text-ink"><X className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              aria-label="Add a saved paper to this collection"
              value={adding}
              disabled={!!adding || addable.length === 0}
              onChange={(event) => void add(event.target.value)}
              className="min-h-9 max-w-full rounded-lg border border-stone-300 bg-paper px-3 text-meta text-stone-700 disabled:opacity-60"
            >
              <option value="">{addable.length === 0 ? "No other saved papers to add" : "Add a saved paper…"}</option>
              {addable.map((paper) => <option key={paper.paper_id} value={paper.paper_id}>{paper.canonical_title.slice(0, 80)}</option>)}
            </select>
            {adding && <Loader2 className="h-4 w-4 animate-spin text-stone-500" />}
          </div>
        </div>
      )}
    </li>
  );
}

export function CollectionsPanel() {
  const { user, status: authStatus, promptLogin } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(null);
  const [toDelete, setToDelete] = useState<Collection | null>(null);
  const [deleting, setDeleting] = useState(false);
  const userId = user?.user_id ?? null;
  const collections = useAsync((signal) => getCollections(userId!, signal), [userId], authStatus === "authenticated" && !!userId);
  const reload = collections.reload;
  const list = collections.data ?? [];

  const confirmDelete = useCallback(async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteCollection(toDelete.collection_id);
      toast("Collection deleted. Its papers stay in your library.");
      setToDelete(null);
      reload();
    } catch (error) {
      toast(describeError(error));
    } finally {
      setDeleting(false);
    }
  }, [toDelete, toast, reload]);

  if (authStatus !== "authenticated") {
    return <EmptyState className="py-12" title="Log in to manage collections" hint="Collections group the papers you save." action={<button type="button" className="btn-primary" onClick={() => promptLogin("login")}>Log in</button>} />;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 sm:px-5">
        <p className="text-meta text-stone-500">Organise saved papers into named groups. They also appear on your profile.</p>
        <button type="button" className="btn-primary" onClick={() => setForm({ mode: "create" })}><Plus className="h-4 w-4" /> New collection</button>
      </div>
      {collections.loading && !collections.data ? (
        <SkeletonList rows={3} />
      ) : collections.error ? (
        <ErrorState error={collections.error} onRetry={reload} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-6 w-6" />}
          title="No collections yet"
          hint="Create one, then add papers from your saves or choose it when you save a paper."
          action={<button type="button" className="btn-primary" onClick={() => setForm({ mode: "create" })}><Plus className="h-4 w-4" /> Create your first collection</button>}
        />
      ) : (
        <ul className="divide-y divide-stone-100">
          {list.map((collection) => (
            <CollectionItem
              key={collection.collection_id}
              collection={collection}
              onChanged={reload}
              onEdit={() => setForm({ mode: "edit", collection })}
              onDelete={() => setToDelete(collection)}
            />
          ))}
        </ul>
      )}

      <CollectionForm state={form} onClose={() => setForm(null)} onDone={reload} />
      <Dialog
        open={!!toDelete}
        onClose={() => !deleting && setToDelete(null)}
        title="Delete this collection?"
        description="The papers stay saved in your library; only the grouping is removed."
        footer={
          <>
            <button type="button" className="btn" onClick={() => setToDelete(null)} disabled={deleting}>Keep it</button>
            <button type="button" onClick={confirmDelete} disabled={deleting} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-terracotta-600 bg-terracotta-600 px-4 text-ui font-semibold text-white transition hover:bg-terracotta-700 disabled:opacity-50">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
            </button>
          </>
        }
      >
        <p className="text-ui text-stone-700">“{toDelete?.name}”</p>
      </Dialog>
    </div>
  );
}
