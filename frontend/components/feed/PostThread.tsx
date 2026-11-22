"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import { CommentThread } from "@/components/feed/CommentThread";
import { PostActionBar } from "@/components/feed/PostActionBar";
import { Avatar, Panel } from "@/components/ui/Section";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { Tag } from "@/components/ui/Pill";
import { PrestigeTier } from "@/components/ui/PrestigeTier";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/AuthContext";
import { describeError, getFeed, getPost, votePost } from "@/lib/api";
import { authorsLine, relTime, shortSchool } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useToast } from "@/components/ui/Toast";
import type { FeedPost } from "@/types/crc";

export function PostThread({ postId }: { postId: string }) {
  const { user, promptLogin } = useAuth();
  const toast = useToast();
  const { data: post, error, loading, reload } = useAsync((signal) => getPost(postId, signal), [postId]);
  const topic = post?.tags?.[0] ?? null;
  const more = useAsync((signal) => getFeed(user?.user_id ?? null, signal, "new"), [topic, user?.user_id], !!topic);
  const [score, setScore] = useState(0);
  const [vote, setVote] = useState<-1 | 0 | 1>(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!post) return;
    setScore(post.upvote_count);
    setVote(post.my_vote);
    document.title = `${post.title} · Chanakya Research Commons`;
  }, [post]);

  const updateVote = async (value: -1 | 0 | 1) => {
    if (!user) {
      promptLogin();
      return;
    }
    if (!post || busy) return;
    const oldScore = score;
    const oldVote = vote;
    setScore(oldScore + value - oldVote);
    setVote(value);
    setBusy(true);
    try {
      const result = await votePost(post.post_id, value);
      setScore(result.upvote_count);
      setVote(result.my_vote);
    } catch (reason) {
      setScore(oldScore);
      setVote(oldVote);
      toast(describeError(reason));
    } finally {
      setBusy(false);
    }
  };

  if (loading && !post) return <div className="space-y-5"><SkeletonCard rows={5} /><SkeletonCard rows={3} /></div>;
  if (error || !post) {
    if (error instanceof Error && "status" in error && error.status === 404) return <EmptyState title="This discussion doesn’t exist or was removed" action={<Link className="btn" href="/feed">Back to the feed</Link>} />;
    return <div className="card"><ErrorState error={error ?? "Discussion unavailable"} onRetry={reload} /></div>;
  }

  const morePosts = (more.data ?? []).filter((item) => item.post_id !== post.post_id && item.tags?.includes(topic ?? "")).slice(0, 5);
  const actionPost: FeedPost = post;

  return (
    <div className="space-y-6">
      <Link href="/feed" className="inline-flex items-center gap-2 text-ui font-medium text-stone-600 hover:text-ink"><ArrowLeft className="h-4 w-4" />Feed</Link>
      <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0 space-y-6">
          <article className="card min-w-0 p-5 sm:p-8">
            <header className="flex items-center gap-3">
              <Avatar name={post.author.full_name} size={40} />
              <div className="min-w-0"><p className="truncate text-ui font-medium text-ink">{post.author.full_name}</p><p className="text-meta text-stone-500">{shortSchool(post.author.department)} · {relTime(post.created_at)}</p></div>
              <RoleBadge role={post.author.role} />
            </header>
            {post.tags && post.tags.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{post.tags.map((tag) => <Link key={tag} href={`/search?q=${encodeURIComponent(tag)}`}><Tag>{tag}</Tag></Link>)}</div>}
            <h1 className="mt-4 font-serif text-h1 tracking-tight text-ink">{post.title}</h1>
            <p className="mt-5 whitespace-pre-wrap text-body leading-7 text-stone-700">{post.body}</p>
            <div className="mt-6 border-t border-stone-100 pt-4"><PostActionBar post={actionPost} score={score} vote={vote} busy={busy} onVote={updateVote} /></div>
          </article>
          {post.attached_paper && <section className="card p-5 sm:p-6">
            <p className="eyebrow">Linked paper</p>
            <div className="mt-3 flex items-start gap-3"><FileText className="mt-1 h-5 w-5 shrink-0 text-stone-500" /><div className="min-w-0 flex-1">
              <Link href={`/papers/${post.attached_paper.paper_id}`} className="font-serif text-h3 text-ink hover:underline">{post.attached_paper.canonical_title}</Link>
              <p className="mt-1 text-meta text-stone-500">{[authorsLine(post.attached_paper.authors, 3), post.attached_paper.venue, post.attached_paper.publication_year].filter(Boolean).join(" · ")}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3"><PrestigeTier percentile={post.attached_paper.pagerank_percentile} compact /><Link href={`/papers/${post.attached_paper.paper_id}`} className="text-meta font-medium text-stone-600 hover:text-ink">View paper →</Link><Link href={`/assistant?paper=${post.attached_paper.paper_id}&q=${encodeURIComponent("Summarize this paper’s main contribution")}`} className="text-meta font-medium text-stone-600 hover:text-ink">Ask the assistant →</Link></div>
            </div></div>
          </section>}
          <CommentThread postId={postId} />
        </main>
        <aside className="min-w-0 space-y-5">
          <Panel eyebrow="Author" title="About the researcher">
            <div className="space-y-3 p-4"><div className="flex items-center gap-3"><Avatar name={post.author.full_name} size={42} /><div className="min-w-0"><p className="font-medium text-ink">{post.author.full_name}</p><RoleBadge role={post.author.role} /></div></div><p className="text-meta text-stone-600">{shortSchool(post.author.department)} · {post.author.post_count} posts</p>{post.author.bio && <p className="text-body leading-relaxed text-stone-600">{post.author.bio}</p>}{post.author.interest_tags && <div className="flex flex-wrap gap-2">{post.author.interest_tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</div>}</div>
          </Panel>
          {topic && <Panel eyebrow="More in this topic" title={topic}>
            {more.loading && !more.data ? <SkeletonCard rows={3} className="border-0" />
              : more.error ? <ErrorState compact error={more.error} onRetry={more.reload} />
                : morePosts.length ? <ul className="divide-y divide-stone-100">{morePosts.map((item) => <li key={item.post_id} className="p-4"><Link href={`/feed/${item.post_id}`} className="font-serif text-ui text-ink hover:underline">{item.title}</Link><p className="mt-1 text-meta text-stone-500">{item.author_name} · {relTime(item.created_at)}</p></li>)}</ul>
                  : <EmptyState title="No related discussions" />}
          </Panel>}
        </aside>
      </div>
    </div>
  );
}
