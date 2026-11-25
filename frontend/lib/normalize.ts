/**
 * Response adapters.
 *
 * backend/main.py's committed routes have a known shape, so those adapters are
 * mostly light coercion (Postgres NUMERIC/Decimal may arrive as strings, arrays
 * may be null). The mining / anomaly / gatekeeper endpoints are not in the
 * committed repository, so their adapters accept several plausible key names and
 * map them onto the view types in types/crc.ts. If your backend uses different
 * names, extend the key lists here — components never read raw JSON.
 */
import type {
  AnalyticsOverview,
  AnomalyFeed,
  AnomalyItem,
  AnomalyKind,
  AssistantAnswer,
  AssociationRule,
  Citation,
  ClusterSummary,
  Comment,
  DefiningRule,
  FeedPost,
  GatekeeperVerdict,
  Paper,
  PersonMatch,
  PostHit,
  RelatedTopic,
  ResearcherArchetypes,
  SearchResponse,
  Severity,
  ThematicBundle,
  TopicAssociations, TopPaperRow } from "@/types/crc";

/* ------------------------------ primitives ------------------------------ */

type Rec = Record<string, unknown>;

export const isRecord = (v: unknown): v is Rec =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = num(v, NaN);
  return Number.isFinite(n) ? n : null;
}

export function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return fallback;
}

export function strOrNull(v: unknown): string | null {
  const s = str(v);
  return s === "" ? null : s;
}

/** Accepts string[], "a, b", "{a,b}", "frozenset({'a','b'})" or a JSON array string. */
export function strList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => str(x)).filter(Boolean);
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return [];
    if (t.startsWith("[")) {
      try {
        const parsed: unknown = JSON.parse(t);
        if (Array.isArray(parsed)) return strList(parsed);
      } catch {
        /* fall through */
      }
    }
    return t
      .replace(/^frozenset\(|\)$/g, "")
      .replace(/^[{(\[]|[})\]]$/g, "")
      .split(/\s*[,;]\s*|\s+\+\s+/)
      .map((s) => s.replace(/^['"]|['"]$/g, "").trim())
      .filter(Boolean);
  }
  return [];
}

/** First present key on a record. */
function pick(o: Rec, ...keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
}

/**
 * Locate an array under any of `keys`, looking one level inside wrapper objects
 * (e.g. { fpgrowth: { rules: [...] } }). Falls back to `raw` itself if it is an array.
 */
function findArray(raw: unknown, keys: string[], inner: string[] = []): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (!isRecord(raw)) return null;
  for (const k of keys) {
    const v = raw[k];
    if (Array.isArray(v)) return v;
    if (isRecord(v)) {
      for (const ik of [...inner, "items", "results", "data", "rules", "itemsets", "bundles"]) {
        if (Array.isArray(v[ik])) return v[ik] as unknown[];
      }
    }
  }
  return null;
}

/** Probabilities occasionally arrive as 0–100; fold them back into 0–1. */
export function toFraction(v: unknown): number {
  const n = num(v);
  return n > 1 && n <= 100 ? n / 100 : n;
}

export function humanize(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/* -------------------------------- papers -------------------------------- */

export function normalizePaper(raw: unknown): Paper {
  const o = isRecord(raw) ? raw : {};
  return {
    paper_id: str(o.paper_id),
    canonical_title: str(o.canonical_title, "Untitled work"),
    abstract: strOrNull(o.abstract),
    authors: Array.isArray(o.authors) ? (o.authors as Paper["authors"]) : null,
    publication_year: numOrNull(o.publication_year),
    venue: strOrNull(o.venue),
    topics: Array.isArray(o.topics) ? strList(o.topics) : null,
    save_count: num(o.save_count),
    pagerank_score: num(o.pagerank_score),
    pagerank_percentile: numOrNull(o.pagerank_percentile),
    school: strOrNull(o.school),
    in_chanakya_library: typeof o.in_chanakya_library === "boolean" ? o.in_chanakya_library : undefined,
    sources: Array.isArray(o.sources) ? strList(o.sources) : null,
    rrf_score: o.rrf_score === undefined ? undefined : num(o.rrf_score),
    doi: strOrNull(o.doi),
    item_type: o.item_type === "article" ? "article" : "paper",
    url: strOrNull(o.url),
  };
}

export function normalizeSavedPaper(raw: unknown) {
  const o = isRecord(raw) ? raw : {};
  return {
    ...normalizePaper(raw),
    private_notes: strOrNull(o.private_notes),
    saved_at: str(o.saved_at),
    collection_id: strOrNull(o.collection_id),
    collection_name: strOrNull(o.collection_name),
  };
}

export function paperList(raw: unknown): Paper[] {
  return Array.isArray(raw) ? raw.map(normalizePaper) : [];
}

/* -------------------------------- search -------------------------------- */

function normalizeRelatedTopics(raw: unknown, minLift: number): RelatedTopic[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: RelatedTopic[] = [];
  for (const item of raw) {
    let topic = "";
    let lift: number | null = null;
    if (typeof item === "string") {
      topic = item;
    } else if (isRecord(item)) {
      topic = str(pick(item, "topic", "term", "label", "keyword", "name", "consequent"));
      if (!topic) topic = strList(pick(item, "consequents", "items")).join(" · ");
      lift = numOrNull(pick(item, "lift", "lift_score"));
    }
    topic = topic.trim();
    if (!topic || seen.has(topic.toLowerCase())) continue;
    if (lift !== null && lift < minLift) continue;
    seen.add(topic.toLowerCase());
    out.push({ topic, lift });
  }
  return out.sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0)).slice(0, 10);
}

export function normalizeSearch(raw: unknown, fallbackQuery: string): SearchResponse {
  const o = isRecord(raw) ? raw : {};
  const p = isRecord(o.panels) ? o.panels : {};
  // The committed backend names these `chanakya_library` / `external_sources`;
  // the target contract names them `library` / `external`. Accept both.
  const library = pick(p, "library", "chanakya_library");
  const external = pick(p, "external", "external_sources");
  const people = Array.isArray(p.people) ? p.people : [];
  const posts = Array.isArray(p.posts) ? p.posts : [];
  const related = pick(o, "related_topics", "query_expansion", "expansions") ?? pick(p, "related_topics");

  return {
    query: str(o.query, fallbackQuery),
    related_topics: normalizeRelatedTopics(related, 1.5),
    panels: {
      papers: Array.isArray(p.papers) ? paperList(p.papers) : [...paperList(library), ...paperList(external)].sort((a, b) => (b.rrf_score ?? 0) - (a.rrf_score ?? 0)),
      library: paperList(library),
      external: paperList(external),
      people: people.map((r): PersonMatch => {
        const u = isRecord(r) ? r : {};
        return {
          user_id: str(u.user_id),
          full_name: str(u.full_name, "Unknown scholar"),
          role: str(u.role, "student") as PersonMatch["role"],
          department: str(u.department),
          bio: strOrNull(u.bio),
          interest_tags: Array.isArray(u.interest_tags) ? strList(u.interest_tags) : null,
          similarity: num(u.similarity),
          is_following: u.is_following === true,
        };
      }),
      posts: posts.map((r): PostHit => {
        const u = isRecord(r) ? r : {};
        return {
          post_id: str(u.post_id),
          title: str(u.title),
          body: str(u.body),
          tags: Array.isArray(u.tags) ? strList(u.tags) : null,
          upvote_count: num(u.upvote_count),
          author_name: str(u.author_name),
          department: str(u.department),
          similarity: num(u.similarity),
          author_id: strOrNull(u.author_id) ?? undefined,
          created_at: strOrNull(u.created_at),
          comment_count: u.comment_count === undefined ? undefined : num(u.comment_count),
          attached_paper_id: strOrNull(u.attached_paper_id),
          attached_paper_title: strOrNull(u.attached_paper_title),
        };
      }),
    },
  };
}

/* --------------------------------- feed --------------------------------- */

export function normalizeFeed(raw: unknown): FeedPost[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r): FeedPost => {
    const u = isRecord(r) ? r : {};
    return {
      post_id: str(u.post_id),
      author_id: str(u.author_id),
      title: str(u.title),
      body: str(u.body),
      tags: Array.isArray(u.tags) ? strList(u.tags) : null,
      upvote_count: num(u.upvote_count),
      created_at: str(u.created_at),
      edited_at: strOrNull(u.edited_at),
      author_name: str(u.author_name, "Unknown"),
      author_dept: str(u.author_dept),
      author_role: str(u.author_role, "student") as FeedPost["author_role"],
      comment_count: num(u.comment_count),
      my_vote: ([-1, 0, 1].includes(num(u.my_vote)) ? num(u.my_vote) : 0) as FeedPost["my_vote"],
      attached_paper_title: strOrNull(u.attached_paper_title),
      attached_paper_id: strOrNull(u.attached_paper_id),
      relevance_score: u.relevance_score === undefined ? undefined : num(u.relevance_score),
      under_review: u.under_review === true,
      author_followed: u.author_followed === true,
      topic_followed: u.topic_followed === true,
    };
  });
}

export function normalizeComments(raw: unknown, postId: string): Comment[] {
  const list = findArray(raw, ["comments", "items", "results"]) ?? [];
  return list.map((r): Comment => {
    const u = isRecord(r) ? r : {};
    return {
      comment_id: str(u.comment_id),
      post_id: str(u.post_id, postId),
      author_id: strOrNull(u.author_id) ?? undefined,
      author_name: str(pick(u, "author_name", "full_name", "author"), "Member"),
      author_role: str(u.author_role, "student") as Comment["author_role"],
      author_dept: strOrNull(pick(u, "author_dept", "department")) ?? undefined,
      parent_comment_id: strOrNull(u.parent_comment_id),
      body: str(u.body),
      created_at: str(u.created_at),
      edited_at: strOrNull(u.edited_at),
      is_deleted: u.is_deleted === true,
    };
  });
}

/* ------------------------------- assistant ------------------------------ */

const DEGRADED = /^(local llm unavailable|ollama error|model returned an empty)/i;

export function normalizeAssistant(raw: unknown, question: string): AssistantAnswer {
  const o = isRecord(raw) ? raw : {};
  const answer = str(pick(o, "answer", "response", "text"), "");
  const cites = findArray(o, ["citations", "sources", "passages", "evidence"]) ?? [];
  const citations = cites.map((c, i): Citation => {
    const u = isRecord(c) ? c : {};
    return {
      ref_index: num(pick(u, "ref_index", "index", "ref"), i + 1),
      paper_id: str(u.paper_id),
      title: str(pick(u, "title", "canonical_title"), "Untitled source"),
      year: numOrNull(pick(u, "year", "publication_year")),
      passage: str(pick(u, "passage", "chunk_text", "text")),
      similarity: num(pick(u, "similarity", "score")),
    };
  });
  return {
    question: str(o.question, question),
    answer,
    citations,
    degraded: o.degraded === true || DEGRADED.test(answer.trim()),
    mode: o.mode === "general" ? "general" : "grounded",
  };
}

/* ------------------------------- analytics ------------------------------ */

export function normalizeOverview(raw: unknown): AnalyticsOverview {
  const o = isRecord(raw) ? raw : {};
  const arr = (k: string) => (Array.isArray(o[k]) ? (o[k] as unknown[]) : []);
  return {
    topic_breakdown: arr("topic_breakdown").map((r) => {
      const u = isRecord(r) ? r : {};
      return {
        department: str(u.department),
        parent_cluster: strOrNull(u.parent_cluster),
        topic_name: strOrNull(u.topic_name),
        total_saves: num(u.total_saves),
        total_posts: num(u.total_posts),
        total_views: num(u.total_views),
      };
    }),
    cross_dept_collaboration: arr("cross_dept_collaboration").map((r) => {
      const u = isRecord(r) ? r : {};
      return {
        source_department: str(u.source_department),
        target_department: str(u.target_department),
        interactions: num(u.interactions),
      };
    }),
    monthly_trends: arr("monthly_trends").map((r) => {
      const u = isRecord(r) ? r : {};
      return {
        year: num(u.year),
        month: num(u.month),
        month_name: str(u.month_name),
        saves: num(u.saves),
        posts: num(u.posts),
        views: num(u.views),
      };
    }),
    topic_trends: arr("topic_trends").map((r) => {
      const u = isRecord(r) ? r : {};
      return { year: num(u.year), month: num(u.month), month_name: str(u.month_name), topic_name: str(u.topic_name), activity: num(u.activity) };
    }),
    top_saved_papers: arr("top_saved_papers").map(topPaper),
    top_discussed_papers: arr("top_discussed_papers").map(topPaper),
  };
}

function topPaper(r: unknown): TopPaperRow {
  const u = isRecord(r) ? r : {};
  const opt = (k: string) => (u[k] === undefined ? undefined : num(u[k]));
  return {
    paper_id: str(u.paper_id),
    canonical_title: str(u.canonical_title, "Untitled work"),
    publication_year: numOrNull(u.publication_year),
    item_type: u.item_type === "article" ? "article" : "paper",
    saves: opt("saves"),
    posts: opt("posts"),
    comments: opt("comments"),
    discussion: opt("discussion"),
  };
}

export const MIN_RULE_LIFT = 1.2;

function normalizeBundle(r: unknown): ThematicBundle | null {
  const u = isRecord(r) ? r : Array.isArray(r) ? { items: r } : null;
  if (!u) return null;
  const items = strList(pick(u, "itemset", "items", "keywords", "bundle", "topics", "itemsets"));
  if (items.length === 0) return null;
  return {
    items,
    support: toFraction(pick(u, "support", "support_pct", "freq")),
    paper_count: numOrNull(pick(u, "paper_count", "count", "n_papers", "papers", "support_count")),
  };
}

function normalizeRule(r: unknown): AssociationRule | null {
  if (!isRecord(r)) return null;
  const antecedents = strList(pick(r, "antecedents", "antecedent", "if", "lhs"));
  const consequents = strList(pick(r, "consequents", "consequent", "then", "rhs"));
  if (!antecedents.length || !consequents.length) return null;
  return {
    antecedents,
    consequents,
    confidence: toFraction(r.confidence),
    lift: num(r.lift),
    support: r.support === undefined ? null : toFraction(r.support),
  };
}

export function normalizeTopicAssociations(raw: unknown, school: string): TopicAssociations {
  const o = isRecord(raw) ? raw : {};
  const bundleArr =
    findArray(o, ["maximal_itemsets", "fpmax", "maximal_bundles", "maximal", "thematic_bundles", "bundles"], ["itemsets"]) ?? [];
  const ruleArr =
    findArray(o, ["rules", "fpgrowth", "association_rules", "high_lift_rules", "associations"], ["rules"]) ?? [];

  const bundles = bundleArr
    .map(normalizeBundle)
    .filter((b): b is ThematicBundle => b !== null)
    .sort((a, b) => b.items.length - a.items.length || b.support - a.support);

  const rules = ruleArr
    .map(normalizeRule)
    .filter((r): r is AssociationRule => r !== null && r.lift >= MIN_RULE_LIFT)
    .sort((a, b) => b.lift - a.lift);

  return {
    school: str(o.school ?? o.department, school),
    total_papers: numOrNull(pick(o, "total_papers", "n_papers", "paper_count", "n_transactions", "transactions")),
    bundles,
    rules,
  };
}

/** "Coauthors_High + Breadth_High → Cluster 2" */
function parseRuleString(s: string): DefiningRule | null {
  const m = s.match(/^(.*?)\s*(?:→|->|=>|⇒)\s*(?:cluster\s*)?#?(\d+)/i);
  if (!m) return null;
  const conf = s.match(/conf(?:idence)?\s*[=:]\s*([\d.]+)/i);
  const lift = s.match(/lift\s*[=:]\s*([\d.]+)/i);
  return {
    traits: m[1].split(/\s*(?:\+|&|,|\band\b)\s*/i).map((t) => t.trim()).filter(Boolean),
    cluster_id: Number(m[2]),
    confidence: conf ? toFraction(conf[1]) : null,
    lift: lift ? Number(lift[1]) : null,
  };
}

function normalizeDefiningRules(raw: unknown): DefiningRule[] {
  const out: DefiningRule[] = [];
  const push = (r: unknown, clusterHint?: number) => {
    if (typeof r === "string") {
      const parsed = parseRuleString(r);
      if (parsed) out.push(parsed);
      else if (clusterHint !== undefined) {
        out.push({ traits: strList(r), cluster_id: clusterHint, confidence: null, lift: null });
      }
      return;
    }
    if (!isRecord(r)) return;
    const rule = pick(r, "rule", "text", "description");
    if (typeof rule === "string" && parseRuleString(rule)) {
      const p = parseRuleString(rule)!;
      out.push({
        ...p,
        confidence: p.confidence ?? numOrNull(r.confidence) ?? null,
        lift: p.lift ?? numOrNull(r.lift),
      });
      return;
    }
    const traits = strList(pick(r, "traits", "antecedents", "antecedent", "if", "conditions"));
    const cid = numOrNull(pick(r, "cluster_id", "cluster", "consequent", "consequents", "archetype")) ?? clusterHint;
    if (!traits.length || cid === null || cid === undefined) return;
    out.push({
      traits,
      cluster_id: cid,
      confidence: r.confidence === undefined ? null : toFraction(r.confidence),
      lift: numOrNull(r.lift),
    });
  };

  if (Array.isArray(raw)) raw.forEach((r) => push(r));
  else if (isRecord(raw)) {
    // { "2": ["Coauthors_High + Breadth_High", ...] }
    for (const [k, v] of Object.entries(raw)) {
      const hint = numOrNull(k.replace(/\D/g, "")) ?? undefined;
      (Array.isArray(v) ? v : [v]).forEach((r) => push(r, hint));
    }
  }
  return out;
}

const CLUSTER_ID_KEYS = ["cluster_id", "cluster", "id", "label_id"];
const SIZE_KEYS = ["size", "n", "count", "n_members", "members", "n_researchers", "researchers"];

function normalizeClusters(raw: unknown): ClusterSummary[] {
  let list: Array<[string | null, unknown]> = [];
  if (Array.isArray(raw)) list = raw.map((r) => [null, r]);
  else if (isRecord(raw)) list = Object.entries(raw);

  const out: ClusterSummary[] = [];
  list.forEach(([key, r], i) => {
    if (!isRecord(r)) return;
    const id = numOrNull(pick(r, ...CLUSTER_ID_KEYS)) ?? numOrNull(key?.replace(/\D/g, "")) ?? i;
    const size = num(pick(r, ...SIZE_KEYS));
    const metrics: Record<string, number> = {};
    const skip = new Set([...CLUSTER_ID_KEYS, ...SIZE_KEYS, "silhouette", "silhouette_score"]);
    const ingest = (src: Rec) => {
      for (const [k, v] of Object.entries(src)) {
        if (skip.has(k)) continue;
        const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
        if (Number.isFinite(n)) metrics[humanize(k)] = n;
      }
    };
    ingest(r);
    for (const nested of ["centroid", "means", "mean", "profile", "metrics", "avg"]) {
      if (isRecord(r[nested])) ingest(r[nested] as Rec);
    }
    out.push({
      cluster_id: id,
      label: strOrNull(pick(r, "label", "name", "archetype", "title")),
      size,
      metrics,
      traits: strList(pick(r, "traits", "top_traits", "dominant_traits", "signature")),
    });
  });
  return out.sort((a, b) => a.cluster_id - b.cluster_id);
}

export function normalizeArchetypes(raw: unknown): ResearcherArchetypes {
  const o = isRecord(raw) ? raw : {};
  const clusters = normalizeClusters(pick(o, "cluster_summaries", "clusters", "archetypes", "summaries"));
  const total = numOrNull(pick(o, "total_researchers", "n_researchers", "n_samples", "n_members"));
  return {
    silhouette_score: numOrNull(pick(o, "silhouette_score", "silhouette")),
    total_researchers: total ?? (clusters.length ? clusters.reduce((s, c) => s + c.size, 0) : null),
    clusters,
    rules: normalizeDefiningRules(pick(o, "defining_rules", "rules", "trait_rules")),
  };
}

/* -------------------------------- anomalies ----------------------------- */

const FACT_LABELS: Record<string, string> = {
  citation_count: "Citations",
  citations: "Citations",
  pagerank: "PageRank",
  pagerank_score: "PageRank",
  citation_percentile: "Citation pctl",
  velocity: "Velocity",
  submissions_last_24h: "Submissions / 24h",
  author_count: "Authors",
  reference_count: "References",
  publication_year: "Year",
};
const TITLE_KEYS = ["title", "paper_title", "canonical_title", "name", "full_name", "headline"];
const REASON_KEYS = ["reason", "explanation", "message", "flag", "summary", "note", "description"];
const DETAIL_SKIP = new Set([...TITLE_KEYS, ...REASON_KEYS, "severity", "severity_label", "kind", "type", "paper_id", "user_id"]);

function detectKind(item: Rec, bucket: AnomalyKind | null): AnomalyKind {
  const tag = str(pick(item, "alert_type", "type", "kind", "category", "label")).toUpperCase();
  if (/IMPACT|SPOTLIGHT|BREAKOUT/.test(tag)) return "HIGH_IMPACT_SPOTLIGHT";
  if (/INTEGRITY|REVIEW|METADATA|WATCH|SUSPECT/.test(tag)) return "INTEGRITY_REVIEW";
  return bucket ?? "INTEGRITY_REVIEW";
}

function formatFact(v: unknown): string | null {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    if (Math.abs(v) > 0 && Math.abs(v) < 0.01) return v.toExponential(2);
    return Number.isInteger(v) ? v.toLocaleString("en-IN") : v.toFixed(3);
  }
  if (typeof v === "string" && v.length <= 40) return v;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return null;
}

function severityFromScore(score: number, max: number): Severity {
  const rel = max > 1 ? score / max : score;
  if (rel >= 0.75) return "high";
  if (rel >= 0.45) return "medium";
  return "low";
}

export function normalizeAnomalies(raw: unknown): AnomalyFeed {
  const buckets: Array<{ kind: AnomalyKind | null; items: unknown[] }> = [];
  if (Array.isArray(raw)) buckets.push({ kind: null, items: raw });
  else if (isRecord(raw)) {
    let matched = false;
    for (const [k, v] of Object.entries(raw)) {
      if (!Array.isArray(v)) continue;
      const up = k.toUpperCase();
      if (/SPOTLIGHT|IMPACT|BREAKOUT/.test(up)) {
        buckets.push({ kind: "HIGH_IMPACT_SPOTLIGHT", items: v });
        matched = true;
      } else if (/INTEGRITY|REVIEW|WATCHLIST/.test(up)) {
        buckets.push({ kind: "INTEGRITY_REVIEW", items: v });
        matched = true;
      }
    }
    if (!matched) {
      const flat = findArray(raw, ["anomalies", "alerts", "items", "results", "data"]);
      if (flat) buckets.push({ kind: null, items: flat });
    }
  }

  const items: AnomalyItem[] = [];
  const explicit = new Set<string>();
  for (const b of buckets) {
    b.items.forEach((r, i) => {
      if (!isRecord(r)) return;
      let details: Rec = {};
      const d = r.details;
      if (isRecord(d)) details = d;
      else if (typeof d === "string") {
        try {
          const parsed: unknown = JSON.parse(d);
          if (isRecord(parsed)) details = parsed;
        } catch {
          /* ignore */
        }
      }
      const merged: Rec = { ...r, ...details };
      const entity = str(pick(merged, "entity_ref", "entity", "paper_id", "user_id", "id"), `item-${i}`);
      const score = num(pick(merged, "severity_score", "anomaly_score", "score", "impact_score"));
      const title = str(pick(merged, ...TITLE_KEYS), entity);
      const facts: AnomalyItem["facts"] = [];
      for (const [k, v] of Object.entries(details)) {
        if (DETAIL_SKIP.has(k)) continue;
        const f = formatFact(v);
        if (f !== null) facts.push({ label: FACT_LABELS[k] ?? humanize(k), value: f });
        if (facts.length >= 4) break;
      }
      const sevText = str(pick(merged, "severity", "severity_label")).toLowerCase();
      const id = str(r.alert_id, `${b.kind ?? "x"}-${entity}-${i}`);
      if (sevText === "high" || sevText === "medium" || sevText === "low") explicit.add(id);
      items.push({
        id,
        kind: detectKind(merged, b.kind),
        title,
        entity_ref: entity,
        score,
        severity: sevText === "high" || sevText === "medium" || sevText === "low" ? sevText : "low",
        reason: strOrNull(pick(merged, ...REASON_KEYS)),
        detected_at: strOrNull(pick(merged, "detected_at", "created_at", "timestamp")),
        facts,
      });
    });
  }

  // Severity for items that didn't state one: relative to the integrity batch.
  const integrityMax = Math.max(0, ...items.filter((i) => i.kind === "INTEGRITY_REVIEW").map((i) => i.score));
  for (const it of items) {
    if (!explicit.has(it.id)) it.severity = severityFromScore(it.score, integrityMax);
  }

  const byScore = (a: AnomalyItem, b: AnomalyItem) => b.score - a.score;
  return {
    spotlights: items.filter((i) => i.kind === "HIGH_IMPACT_SPOTLIGHT").sort(byScore),
    integrity: items.filter((i) => i.kind === "INTEGRITY_REVIEW").sort(byScore),
  };
}

/* ------------------------------- gatekeeper ----------------------------- */

export function normalizeGatekeeper(raw: unknown, roundTripMs: number): GatekeeperVerdict {
  const o = isRecord(raw) ? raw : {};
  let flagged = false;
  const boolKey = pick(o, "is_anomaly", "is_anomalous", "flagged", "anomalous", "reject", "needs_review", "is_outlier");
  if (typeof boolKey === "boolean") flagged = boolKey;
  else {
    const pred = pick(o, "prediction", "label");
    const text = str(pick(o, "decision", "verdict", "status", "result", "label"));
    if (typeof pred === "number") flagged = pred === -1;
    else if (text) flagged = /review|flag|anomal|reject|suspicious|outlier|hold/i.test(text);
  }
  const reasons = strList(pick(o, "reasons", "flags", "explanations", "triggers"));
  const single = str(pick(o, "reason", "explanation", "message"));
  if (single && !reasons.length) reasons.push(single);
  return {
    flagged,
    score: numOrNull(pick(o, "anomaly_score", "score", "severity_score")),
    server_ms: numOrNull(pick(o, "latency_ms", "inference_ms", "elapsed_ms", "scoring_ms", "took_ms")),
    round_trip_ms: roundTripMs,
    reasons,
    raw,
  };
}
