import Link from "next/link";
import { MessageSquare, Users } from "lucide-react";
import { PanelHeading } from "@/components/paper/PanelHeading";
import { EmptyState } from "@/components/ui/States";
import { fmtInt, relTime } from "@/lib/format";
import type { PaperDetail } from "@/types/crc";

export function LinkedDiscussions({ paper }: { paper: PaperDetail }) {
  const start = `/feed?attach=${paper.paper_id}`;
  return (
    <section className="card flex h-full min-w-0 flex-col" aria-label="Discussions about this paper">
      <PanelHeading
        eyebrow="Campus community"
        title="Discussions"
        icon={Users}
        count={paper.related_posts.length}
        action={paper.related_posts.length > 0 ? <Link href={start} className="shrink-0 text-meta font-semibold text-brand-600 hover:underline">Start one</Link> : undefined}
      />
      <div className="crc-scroll max-h-[26rem] flex-1 overflow-y-auto px-5">
        {paper.related_posts.length === 0 ? (
          <EmptyState className="py-8" title="No discussions yet" hint="Be the first to talk about this work." action={<Link href={start} className="btn">Start a discussion</Link>} />
        ) : (
          <ul className="divide-y divide-stone-100">
            {paper.related_posts.map((post) => (
              <li key={post.post_id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link href={`/feed/${post.post_id}`} className="line-clamp-2 text-ui font-medium leading-snug text-ink hover:underline">{post.title}</Link>
                  <p className="mt-1 text-label text-stone-500">{post.author_name} · {relTime(post.created_at)}</p>
                </div>
                <span className="num mt-0.5 inline-flex shrink-0 items-center gap-1 text-label text-stone-500"><MessageSquare className="h-3.5 w-3.5" />{fmtInt(post.comment_count)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
