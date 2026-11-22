"use client";

import { useMemo, useState } from "react";
import { CornerDownRight, Loader2, Send } from "lucide-react";
import { Avatar } from "@/components/ui/Section";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { SkeletonLines } from "@/components/ui/Skeleton";
import { addComment, describeError, getComments } from "@/lib/api";
import { relTime, shortSchool } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useMember } from "@/lib/member-context";
import type { Comment } from "@/types/crc";

interface Node extends Comment {
  children: Node[];
}

function buildTree(list: Comment[]): Node[] {
  const byId = new Map<string, Node>(list.map((c) => [c.comment_id, { ...c, children: [] }]));
  const roots: Node[] = [];
  for (const n of byId.values()) {
    const parent = n.parent_comment_id ? byId.get(n.parent_comment_id) : undefined;
    (parent ? parent.children : roots).push(n);
  }
  const byTime = (a: Node, b: Node) => a.created_at.localeCompare(b.created_at);
  const sortAll = (ns: Node[]) => {
    ns.sort(byTime);
    ns.forEach((n) => sortAll(n.children));
  };
  sortAll(roots);
  return roots;
}

function Reply({ onSubmit, onCancel, placeholder }: { onSubmit: (body: string) => Promise<void>; onCancel?: () => void; placeholder: string }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { current } = useMember();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(body.trim());
      setBody("");
      onCancel?.();
    } catch (e2) {
      setErr(describeError(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-1.5">
      <div className="flex items-start gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={1}
          placeholder={placeholder}
          aria-label={placeholder}
          className="input min-h-[38px] resize-y py-2 text-[13.5px]"
        />
        <button type="submit" disabled={!body.trim() || busy || !current} className="btn-primary h-[38px] shrink-0 px-3" aria-label="Post comment">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </div>
      {err && (
        <p role="alert" className="text-[12px] text-terracotta-600">
          {err}
        </p>
      )}
    </form>
  );
}

function CommentItem({ node, depth, onReply }: { node: Node; depth: number; onReply: (body: string, parentId: string) => Promise<void> }) {
  const [replying, setReplying] = useState(false);
  return (
    <li className="space-y-2.5">
      <div className="flex gap-2.5">
        <Avatar name={node.author_name} size={24} />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px]">
            <span className="font-medium text-ink">{node.author_name}</span>
            <span className="text-stone-400">
              {node.author_dept ? ` · ${shortSchool(node.author_dept)}` : ""} · {relTime(node.created_at)}
            </span>
          </p>
          <p className="mt-0.5 whitespace-pre-line text-[13.5px] leading-relaxed text-stone-700">{node.body}</p>
          {depth < 3 && (
            <button
              type="button"
              onClick={() => setReplying((r) => !r)}
              className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-stone-500 hover:text-ink"
            >
              <CornerDownRight className="h-3 w-3" /> Reply
            </button>
          )}
        </div>
      </div>
      {replying && (
        <div className="ml-8">
          <Reply
            placeholder={`Reply to ${node.author_name}…`}
            onSubmit={(b) => onReply(b, node.comment_id)}
            onCancel={() => setReplying(false)}
          />
        </div>
      )}
      {node.children.length > 0 && (
        <ul className="ml-3 space-y-3 border-l border-stone-100 pl-5">
          {node.children.map((c) => (
            <CommentItem key={c.comment_id} node={c} depth={depth + 1} onReply={onReply} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Lazily loaded, threaded comments for one post. */
export function CommentThread({ postId, onCountKnown }: { postId: string; onCountKnown?: (n: number) => void }) {
  const { current } = useMember();
  const { data, error, loading, reload } = useAsync(
    async (s) => {
      const list = await getComments(postId, s);
      onCountKnown?.(list.length);
      return list;
    },
    [postId],
  );
  const tree = useMemo(() => buildTree(data ?? []), [data]);

  const post = async (body: string, parentId: string | null) => {
    if (!current) throw new Error("Choose a member to comment as.");
    await addComment(postId, { author_id: current.user_id, body, parent_comment_id: parentId });
    reload();
  };

  return (
    <div className="space-y-4 border-t border-stone-100 bg-canvas/60 px-5 py-4">
      {loading && !data ? (
        <SkeletonLines lines={3} />
      ) : error ? (
        <ErrorState compact error={error} onRetry={reload} />
      ) : tree.length === 0 ? (
        <EmptyState className="py-3" title="No replies yet" hint="Start the conversation below." />
      ) : (
        <ul className="space-y-4">
          {tree.map((n) => (
            <CommentItem key={n.comment_id} node={n} depth={0} onReply={post} />
          ))}
        </ul>
      )}
      {!error && <Reply placeholder="Add to the discussion…" onSubmit={(b) => post(b, null)} />}
    </div>
  );
}
