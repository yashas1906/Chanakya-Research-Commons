import { SCHOOL_CODES, type RawAuthor } from "@/types/crc";

const INT = new Intl.NumberFormat("en-IN");
const COMPACT_INT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
export const fmtInt = (n: number) => INT.format(Math.round(n));
export const fmtCount = (n: number) => COMPACT_INT.format(Math.round(n));

/** 0.4231 -> "42%"; digits optional. */
export const fmtPct = (fraction: number, digits = 0) => `${(fraction * 100).toFixed(digits)}%`;

export const fmtLift = (lift: number) => `${lift.toFixed(2)}×`;

export function pagerankTier(percentile: number | null | undefined): string {
  if (percentile == null) return "Unranked";
  if (percentile >= 0.99) return "Top 1%";
  if (percentile >= 0.9) return "Top 10%";
  if (percentile >= 0.75) return "Top 25%";
  if (percentile >= 0.5) return "Mid";
  return "Long tail";
}

/** PageRank scores are tiny probabilities; show them in a stable, scannable form. */
export function fmtPagerank(score: number): string {
  if (!Number.isFinite(score) || score <= 0) return "—";
  if (score >= 0.01) return score.toFixed(4);
  return score.toExponential(1).replace("e-", "e−");
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function initials(name: string): string {
  const parts = name.replace(/^(dr|prof|mr|ms|mrs)\.?\s+/i, "").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function authorNames(authors: RawAuthor[] | null | undefined): string[] {
  if (!authors) return [];
  return authors
    .map((a) => (typeof a === "string" ? a : (a?.name ?? a?.display_name ?? "")))
    .filter((s): s is string => Boolean(s));
}

export function authorsLine(authors: RawAuthor[] | null | undefined, max = 3): string {
  const names = authorNames(authors);
  if (names.length === 0) return "";
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max}`;
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Names used before the move to the six official schools; they keep rendering sensibly until the data is migrated. */
const LEGACY_SCHOOL: Record<string, string> = {
  "Computer Science & AI": "SOE",
  "Electronics & Communication": "SOE",
  Biotechnology: "SBS",
  "Management & Commerce": "SMS",
  "School of Law": "SLGPP",
  "Liberal Arts & Humanities": "SAHSS",
};

/** Short school code (SOE, SBS, ...) for compact chips. Unknown names are returned unchanged. */
export function shortSchool(s: string): string {
  return (SCHOOL_CODES as Record<string, string>)[s] ?? LEGACY_SCHOOL[s] ?? s;
}

/** "SOE · Engineering": the code plus the school name, for filter lists that have room for both. */
export function schoolLabel(s: string): string {
  const code = shortSchool(s);
  return code === s ? s : `${code} · ${s.replace(/^School of /, "")}`;
}
