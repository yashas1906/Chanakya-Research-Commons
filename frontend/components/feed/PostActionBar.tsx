"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { SaveButton } from "@/components/ui/SaveButton";
import { ShareButton } from "@/components/feed/ShareButton";
import { VoteButtons } from "@/components/feed/VoteButtons";
import type { FeedPost } from "@/types/crc";

export function PostActionBar({
  post,
  score,
  vote,
  busy,
  onVote,
}: {
  post: FeedPost;
  score: number;
  vote: -1 | 0 | 1;
  busy?: boolean;
  onVote: (value: -1 | 0 | 1) => void;
}) {
  return (
    <div className="relative z-10 flex min-w-0 flex-wrap items-center gap-2">
      <VoteButtons score={score} vote={vote} busy={busy} onVote={onVote} />
      <Link href={`/feed/${post.post_id}#comments`} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stone-200 px-3 text-meta font-medium text-stone-700 hover:bg-sunken">
        <MessageSquare className="h-4 w-4" />{post.comment_count}
      </Link>
      <ShareButton url={`/feed/${post.post_id}`} />
      {post.attached_paper_id && <SaveButton paperId={post.attached_paper_id} size="sm" />}
    </div>
  );
}
