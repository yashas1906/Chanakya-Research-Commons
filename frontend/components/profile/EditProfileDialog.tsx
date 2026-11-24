"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import { describeError, updateProfile } from "@/lib/api";
import type { AuthUser } from "@/types/crc";

const MAX_TAGS = 20;
const MAX_LINKS = 10;

/** Edit name, bio, research interests, personal page and publication links (F1). */
export function EditProfileDialog({
  open,
  onClose,
  user,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  user: AuthUser;
  onSaved: (next: AuthUser) => void;
}) {
  const toast = useToast();
  const { updateUser } = useAuth();
  const [fullName, setFullName] = useState(user.full_name);
  const [bio, setBio] = useState(user.bio ?? "");
  const [tags, setTags] = useState<string[]>(user.interest_tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [profileUrl, setProfileUrl] = useState(user.profile_url ?? "");
  const [links, setLinks] = useState<string[]>(user.publication_links?.length ? user.publication_links : [""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form each time it opens, so cancelled edits don't linger.
  useEffect(() => {
    if (!open) return;
    setFullName(user.full_name);
    setBio(user.bio ?? "");
    setTags(user.interest_tags ?? []);
    setTagDraft("");
    setProfileUrl(user.profile_url ?? "");
    setLinks(user.publication_links?.length ? user.publication_links : [""]);
    setError(null);
  }, [open, user]);

  const addTag = () => {
    const tag = tagDraft.trim().replace(/\s+/g, " ");
    if (!tag) return;
    if (!tags.some((t) => t.toLowerCase() === tag.toLowerCase()) && tags.length < MAX_TAGS) setTags([...tags, tag]);
    setTagDraft("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const pending = tagDraft.trim();
    const finalTags = pending && !tags.some((t) => t.toLowerCase() === pending.toLowerCase()) ? [...tags, pending] : tags;
    setBusy(true);
    setError(null);
    try {
      const next = await updateProfile({
        full_name: fullName.trim(),
        bio: bio.trim(),
        interest_tags: finalTags,
        profile_url: profileUrl.trim(),
        publication_links: links.map((l) => l.trim()).filter(Boolean),
      });
      updateUser(next);
      onSaved(next);
      toast("Profile updated");
      onClose();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit profile"
      description="Your interests and bio shape search, people suggestions and recommendations."
      wide
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="edit-profile-form" className="btn-primary" disabled={busy || fullName.trim().length < 2}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      }
    >
      <form id="edit-profile-form" onSubmit={submit} className="space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-meta font-semibold text-stone-700">Name</span>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} required />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-meta font-semibold text-stone-700">Bio and research focus</span>
          <textarea
            className="input min-h-28 resize-y"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={2000}
            placeholder="What are you working on? Methods, questions, groups you belong to…"
          />
        </label>

        <div>
          <span className="mb-1.5 block text-meta font-semibold text-stone-700">Research interests</span>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-3 pr-1.5 text-meta font-medium text-brand-700">
                {tag}
                <button type="button" onClick={() => setTags(tags.filter((t) => t !== tag))} className="rounded-full p-0.5 hover:bg-brand-100" aria-label={`Remove ${tag}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              className="input"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="e.g. graph neural networks"
              maxLength={60}
              disabled={tags.length >= MAX_TAGS}
            />
            <button type="button" className="btn shrink-0" onClick={addTag} disabled={!tagDraft.trim()}>Add</button>
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-meta font-semibold text-stone-700">Personal page</span>
          <input className="input" type="url" inputMode="url" value={profileUrl} onChange={(e) => setProfileUrl(e.target.value)} placeholder="https://your-site.example" maxLength={500} />
        </label>

        <div>
          <span className="mb-1.5 block text-meta font-semibold text-stone-700">Publication links</span>
          <p className="mb-2 text-label text-stone-500">Google Scholar, ORCID, DOI or arXiv links to your work.</p>
          <div className="space-y-2">
            {links.map((link, index) => (
              <div key={index} className="flex gap-2">
                <input
                  className="input"
                  type="url"
                  inputMode="url"
                  value={link}
                  onChange={(e) => setLinks(links.map((l, i) => (i === index ? e.target.value : l)))}
                  placeholder="https://orcid.org/0000-…"
                  maxLength={500}
                  aria-label={`Publication link ${index + 1}`}
                />
                <button
                  type="button"
                  className="btn-ghost shrink-0"
                  onClick={() => setLinks(links.length > 1 ? links.filter((_, i) => i !== index) : [""])}
                  aria-label={`Remove publication link ${index + 1}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          {links.length < MAX_LINKS && (
            <button type="button" className="btn-ghost mt-2 px-2" onClick={() => setLinks([...links, ""])}>
              <Plus className="h-4 w-4" /> Add link
            </button>
          )}
        </div>

        {error && <p role="alert" className="rounded-lg bg-terracotta-50 px-3 py-2 text-meta text-terracotta-700">{error}</p>}
      </form>
    </Dialog>
  );
}
