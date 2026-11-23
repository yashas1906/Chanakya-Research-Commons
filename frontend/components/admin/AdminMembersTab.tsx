"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search, ShieldAlert } from "lucide-react";
import { Avatar } from "@/components/ui/Section";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Skeleton } from "@/components/ui/Skeleton";
import { getAdminMembers } from "@/lib/api";
import { cx, fmtInt, relTime } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import type { AdminMemberSort } from "@/types/crc";

const PAGE = 25;

const COLUMNS: Array<{ id: AdminMemberSort; label: string; numeric?: boolean; hideBelow?: "md" | "lg" | "xl" }> = [
  { id: "name", label: "Member" },
  { id: "role", label: "Role", hideBelow: "md" },
  { id: "department", label: "Department", hideBelow: "lg" },
  { id: "posts", label: "Posts", numeric: true },
  { id: "comments", label: "Comments", numeric: true, hideBelow: "lg" },
  { id: "saves", label: "Saves", numeric: true, hideBelow: "xl" },
  { id: "karma", label: "Karma", numeric: true },
  { id: "last_active", label: "Last active", hideBelow: "lg" },
];

const hide = (b?: "md" | "lg" | "xl") => (b === "md" ? "hidden md:table-cell" : b === "lg" ? "hidden lg:table-cell" : b === "xl" ? "hidden xl:table-cell" : "");

export function AdminMembersTab({ departments }: { departments: string[] }) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [sort, setSort] = useState<AdminMemberSort>("joined");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(search.trim());
      setPage(0);
    }, 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const { data, error, loading, reload } = useAsync(
    (s) => getAdminMembers({ q, role: role || undefined, department: department || undefined, flagged, sort, order, limit: PAGE, offset: page * PAGE }, s),
    [q, role, department, flagged, sort, order, page],
  );

  const toggleSort = (id: AdminMemberSort) => {
    setPage(0);
    if (id === sort) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(id);
      setOrder(id === "name" || id === "role" || id === "department" ? "asc" : "desc");
    }
  };
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(0);
  };

  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : page * PAGE + 1;
  const to = Math.min(total, (page + 1) * PAGE);
  const lastPage = Math.max(0, Math.ceil(total / PAGE) - 1);
  const field = "input h-9 py-0 text-meta";

  return (
    <section className="space-y-4" aria-label="Member directory">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or university ID" aria-label="Search members" className={cx(field, "w-full pl-9")} />
        </label>
        <select value={role} onChange={(e) => reset(setRole)(e.target.value)} aria-label="Filter by role" className={cx(field, "w-auto pr-8")}>
          <option value="">All roles</option>
          <option value="student">Students</option>
          <option value="researcher">Researchers</option>
          <option value="faculty">Faculty</option>
          <option value="admin">Admins</option>
        </select>
        <select value={department} onChange={(e) => reset(setDepartment)(e.target.value)} aria-label="Filter by department" className={cx(field, "w-auto max-w-[220px] pr-8")}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-stone-200 bg-paper px-3 text-meta text-stone-700">
          <input type="checkbox" checked={flagged} onChange={(e) => reset(setFlagged)(e.target.checked)} className="accent-brand-600" />
          <ShieldAlert className="h-3.5 w-3.5 text-terracotta-600" /> Flagged only
        </label>
        <span className="num ml-auto text-meta text-stone-500" aria-live="polite">{loading && !data ? "Loading…" : total === 0 ? "0 members" : `${fmtInt(from)}–${fmtInt(to)} of ${fmtInt(total)}`}</span>
      </div>

      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <div className="card space-y-3 p-4" role="status" aria-label="Loading members">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : data.items.length === 0 ? (
        <div className="card"><EmptyState title="No members match" hint="Try a different search or clear the filters." /></div>
      ) : (
        <div className={cx("card overflow-x-auto transition-opacity", loading && "opacity-60")}>
          <table className="w-full min-w-[420px] text-left text-meta">
            <thead>
              <tr className="border-b border-stone-200 bg-sunken/60 text-label uppercase tracking-[0.1em] text-stone-500">
                {COLUMNS.map((c) => (
                  <th key={c.id} scope="col" aria-sort={sort === c.id ? (order === "asc" ? "ascending" : "descending") : "none"} className={cx("px-3 py-2.5 font-semibold", c.numeric && "text-right", hide(c.hideBelow))}>
                    <button type="button" onClick={() => toggleSort(c.id)} className={cx("inline-flex items-center gap-1 uppercase tracking-[0.1em] hover:text-ink", sort === c.id && "text-ink")}>
                      {c.label}
                      {sort === c.id && (order === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.items.map((m) => (
                <tr key={m.user_id} className="transition hover:bg-stone-50/70">
                  <td className="px-3 py-2.5">
                    <Link href={`/u/${m.user_id}`} className="flex items-center gap-3">
                      <Avatar name={m.full_name} size={34} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-ui font-medium text-ink hover:underline">{m.full_name}</span>
                          {m.is_flagged_spam && <span className="rounded-full bg-terracotta-50 px-1.5 py-0.5 text-label font-semibold text-terracotta-600">Flagged</span>}
                        </span>
                        <span className="block truncate text-label text-stone-500">{m.email}</span>
                        <span className="num block text-label text-stone-400">{m.university_id}</span>
                        <span className="mt-1 block md:hidden"><RoleBadge role={m.role} /></span>
                      </span>
                    </Link>
                  </td>
                  <td className="hidden px-3 py-2.5 md:table-cell"><RoleBadge role={m.role} /></td>
                  <td className="hidden max-w-[200px] truncate px-3 py-2.5 text-stone-600 lg:table-cell">{m.department}</td>
                  <td className="num px-3 py-2.5 text-right text-ink">{fmtInt(m.posts)}</td>
                  <td className="num hidden px-3 py-2.5 text-right text-ink lg:table-cell">{fmtInt(m.comments)}</td>
                  <td className="num hidden px-3 py-2.5 text-right text-ink xl:table-cell">{fmtInt(m.saves)}</td>
                  <td className="num px-3 py-2.5 text-right font-semibold text-ink">{fmtInt(m.karma)}</td>
                  <td className="hidden whitespace-nowrap px-3 py-2.5 text-stone-500 lg:table-cell">{m.last_active ? relTime(m.last_active) : "—"}</td>
                </tr>
              ))}
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
    </section>
  );
}
