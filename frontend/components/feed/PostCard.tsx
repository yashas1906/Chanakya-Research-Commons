"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { PostActionBar } from "@/components/feed/PostActionBar";
import { UnderReviewNote } from "@/components/feed/UnderReviewNote";
import { EditedMark, PostMenu, type PostEdit } from "@/components/feed/PostMenu";
import { Avatar } from "@/components/ui/Section";
import { Tag } from "@/components/ui/Pill";
import { useAuth } from "@/context/AuthContext";
import { describeError, votePost } from "@/lib/api";
import { relTime, shortSchool } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import type { FeedPost } from "@/types/crc";

export function PostCard({ post: initial, onTagClick, onDeleted }: { post: FeedPost; onTagClick?: (tag: string) => void; onDeleted?: (postId: string) => void }) {
  const { user, promptLogin } = useAuth();
  const toast = useToast();
  const [override, setOverride] = useState<PostEdit | null>(null);
  const [removed, setRemoved] = useState(false);
  const post: FeedPost = override ? { ...initial, ...override } : initial;
  const [score, setScore] = useState(post.upvote_count);
  const [vote, setVote] = useState<-1 | 0 | 1>(post.my_vote);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setScore(post.upvote_count);
    setVote(post.my_vote);
  }, [post.upvote_count, post.my_vote]);

  const updateVote = async (next: -1 | 0 | 1) => {
    if (!user) {
      promptLogin("login");
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

  if (removed) return null;
  const isAuthor = !!user && user.user_id === post.author_id;
  const flair = post.tags?.[0];
  return (
    <article className="group card card-hover relative min-w-0 overflow-hidden px-4 pb-3 pt-3.5 sm:px-5">
      <header className="relative z-10 flex min-w-0 items-center gap-2.5">
        <Link href={`/u/${post.author_id}`} className="shrink-0" aria-label={`Open ${post.author_name}'s profile`}>
          <Avatar name={post.author_name} size={32} />
        </Link>
        <p className="min-w-0 flex-1 truncate text-meta text-stone-500">
          <Link href={`/u/${post.author_id}`} className="font-semibold text-ink hover:text-brand-700 hover:underline">{post.author_name}</Link>
          <span className="mx-1.5 text-stone-300">•</span>
          {shortSchool(post.author_dept)}
          <span className="mx-1.5 text-stone-300">•</span>
          {relTime(post.created_at)}
          <EditedMark editedAt={post.edited_at} />
        </p>
        {flair && (
          <button type="button" onClick={() => onTagClick?.(flair)} className="shrink-0" aria-label={`Filter by ${flair}`}>
            <Tag>{flair}</Tag>
          </button>
        )}
        <PostMenu
          post={post}
          canEdit={isAuthor}
          canDelete={isAuthor || user?.role === "admin"}
          onEdited={setOverride}
          onDeleted={() => { setRemoved(true); onDeleted?.(post.post_id); }}
        />
      </header>
      {post.under_review && <UnderReviewNote className="mt-2.5" />}
      <h2 className="mt-2.5 font-display text-[19px] leading-snug text-ink">
        <Link href={`/feed/${post.post_id}`} className="after:absolute after:inset-0 after:z-0 group-hover:text-brand-700">{post.title}</Link>
      </h2>
      <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-ui leading-relaxed text-stone-600">{post.body}</p>
      {post.attached_paper_id && post.attached_paper_title && (
        <Link href={`/papers/${post.attached_paper_id}`} className="relative z-10 mt-3 flex min-w-0 items-center gap-2.5 rounded-lg bg-stone-50 px-3 py-2 ring-1 ring-inset ring-stone-200 transition hover:bg-brand-50 hover:ring-brand-200">
          <FileText className="h-4 w-4 shrink-0 text-brand-600" />
          <span className="min-w-0 flex-1 truncate text-meta font-medium text-ink">{post.attached_paper_title}</span>
          <span className="shrink-0 text-label font-semibold text-brand-600">Open paper →</span>
        </Link>
      )}
      <footer className="relative z-10 mt-3">
        <PostActionBar post={post} score={score} vote={vote} busy={busy} onVote={updateVote} />
      </footer>
      {post.tags && post.tags.length > 1 && (
        <div className="relative z-10 mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
          {post.tags.slice(1).map((tag) => (
            <button key={tag} type="button" onClick={() => onTagClick?.(tag)} className="text-label font-medium text-stone-500 hover:text-brand-700">#{tag.replace(/\s+/g, "-")}</button>
          ))}
        </div>
      )}
    </article>
  );
}
