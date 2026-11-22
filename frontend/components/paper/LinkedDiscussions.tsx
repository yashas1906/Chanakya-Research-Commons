import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/States";
import { fmtInt, relTime } from "@/lib/format";
import type { PaperDetail } from "@/types/crc";

export function LinkedDiscussions({ paper }: { paper: PaperDetail }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow">Campus community</p><h2 className="mt-1 font-serif text-h2 text-ink">Discussions about this paper</h2></div>
        <Link href={`/feed?attach=${paper.paper_id}`} className="text-meta font-medium text-stone-600 hover:text-ink">Start a discussion</Link>
      </div>
      {paper.related_posts.length === 0 ? <EmptyState title="No discussions yet" hint="Start a conversation around this work." />
        : <ul className="mt-4 divide-y divide-stone-100">{paper.related_posts.map((post) => <li key={post.post_id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><Link href={`/feed/${post.post_id}`} className="font-serif text-h3 text-ink hover:underline">{post.title}</Link><p className="mt-1 text-meta text-stone-500">{post.author_name} · {relTime(post.created_at)}</p></div><span className="num inline-flex items-center gap-1 text-meta text-stone-500"><MessageSquare className="h-4 w-4" />{fmtInt(post.comment_count)}</span></li>)}</ul>}
    </section>
  );
}
