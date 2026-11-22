"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { PostActionBar } from "@/components/feed/PostActionBar";
import { Avatar } from "@/components/ui/Section";
import { Tag } from "@/components/ui/Pill";
import { useAuth } from "@/context/AuthContext";
import { describeError, votePost } from "@/lib/api";
import { relTime, shortSchool } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import type { FeedPost } from "@/types/crc";

export function PostCard({ post, onTagClick }: { post: FeedPost; onTagClick?: (tag: string) => void }) {
  const { user, promptLogin } = useAuth();
  const toast = useToast();
  const [score, setScore] = useState(post.upvote_count);
  const [vote, setVote] = useState<-1 | 0 | 1>(post.my_vote);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setScore(post.upvote_count);
    setVote(post.my_vote);
  }, [post.upvote_count, post.my_vote]);

  const updateVote = async (next: -1 | 0 | 1) => {
    if (!user) {
      promptLogin();
      return;
    }
    if (busy) return;
    const oldVote = vote;
    const oldScore = score;
    setVote(next);
    setScore(oldScore + next - oldVote);
    setBusy(true);
    try {
      const result = await votePost(post.post_id, next);
      setVote(result.my_vote);
      setScore(result.upvote_count);
    } catch (error) {
      setVote(oldVote);
      setScore(oldScore);
      toast(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card card-hover relative min-w-0 overflow-hidden p-5 sm:p-6">
      <header className="relative z-10 flex min-w-0 items-center gap-3">
        <Avatar name={post.author_name} size={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-ui font-medium text-ink">{post.author_name}</p>
          <p className="truncate text-meta text-stone-500">{shortSchool(post.author_dept)} · <span className="capitalize">{post.author_role}</span> · {relTime(post.created_at)}</p>
        </div>
      </header>
      {post.tags?.[0] && <button type="button" onClick={() => onTagClick?.(post.tags?.[0] ?? "")} className="relative z-10 mt-4"><Tag>{post.tags[0]}</Tag></button>}
      <h2 className="mt-2 font-serif text-h3 text-ink">
        <Link href={`/feed/${post.post_id}`} className="after:absolute after:inset-0 after:z-0">{post.title}</Link>
      </h2>
      <p className="mt-2 line-clamp-3 whitespace-pre-line text-body leading-relaxed text-stone-700">{post.body}</p>
      {post.attached_paper_id && post.attached_paper_title && (
        <Link href={`/papers/${post.attached_paper_id}`} className="relative z-10 mt-4 flex min-w-0 items-center gap-2.5 rounded-xl border border-stone-200 bg-sunken p-3 hover:border-stone-300">
          <FileText className="h-4 w-4 shrink-0 text-stone-500" />
          <span className="min-w-0 truncate font-serif text-ui text-ink">{post.attached_paper_title}</span>
          <span className="shrink-0 text-meta text-stone-500">View paper →</span>
        </Link>
      )}
      <footer className="relative z-10 mt-5 border-t border-stone-100 pt-4">
        <PostActionBar post={post} score={score} vote={vote} busy={busy} onVote={updateVote} />
      </footer>
      {post.tags && post.tags.length > 1 && <div className="relative z-10 mt-3 flex flex-wrap gap-1.5">{post.tags.slice(1).map((tag) => <button key={tag} type="button" onClick={() => onTagClick?.(tag)}><Tag>{tag}</Tag></button>)}</div>}
    </article>
  );
}
