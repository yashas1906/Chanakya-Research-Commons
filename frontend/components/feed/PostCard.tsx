"use client";

import { useState } from "react";
import { ArrowBigUp, FileText, MessageSquare } from "lucide-react";
import { CommentThread } from "@/components/feed/CommentThread";
import { Avatar } from "@/components/ui/Section";
import { Tag } from "@/components/ui/Pill";
import { describeError, toggleUpvote } from "@/lib/api";
import { cx, fmtInt, relTime, shortSchool } from "@/lib/format";
import { useMember } from "@/lib/member-context";
import type { FeedPost } from "@/types/crc";

export function PostCard({
  post,
  upvoted,
  onUpvoteChange,
  onTagClick,
}: {
  post: FeedPost;
  upvoted: boolean;
  /** Called with the new state so the parent can persist it per member. */
  onUpvoteChange: (postId: string, upvoted: boolean) => void;
  onTagClick?: (tag: string) => void;
}) {
  const { current } = useMember();
  const [count, setCount] = useState(post.upvote_count);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState<number | null>(null);
  const long = post.body.length > 320;

  const onUpvote = async () => {
    if (!current || busy) return;
    const next = !upvoted;
    // Optimistic, reverted if the backend refuses.
    setBusy(true);
    setNote(null);
    setCount((c) => c + (next ? 1 : -1));
    onUpvoteChange(post.post_id, next);
    try {
      const res = await toggleUpvote(post.post_id, current.user_id);
      if (res.upvote_count !== null) setCount(res.upvote_count);
    } catch (e) {
      setCount((c) => c + (next ? -1 : 1));
      onUpvoteChange(post.post_id, !next);
      setNote(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card card-hover animate-rise overflow-hidden">
      <div className="px-5 pb-4 pt-4">
        <header className="flex items-center gap-3">
          <Avatar name={post.author_name} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium text-ink">{post.author_name}</p>
            <p className="truncate text-[12px] text-stone-500">
              <span className="capitalize">{post.author_role}</span> · {shortSchool(post.author_dept)}
              {post.created_at && <> · {relTime(post.created_at)}</>}
            </p>
          </div>
        </header>

        <h3 className="mt-3.5 font-serif text-[21px] leading-snug tracking-tight text-ink">{post.title}</h3>
        <p className={cx("mt-1.5 whitespace-pre-line text-[14.5px] leading-[1.65] text-stone-700", !expanded && long && "line-clamp-4")}>
          {post.body}
        </p>
        {long && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="mt-1 text-[12.5px] font-medium text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-ink"
          >
            {expanded ? "Show less" : "Continue reading"}
          </button>
        )}

        {post.attached_paper_title && (
          <div className="mt-3.5 flex items-start gap-2.5 rounded-lg border border-stone-200/90 bg-sunken px-3 py-2.5">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" strokeWidth={1.5} />
            <div className="min-w-0">
              <p className="eyebrow">Attached paper</p>
              <p className="font-serif text-[15px] leading-snug text-ink">{post.attached_paper_title}</p>
            </div>
          </div>
        )}

        {post.tags && post.tags.length > 0 && (
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {post.tags.map((t) => (
              <button key={t} type="button" onClick={() => onTagClick?.(t)} className="rounded-md transition-opacity hover:opacity-70">
                <Tag>{t}</Tag>
              </button>
            ))}
          </div>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-stone-100 px-3 py-1.5">
        <button
          type="button"
          onClick={onUpvote}
          disabled={!current || busy}
          aria-pressed={upvoted}
          aria-label={upvoted ? "Remove upvote" : "Upvote"}
          className={cx(
            "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150 disabled:opacity-60",
            upvoted ? "bg-ink text-white" : "text-stone-600 hover:bg-sunken",
          )}
        >
          <ArrowBigUp className="h-4 w-4" strokeWidth={1.75} fill={upvoted ? "currentColor" : "none"} />
          <span className="num">{fmtInt(count)}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowComments((s) => !s)}
          aria-expanded={showComments}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150",
            showComments ? "bg-sunken text-ink" : "text-stone-600 hover:bg-sunken",
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.75} />
          Discussion
          {commentCount !== null && <span className="num text-stone-400">{commentCount}</span>}
        </button>
        {note && (
          <span role="alert" className="ml-auto truncate text-[12px] text-terracotta-600" title={note}>
            {note}
          </span>
        )}
      </footer>

      {showComments && <CommentThread postId={post.post_id} onCountKnown={setCommentCount} />}
    </article>
  );
}
