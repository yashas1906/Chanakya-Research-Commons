"use client";

import Link from "next/link";
import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { SkeletonList } from "@/components/ui/Skeleton";
import { getCollectionPapers, getUserCollections } from "@/lib/api";
import { authorsLine } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import type { Collection } from "@/types/crc";

function CollectionPreview({ collection, onClose }: { collection: Collection | null; onClose: () => void }) {
  const detail = useAsync((signal) => getCollectionPapers(collection!.collection_id, signal), [collection?.collection_id], !!collection);
  return (
    <Dialog open={!!collection} onClose={onClose} title={collection?.name ?? ""} description={collection?.description ?? undefined} wide>
      {detail.loading && !detail.data ? (
        <SkeletonList rows={3} />
      ) : detail.error ? (
        <ErrorState compact error={detail.error} onRetry={detail.reload} />
      ) : (detail.data?.papers.length ?? 0) === 0 ? (
        <p className="text-meta text-stone-500">No papers in this collection yet.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {detail.data!.papers.map((paper) => (
            <li key={paper.paper_id} className="py-3">
              <Link href={`/papers/${paper.paper_id}`} className="font-display text-h3 leading-snug text-ink hover:underline">{paper.canonical_title}</Link>
              <p className="mt-0.5 text-meta text-stone-500">{[authorsLine(paper.authors, 3), paper.venue, paper.publication_year].filter(Boolean).join(" · ")}</p>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/** A member's collections on their profile. Owners get a shortcut to manage them in the library. */
export function ProfileCollections({ userId, isSelf, name }: { userId: string; isSelf: boolean; name: string }) {
  const collections = useAsync((signal) => getUserCollections(userId, signal), [userId]);
  const [open, setOpen] = useState<Collection | null>(null);
  const list = collections.data ?? [];

  if (collections.loading && !collections.data) return <div className="card"><SkeletonList rows={3} /></div>;
  if (collections.error) return <div className="card"><ErrorState error={collections.error} onRetry={collections.reload} /></div>;
  if (list.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={<FolderOpen className="h-6 w-6" />}
          title="No collections yet"
          hint={isSelf ? "Group the papers you save into named collections." : `${name} hasn’t created any collections.`}
          action={isSelf ? <Link href="/library?tab=collections" className="btn-primary">Create a collection</Link> : undefined}
        />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {isSelf && <div className="flex justify-end"><Link href="/library?tab=collections" className="btn">Manage collections</Link></div>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {list.map((collection) => (
          <li key={collection.collection_id}>
            <button type="button" onClick={() => setOpen(collection)} className="card card-hover flex h-full w-full flex-col p-4 text-left">
              <span className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><FolderOpen className="h-5 w-5" /></span>
                <span className="min-w-0">
                  <span className="block truncate font-display text-h3 text-ink">{collection.name}</span>
                  <span className="block text-label text-stone-500"><span className="num">{collection.paper_count ?? 0}</span> {(collection.paper_count ?? 0) === 1 ? "paper" : "papers"}</span>
                </span>
              </span>
              {collection.description && <span className="mt-2 line-clamp-2 text-meta text-stone-600">{collection.description}</span>}
              {(collection.sample_titles?.length ?? 0) > 0 && (
                <ul className="mt-3 space-y-1 border-t border-stone-100 pt-2.5">
                  {collection.sample_titles!.map((title) => <li key={title} className="truncate text-label text-stone-500">• {title}</li>)}
                </ul>
              )}
            </button>
          </li>
        ))}
      </ul>
      <CollectionPreview collection={open} onClose={() => setOpen(null)} />
    </div>
  );
}
