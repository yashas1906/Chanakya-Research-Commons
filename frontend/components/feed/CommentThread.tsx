"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CornerDownRight, Loader2, Send } from "lucide-react";
import { Avatar } from "@/components/ui/Section";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { SkeletonLines } from "@/components/ui/Skeleton";
import { ShareButton } from "@/components/feed/ShareButton";
import { CommentEditor, CommentOwnerActions } from "@/components/feed/CommentControls";
import { addComment, describeError, getComments } from "@/lib/api";
import { relTime } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/context/AuthContext";
import type { Comment } from "@/types/crc";

interface Node extends Comment { children: Node[] }
type SortMode = "best" | "newest" | "oldest";

function buildTree(comments: Comment[]): Node[] {
  const nodes = new Map(comments.map((comment) => [comment.comment_id, { ...comment, children: [] as Node[] }]));
  const hasCycle = (start: Node) => {
    const seen = new Set<string>();
    let current: Node | undefined = start;
    while (current?.parent_comment_id) {
      if (seen.has(current.comment_id)) return true;
      seen.add(current.comment_id);
      current = nodes.get(current.parent_comment_id);
    }
    return false;
  };
  const roots: Node[] = [];
  nodes.forEach((node) => {
    const parent = node.parent_comment_id ? nodes.get(node.parent_comment_id) : undefined;
    if (parent && parent.post_id === node.post_id && !hasCycle(node)) parent.children.push(node);
    else roots.push(node);
  });
  const sort = (items: Node[]) => {
    items.sort((a, b) => a.created_at.localeCompare(b.created_at));
    items.forEach((node) => sort(node.children));
  };
  sort(roots);
  return roots;
}

function countReplies(node: Node): number {
  return node.children.reduce((sum, child) => sum + 1 + countReplies(child), 0);
}

function filterTree(nodes: Node[], query: string): Node[] {
  if (!query) return nodes;
  return nodes.flatMap((node) => {
    const children = filterTree(node.children, query);
    return node.body.toLowerCase().includes(query) || children.length ? [{ ...node, children }] : [];
  });
}

function Reply({
  onSubmit,
  placeholder,
  onCancel,
  expanded = true,
}: {
  onSubmit: (body: string) => Promise<void>;
  placeholder: string;
  onCancel?: () => void;
  expanded?: boolean;
}) {
  const { user, promptLogin } = useAuth();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) {
      promptLogin();
      return;
    }
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(body.trim());
      setBody("");
      onCancel?.();
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={expanded ? 3 : 1} placeholder={placeholder} aria-label={placeholder} className="input resize-y leading-relaxed" />
      {expanded && <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={onCancel}>Cancel</button><button type="submit" disabled={!body.trim() || busy} className="btn-primary">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Comment</button></div>}
      {!expanded && <button type="submit" disabled={!body.trim() || busy} className="btn-primary h-9 px-3">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>}
      {error && <p role="alert" className="text-meta text-terracotta-700">{error}</p>}
    </form>
  );
}

function CommentItem({ node, postId, depth, onReply, onChanged }: { node: Node; postId: string; depth: number; onReply: (body: string, parentId: string) => Promise<void>; onChanged: () => void }) {
  const { user } = useAuth();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Edit and Delete appear only on the signed-in member's own comments (the server checks this too).
  const mine = !!user && !node.is_deleted && node.author_id === user.user_id;
  const visualDepth = Math.min(depth, 5);
  const children = collapsed ? null : node.children;
  return (
    <li id={`c-${node.comment_id}`} className="min-w-0 scroll-mt-24 space-y-3">
      <div className="flex min-w-0 gap-3">
        {node.is_deleted ? <span aria-hidden className="h-8 w-8 shrink-0 rounded-full border border-dashed border-stone-300" /> : <Avatar name={node.author_name} size={32} />}
        <div className="min-w-0 flex-1">
          {node.is_deleted ? (
            <p className="py-1 text-meta italic text-stone-400">This comment was deleted.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-ui font-medium text-ink">{node.author_name}</span>
                {node.author_role && <RoleBadge role={node.author_role} />}
                <span className="text-meta text-stone-500">{relTime(node.created_at)}</span>
                {node.edited_at && <span className="text-meta text-stone-400" title={`Edited ${relTime(node.edited_at)}`}>(edited)</span>}
              </div>
              {editing ? (
                <CommentEditor commentId={node.comment_id} initial={node.body} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); }} />
              ) : (
                <p className="mt-1 whitespace-pre-wrap text-body leading-relaxed text-stone-700">{node.body}</p>
              )}
            </>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {!node.is_deleted && <button type="button" onClick={() => setReplying((value) => !value)} className="inline-flex items-center gap-1 text-meta font-medium text-stone-600 hover:text-ink"><CornerDownRight className="h-4 w-4" />Reply</button>}
            {!node.is_deleted && <ShareButton url={`/feed/${postId}#c-${node.comment_id}`} />}
            {mine && !editing && <CommentOwnerActions commentId={node.comment_id} hasReplies={node.children.length > 0} onEdit={() => { setEditing(true); setReplying(false); }} onDeleted={onChanged} />}
            {node.children.length > 0 && <button type="button" onClick={() => setCollapsed((value) => !value)} className="text-meta text-stone-500 hover:text-ink">{collapsed ? `[+] ${countReplies(node)} replies` : "Collapse thread"}</button>}
          </div>
        </div>
      </div>
      {replying && <div className="ml-10"><Reply placeholder={`Reply to ${node.author_name}…`} onSubmit={(body) => onReply(body, node.comment_id)} onCancel={() => setReplying(false)} /></div>}
      {children && children.length > 0 && <ul className={`ml-4 space-y-4 pl-4 ${visualDepth < 5 ? "border-l border-stone-200" : ""}`}>{children.map((child) => <CommentItem key={child.comment_id} node={child} postId={postId} depth={visualDepth + 1} onReply={onReply} onChanged={onChanged} />)}</ul>}
      {depth >= 5 && node.children.length > 0 && collapsed && <button type="button" onClick={() => setCollapsed(false)} className="ml-10 text-meta font-medium text-stone-600">Continue thread ({countReplies(node)} replies)</button>}
    </li>
  );
}

export function CommentThread({ postId, onCountKnown }: { postId: string; onCountKnown?: (count: number) => void }) {
  const { user, promptLogin } = useAuth();
  const [sortMode, setSortMode] = useState<SortMode>("best");
  const [filter, setFilter] = useState("");
  const { data, error, loading, reload } = useAsync(async (signal) => {
    const list = await getComments(postId, signal);
    onCountKnown?.(list.length);
    return list;
  }, [postId]);
  const tree = useMemo(() => {
    const roots = buildTree(data ?? []);
    const direction = sortMode === "newest" ? -1 : 1;
    const sort = (nodes: Node[]) => {
      nodes.sort((a, b) => direction * a.created_at.localeCompare(b.created_at));
      nodes.forEach((node) => sort(node.children));
    };
    sort(roots);
    return filterTree(roots, filter.trim().toLowerCase());
  }, [data, sortMode, filter]);

  useEffect(() => {
    if (!data || !window.location.hash.startsWith("#c-")) return;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.classList.add("rounded-lg", "bg-sunken");
      window.setTimeout(() => target?.classList.remove("bg-sunken"), 1800);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [data]);

  const submit = async (body: string, parentId: string | null) => {
    if (!user) {
      promptLogin();
      throw new Error("Sign in to join the conversation.");
    }
    await addComment(postId, { author_id: user.user_id, body, parent_comment_id: parentId });
    reload();
  };

  return (
    <section id="comments" className="scroll-mt-24 space-y-5 border-t border-stone-200 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow">Community</p><h2 className="mt-1 font-display text-h2 text-ink">Join the conversation</h2></div>
        <label className="text-meta text-stone-600">Sort
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="ml-2 rounded-lg border border-stone-200 bg-paper px-2 py-2 text-meta">
            <option value="best">Top-level first</option><option value="newest">Newest</option><option value="oldest">Oldest</option>
          </select>
        </label>
      </div>
      <Reply placeholder={user ? "Add a thoughtful comment…" : "Sign in to join the conversation"} onSubmit={(body) => submit(body, null)} />
      <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search comments…" aria-label="Search comments" className="input" />
      {loading && !data ? <SkeletonLines lines={4} />
        : error ? <ErrorState compact error={error} onRetry={reload} />
          : tree.length === 0 ? <EmptyState className="py-6" title={filter ? "No comments match" : "No replies yet"} hint={filter ? "Try a different search term." : "Be the first to respond."} />
            : <ul className="space-y-6">{tree.map((node) => <CommentItem key={node.comment_id} node={node} postId={postId} depth={0} onReply={(body, parent) => submit(body, parent)} onChanged={reload} />)}</ul>}
    </section>
  );
}
