"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, Loader2, MessageSquare, Paperclip, Pencil, Trash2 } from "lucide-react";
import { DomainSelect } from "@/components/feed/DomainSelect";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import { deletePost, describeError, getAdminMemberPosts, setMemberRole, updatePost, type AdminMemberPost } from "@/lib/api";
import { DOMAINS } from "@/lib/domains";
import { fmtInt, relTime } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import type { AdminMember } from "@/types/crc";

const ROLES: Array<AdminMember["role"]> = ["student", "researcher", "faculty", "admin"];

/** Inline editor for one post: title, body and research domains. */
function PostEditor({ post, onSaved, onCancel }: { post: AdminMemberPost; onSaved: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  // Older free-text tags are not domains; keep only the ones the dropdown knows.
  const [tags, setTags] = useState(post.tags.filter((t) => (DOMAINS as readonly string[]).includes(t)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim() || !body.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await updatePost(post.post_id, { title: title.trim(), body: body.trim(), tags });
      toast("Post updated");
      onSaved();
    } catch (e) {
      setErr(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2.5 rounded-lg border border-brand-200 bg-paper p-3">
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={250} aria-label="Post title" className="input font-medium" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} aria-label="Post body" className="input resize-y leading-relaxed" />
      <DomainSelect value={tags} onChange={setTags} />
      {err && <p role="alert" className="text-meta text-terracotta-600">{err}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn h-9" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="btn-primary h-9" onClick={save} disabled={busy || !title.trim() || !body.trim()}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </button>
      </div>
    </div>
  );
}

/** Opens under a member's row: change their role, and read, edit or delete any of their posts. */
export function MemberPostsPanel({ member, onChanged }: { member: AdminMember; onChanged: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const posts = useAsync((s) => getAdminMemberPosts(member.user_id, s), [member.user_id]);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AdminMemberPost | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [role, setRole] = useState(member.role);
  const [roleBusy, setRoleBusy] = useState(false);
  const isSelf = user?.user_id === member.user_id;

  const changeRole = async (next: AdminMember["role"]) => {
    if (next === role || roleBusy) return;
    setRoleBusy(true);
    try {
      await setMemberRole(member.user_id, next);
      setRole(next);
      toast(`${member.full_name} is now ${next === "admin" ? "an admin" : `a ${next}`}`);
      onChanged();
    } catch (e) {
      toast(describeError(e));
    } finally {
      setRoleBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm || deleting) return;
    setDeleting(true);
    try {
      await deletePost(confirm.post_id);
      toast("Post deleted");
      setConfirm(null);
      posts.reload();
      onChanged();
    } catch (e) {
      toast(describeError(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-3 bg-sunken/40 px-4 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-display text-[15px] text-ink">Posts by {member.full_name}</h3>
        <span className="num text-meta text-stone-500">{posts.data ? fmtInt(posts.data.length) : "…"}</span>
        <label className="ml-auto flex items-center gap-2 text-meta text-stone-600">
          Role
          <select
            value={role}
            disabled={isSelf || roleBusy}
            title={isSelf ? "You can't change your own role" : undefined}
            onChange={(e) => changeRole(e.target.value as AdminMember["role"])}
            className="input h-8 w-auto py-0 pr-8 text-meta capitalize"
          >
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {roleBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        </label>
      </div>

      {posts.loading && !posts.data ? (
        <div className="space-y-2" role="status" aria-label="Loading posts"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
      ) : posts.error ? (
        <ErrorState error={posts.error} onRetry={posts.reload} />
      ) : !posts.data?.length ? (
        <EmptyState className="py-6" title="No posts yet" hint={`${member.full_name} hasn't posted in the feed.`} />
      ) : (
        <ul className="crc-scroll max-h-[28rem] space-y-2 overflow-y-auto pr-1">
          {posts.data.map((post) => (
            <li key={post.post_id} className="rounded-lg border border-stone-200 bg-paper p-3">
              {editing === post.post_id ? (
                <PostEditor post={post} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); posts.reload(); }} />
              ) : (
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/feed/${post.post_id}`} className="text-ui font-medium text-ink hover:underline">{post.title}</Link>
                      {post.is_flagged_spam && <span className="rounded-full bg-terracotta-50 px-1.5 py-0.5 text-label font-semibold text-terracotta-600">Flagged</span>}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-meta text-stone-600">{post.body}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-label text-stone-500">
                      <span>{post.created_at ? relTime(post.created_at) : ""}{post.edited_at ? " · edited" : ""}</span>
                      <span className="num">{fmtInt(post.upvote_count)} votes</span>
                      <span className="num inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{fmtInt(post.comment_count)}</span>
                      {post.attached_paper_id && (
                        <Link href={`/papers/${post.attached_paper_id}`} className="inline-flex max-w-[16rem] items-center gap-1 hover:text-ink">
                          <Paperclip className="h-3 w-3 shrink-0" /><span className="truncate">{post.attached_paper_title}</span>
                        </Link>
                      )}
                      {post.tags.map((t) => <span key={t} className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">{t}</span>)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Link href={`/feed/${post.post_id}`} className="btn-ghost h-8 px-2" title="Open post" aria-label={`Open ${post.title}`}><ExternalLink className="h-4 w-4" /></Link>
                    <button type="button" onClick={() => setEditing(post.post_id)} className="btn-ghost h-8 px-2" title="Edit" aria-label={`Edit ${post.title}`}><Pencil className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setConfirm(post)} className="btn-ghost h-8 px-2 text-terracotta-600 hover:bg-terracotta-50 hover:text-terracotta-700" title="Delete" aria-label={`Delete ${post.title}`}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={confirm !== null}
        onClose={() => !deleting && setConfirm(null)}
        title="Delete this post?"
        description={confirm ? `“${confirm.title}” by ${member.full_name}, with its ${confirm.comment_count} comment${confirm.comment_count === 1 ? "" : "s"} and votes, will be removed for everyone. This can't be undone.` : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setConfirm(null)} disabled={deleting}>Cancel</button>
            <button type="button" className="btn-primary bg-terracotta-600 hover:bg-terracotta-700" onClick={remove} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />} Delete post
            </button>
          </div>
        }
      />
    </div>
  );
}
