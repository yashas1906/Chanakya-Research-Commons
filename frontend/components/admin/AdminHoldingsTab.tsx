"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { createHolding, deleteHolding, describeError, getAdminHoldings, getPaper, updateHolding, type AdminHolding, type HoldingInput } from "@/lib/api";
import { authorNames, cx, fmtInt, relTime, schoolLabel, shortSchool } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { SCHOOLS } from "@/types/crc";

const PAGE = 20;
const EMPTY: HoldingInput = {
  title: "",
  abstract: "",
  authors: [],
  publication_year: null,
  venue: "",
  doi: "",
  arxiv_id: "",
  url: "",
  item_type: "paper",
  school: "",
  topics: [],
};

const splitList = (text: string, sep: RegExp) => text.split(sep).map((s) => s.trim()).filter(Boolean);

/** Create or edit one holding. Every field the paper page shows can be set here. */
function HoldingForm({ editingId, onDone, onCancel }: { editingId: string | null; onDone: (paperId: string, created: boolean) => void; onCancel: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<HoldingInput>(EMPTY);
  const [authorsText, setAuthorsText] = useState("");
  const [topicsText, setTopicsText] = useState("");
  const [yearText, setYearText] = useState("");
  const [loading, setLoading] = useState(!!editingId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Editing: load the full record so nothing is lost on save.
  useEffect(() => {
    if (!editingId) {
      setForm(EMPTY);
      setAuthorsText("");
      setTopicsText("");
      setYearText("");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    getPaper(editingId, controller.signal)
      .then((p) => {
        const topics = p.topics ?? [];
        const school = topics.find((t) => (SCHOOLS as readonly string[]).includes(t)) ?? "";
        setForm({
          title: p.canonical_title,
          abstract: p.abstract ?? "",
          authors: authorNames(p.authors),
          publication_year: p.publication_year ?? null,
          venue: p.venue ?? "",
          doi: p.doi ?? "",
          arxiv_id: p.arxiv_id ?? "",
          url: p.url ?? "",
          item_type: p.item_type === "article" ? "article" : "paper",
          school,
          topics: topics.filter((t) => t !== school),
        });
        setAuthorsText(authorNames(p.authors).join("\n"));
        setTopicsText(topics.filter((t) => t !== school).join(", "));
        setYearText(p.publication_year ? String(p.publication_year) : "");
      })
      .catch((e) => setErr(describeError(e)))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [editingId]);

  const set = <K extends keyof HoldingInput>(key: K, value: HoldingInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const year = yearText.trim() ? Number(yearText) : null;
    if (year !== null && (!Number.isInteger(year) || year < 1800 || year > 2100)) {
      setErr("Enter a year between 1800 and 2100, or leave it blank.");
      return;
    }
    const payload: HoldingInput = {
      ...form,
      title: form.title.trim(),
      authors: splitList(authorsText, /[\n;]+/),
      topics: splitList(topicsText, /[,\n]+/),
      publication_year: year,
    };
    setBusy(true);
    setErr(null);
    try {
      if (editingId) {
        await updateHolding(editingId, payload);
        toast("Holding updated");
        onDone(editingId, false);
      } else {
        const created = await createHolding(payload);
        toast("Posted to the Chanakya holdings");
        onDone(created.paper_id, true);
      }
    } catch (e2) {
      setErr(describeError(e2));
    } finally {
      setBusy(false);
    }
  };

  const label = "mb-1 block text-meta font-medium text-stone-700";
  if (loading) return <div className="card space-y-3 p-5" role="status" aria-label="Loading record"><Skeleton className="h-10" /><Skeleton className="h-24" /><Skeleton className="h-10" /></div>;

  return (
    <form onSubmit={submit} className="card animate-pop space-y-5 p-5 sm:p-6" aria-label={editingId ? "Edit holding" : "Post a new holding"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{editingId ? "Edit holding" : "New holding"}</p>
          <h2 className="font-display text-h3 text-ink">{editingId ? "Update this record" : "Post a paper or article to the Chanakya library"}</h2>
          <p className="mt-1 text-meta text-stone-500">It gets its own page, shows up in Library → Chanakya holdings, in search and in the assistant.</p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Close form"><X className="h-4 w-4" /></button>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
        <label className="block">
          <span className={label}>Title <span className="text-brand-600">*</span></span>
          <input required minLength={3} maxLength={500} value={form.title} onChange={(e) => set("title", e.target.value)} className="input" placeholder="Full title of the paper or article" />
        </label>
        <label className="block">
          <span className={label}>Type</span>
          <select value={form.item_type} onChange={(e) => set("item_type", e.target.value as HoldingInput["item_type"])} className="input">
            <option value="paper">Research paper</option>
            <option value="article">Article</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className={label}>Authors</span>
          <textarea rows={3} value={authorsText} onChange={(e) => setAuthorsText(e.target.value)} className="input resize-y" placeholder={"One per line, e.g.\nNabi Hasan\nA. Kumar"} />
        </label>
        <label className="block">
          <span className={label}>Abstract</span>
          <textarea rows={3} value={form.abstract} onChange={(e) => set("abstract", e.target.value)} className="input resize-y" placeholder="Summary shown on the paper page and used for search" />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
        <label className="block">
          <span className={label}>Venue (journal, conference or publisher)</span>
          <input value={form.venue} maxLength={200} onChange={(e) => set("venue", e.target.value)} className="input" placeholder="e.g. DESIDOC Journal of Library & Information Technology" />
        </label>
        <label className="block">
          <span className={label}>Year</span>
          <input inputMode="numeric" value={yearText} onChange={(e) => setYearText(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} className="input num" placeholder="2025" />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="block">
          <span className={label}>DOI</span>
          <input value={form.doi} onChange={(e) => set("doi", e.target.value)} className="input" placeholder="10.1234/abcd.5678" />
        </label>
        <label className="block">
          <span className={label}>arXiv ID</span>
          <input value={form.arxiv_id} onChange={(e) => set("arxiv_id", e.target.value)} className="input" placeholder="2401.01234" />
        </label>
        <label className="block">
          <span className={label}>Link to the full text</span>
          <input type="url" value={form.url} onChange={(e) => set("url", e.target.value)} className="input" placeholder="https://…" />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className={label}>School</span>
          <select value={form.school} onChange={(e) => set("school", e.target.value)} className="input">
            <option value="">No school</option>
            {SCHOOLS.map((s) => <option key={s} value={s}>{schoolLabel(s)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={label}>Topics</span>
          <input value={topicsText} onChange={(e) => setTopicsText(e.target.value)} className="input" placeholder="Comma separated, e.g. digital humanities, metadata" />
        </label>
      </div>

      {err && <p role="alert" className="text-meta text-terracotta-600">{err}</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-stone-100 pt-4">
        <button type="button" onClick={onCancel} className="btn">Cancel</button>
        <button type="submit" disabled={busy || form.title.trim().length < 3} className="btn-primary">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {editingId ? "Save changes" : "Publish to library"}
        </button>
      </div>
    </form>
  );
}

export function AdminHoldingsTab() {
  const toast = useToast();
  const [scope, setScope] = useState<"posted" | "all">("posted");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  // null = form closed, "" = new holding, otherwise the paper being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AdminHolding | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(search.trim());
      setPage(0);
    }, 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const { data, error, loading, reload } = useAsync((s) => getAdminHoldings({ q, scope, limit: PAGE, offset: page * PAGE }, s), [q, scope, page]);
  const total = data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE) - 1);

  const openForm = (id: string) => {
    setEditing(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async () => {
    if (!confirm || deleting) return;
    setDeleting(true);
    try {
      await deleteHolding(confirm.paper_id);
      toast(`Deleted “${confirm.canonical_title.slice(0, 60)}”`);
      if (editing === confirm.paper_id) setEditing(null);
      setConfirm(null);
      reload();
    } catch (e) {
      toast(describeError(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="space-y-5" aria-label="Chanakya holdings">
      {editing === null ? (
        <div className="card flex flex-wrap items-center gap-4 p-5">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Chanakya holdings</p>
            <h2 className="font-display text-h3 text-ink">Post papers and articles to the university library</h2>
            <p className="mt-1 text-meta text-stone-500">Fill in the record once; it becomes a paper page every member can read, save and discuss.</p>
          </div>
          <button type="button" className="btn-primary" onClick={() => openForm("")}><Plus className="h-4 w-4" /> New holding</button>
        </div>
      ) : (
        <HoldingForm
          editingId={editing || null}
          onCancel={() => setEditing(null)}
          onDone={(_paperId, created) => {
            setEditing(null);
            if (created) {
              setScope("posted");
              setPage(0);
            }
            reload();
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full border border-stone-200 bg-paper p-1" role="group" aria-label="Which holdings">
          {([["posted", "Posting history"], ["all", "All holdings"]] as const).map(([id, text]) => (
            <button
              key={id}
              type="button"
              aria-pressed={scope === id}
              onClick={() => { setScope(id); setPage(0); }}
              className={cx("rounded-full px-3.5 py-1.5 text-meta font-semibold transition", scope === id ? "bg-brand-600 text-white" : "text-stone-600 hover:bg-stone-100")}
            >
              {text}
            </button>
          ))}
        </div>
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, author, venue or DOI" aria-label="Search holdings" className="input h-9 py-0 pl-9 text-meta" />
        </label>
        <span className="num ml-auto text-meta text-stone-500" aria-live="polite">{loading && !data ? "Loading…" : `${fmtInt(total)} ${total === 1 ? "record" : "records"}`}</span>
      </div>

      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <div className="card space-y-3 p-4" role="status" aria-label="Loading holdings">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : data.items.length === 0 ? (
        <div className="card">
          <EmptyState
            title={q ? "No holdings match" : scope === "posted" ? "Nothing posted from the dashboard yet" : "The library is empty"}
            hint={scope === "posted" && !q ? "Use New holding to add the first record." : "Try another search."}
          />
        </div>
      ) : (
        <div className={cx("card overflow-x-auto transition-opacity", loading && "opacity-60")}>
          <table className="w-full min-w-[640px] text-left text-meta">
            <thead>
              <tr className="border-b border-stone-200 bg-sunken/60 text-label uppercase tracking-[0.1em] text-stone-500">
                <th scope="col" className="px-4 py-2.5 font-semibold">Record</th>
                <th scope="col" className="hidden px-3 py-2.5 font-semibold lg:table-cell">School</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Saves</th>
                <th scope="col" className="hidden px-3 py-2.5 font-semibold md:table-cell">{scope === "posted" ? "Posted" : "Added"}</th>
                <th scope="col" className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.items.map((h) => {
                const school = h.topics.find((t) => (SCHOOLS as readonly string[]).includes(t));
                return (
                  <tr key={h.paper_id} className={cx("align-top transition hover:bg-stone-50/70", editing === h.paper_id && "bg-brand-50/40")}>
                    <td className="max-w-[460px] px-4 py-3">
                      <Link href={`/papers/${h.paper_id}`} className="line-clamp-2 text-ui font-medium leading-snug text-ink hover:underline">{h.canonical_title}</Link>
                      <p className="mt-0.5 truncate text-label text-stone-500">
                        {[h.authors.slice(0, 3).join(", ") + (h.authors.length > 3 ? ` +${h.authors.length - 3}` : ""), h.venue, h.publication_year].filter(Boolean).join(" · ") || "No authors or venue"}
                      </p>
                      <span className="mt-1 inline-block rounded-full bg-stone-100 px-2 py-0.5 text-label font-medium text-stone-600">{h.item_type === "article" ? "Article" : "Paper"}</span>
                    </td>
                    <td className="hidden px-3 py-3 text-stone-600 lg:table-cell">{school ? shortSchool(school) : "—"}</td>
                    <td className="num px-3 py-3 text-right text-ink">{fmtInt(h.save_count)}</td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-stone-500 md:table-cell">
                      {h.created_at ? relTime(h.created_at) : "—"}
                      {h.created_by_name && <span className="block text-label text-stone-400">by {h.created_by_name}</span>}
                      {h.updated_at && <span className="block text-label text-stone-400">edited {relTime(h.updated_at)}</span>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <Link href={`/papers/${h.paper_id}`} className="btn-ghost h-8 px-2" aria-label={`Open ${h.canonical_title}`} title="Open page"><ExternalLink className="h-4 w-4" /></Link>
                        <button type="button" onClick={() => openForm(h.paper_id)} className="btn-ghost h-8 px-2" aria-label={`Edit ${h.canonical_title}`} title="Edit"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => setConfirm(h)} className="btn-ghost h-8 px-2 text-terracotta-600 hover:bg-terracotta-50 hover:text-terracotta-700" aria-label={`Delete ${h.canonical_title}`} title="Delete"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && total > PAGE && (
        <nav className="flex items-center justify-end gap-2" aria-label="Pagination">
          <button type="button" className="btn h-9" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}><ChevronLeft className="h-4 w-4" /> Previous</button>
          <span className="num text-meta text-stone-500">Page {page + 1} of {lastPage + 1}</span>
          <button type="button" className="btn h-9" disabled={page >= lastPage} onClick={() => setPage((p) => Math.min(lastPage, p + 1))}>Next <ChevronRight className="h-4 w-4" /></button>
        </nav>
      )}

      <Dialog
        open={confirm !== null}
        onClose={() => !deleting && setConfirm(null)}
        title="Delete this holding?"
        description={confirm ? `“${confirm.canonical_title}” and its page will be removed for everyone. ${confirm.save_count} member saves and its citation links go with it; ${confirm.discussion_count} discussion${confirm.discussion_count === 1 ? "" : "s"} that attached it will stay, without the attachment. This can't be undone.` : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setConfirm(null)} disabled={deleting}>Cancel</button>
            <button type="button" className="btn-primary bg-terracotta-600 hover:bg-terracotta-700" onClick={remove} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />} Delete permanently
            </button>
          </div>
        }
      />
    </section>
  );
}
