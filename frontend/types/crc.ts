/**
 * Shared domain types for Chanakya Research Commons.
 *
 * Two kinds of types live here:
 *  - "Wire" types mirror what backend/main.py (FastAPI + psycopg2 RealDictCursor)
 *    returns today. Field names are exact.
 *  - "View" types are what the UI consumes. For endpoints whose payload shape is
 *    not pinned down by the repository (topic-associations, researcher-archetypes,
 *    anomalies, gatekeeper) the adapters in lib/normalize.ts map whatever the
 *    backend sends onto these view types, so components never touch raw JSON.
 */

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

export type Role = "student" | "faculty" | "researcher" | "admin";

export interface Member {
  user_id: string;
  university_id: string;
  full_name: string;
  email: string;
  role: Role;
  department: string;
  bio: string | null;
  interest_tags: string[] | null;
  is_flagged_spam: boolean;
}

export interface AuthUser extends Omit<Member, "email"> {
  email?: string;
}

export interface ProfileStats {
  post_count: number;
  comment_count: number;
  karma: number;
  follower_count: number;
  following_count: number;
  saved_count: number;
}

export interface ProfileComment {
  comment_id: string;
  post_id: string;
  post_title: string;
  body: string;
  created_at: string;
}

export interface ProfilePayload {
  user: AuthUser & { created_at: string | null };
  stats: ProfileStats;
  posts: FeedPost[];
  comments: ProfileComment[];
  is_following: boolean;
}

/** Chanakya University schools, as seeded in data_pipeline/seed_database.py. */
export const SCHOOLS = [
  "Computer Science & AI",
  "Electronics & Communication",
  "Biotechnology",
  "Management & Commerce",
  "School of Law",
  "Liberal Arts & Humanities",
] as const;
export type School = (typeof SCHOOLS)[number];

/* ------------------------------------------------------------------ */
/* Papers                                                              */
/* ------------------------------------------------------------------ */

/** `authors` is JSONB in Postgres: either string[] or {name}[] depending on source. */
export type RawAuthor = string | { name?: string; display_name?: string };

export interface Paper {
  paper_id: string;
  canonical_title: string;
  abstract: string | null;
  authors: RawAuthor[] | null;
  publication_year: number | null;
  venue: string | null;
  topics: string[] | null;
  save_count: number;
  pagerank_score: number;
  in_chanakya_library?: boolean;
  /** Present on search results. */
  sources?: string[] | null;
  rrf_score?: number;
  /** Not returned by main.py today; rendered when a backend provides it. */
  doi?: string | null;
  pagerank_percentile?: number | null;
  school?: string | null;
}

export interface PaperDetail extends Paper {
  arxiv_id: string | null;
  in_chanakya_library: boolean;
  pagerank_percentile: number | null;
  cites_count: number;
  cited_by_count: number;
  references: Array<{ paper_id: string; canonical_title: string; publication_year: number | null }>;
  cited_by: Array<{ paper_id: string; canonical_title: string; publication_year: number | null }>;
  related_posts: Array<{
    post_id: string;
    title: string;
    author_name: string;
    upvote_count: number;
    comment_count: number;
    created_at: string;
  }>;
  is_saved: boolean;
  collection_id: string | null;
}

export interface HomePayload {
  stats: { papers: number; scholars: number; clusters: number; posts: number };
  featured_papers: Paper[];
  recent_posts: FeedPost[];
}

export interface SavedPaper extends Paper {
  private_notes: string | null;
  saved_at: string;
  collection_id?: string | null;
  collection_name?: string | null;
}

export interface RecommendedPaper {
  paper_id: string;
  canonical_title: string;
  publication_year: number | null;
  venue: string | null;
  topics: string[] | null;
  save_count: number;
  pagerank_score: number;
  match_score: number;
}

export interface AlsoSavedPaper {
  paper_id: string;
  canonical_title: string;
  publication_year: number | null;
  save_count: number;
}

export interface Collection {
  collection_id: string;
  name: string;
  description: string | null;
  paper_count?: number;
  papers?: Paper[];
}

/* ------------------------------------------------------------------ */
/* People & posts                                                      */
/* ------------------------------------------------------------------ */

export interface PersonMatch {
  user_id: string;
  full_name: string;
  role: Role;
  department: string;
  bio: string | null;
  interest_tags: string[] | null;
  similarity: number;
}

export interface RecommendedPerson {
  user_id: string;
  full_name: string;
  role: Role;
  department: string;
  interest_tags: string[] | null;
  match_score: number;
}

export interface FeedPost {
  post_id: string;
  author_id: string;
  title: string;
  body: string;
  tags: string[] | null;
  upvote_count: number;
  created_at: string;
  author_name: string;
  author_dept: string;
  author_role: Role;
  comment_count: number;
  my_vote: -1 | 0 | 1;
  attached_paper_title: string | null;
  attached_paper_id: string | null;
  relevance_score?: number;
}

export interface PostDetail extends FeedPost {
  author: {
    user_id: string;
    full_name: string;
    role: Role;
    department: string;
    bio: string | null;
    interest_tags: string[] | null;
    post_count: number;
  };
  attached_paper: {
    paper_id: string;
    canonical_title: string;
    authors: RawAuthor[] | null;
    venue: string | null;
    publication_year: number | null;
    pagerank_percentile: number | null;
  } | null;
}

export interface PostHit {
  post_id: string;
  title: string;
  body: string;
  tags: string[] | null;
  upvote_count: number;
  author_name: string;
  department: string;
  similarity: number;
}

export interface Comment {
  comment_id: string;
  post_id: string;
  author_id?: string;
  author_name: string;
  author_role?: Role;
  author_dept?: string;
  parent_comment_id: string | null;
  body: string;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

export interface RelatedTopic {
  topic: string;
  /** Association-rule lift (>= 1.5 for the expansion bar). */
  lift: number | null;
}

export interface SearchResponse {
  query: string;
  related_topics: RelatedTopic[];
  panels: {
    library: Paper[];
    external: Paper[];
    people: PersonMatch[];
    posts: PostHit[];
  };
}

/* ------------------------------------------------------------------ */
/* RAG assistant                                                       */
/* ------------------------------------------------------------------ */

export interface Citation {
  ref_index: number;
  paper_id: string;
  title: string;
  year: number | null;
  passage: string;
  /** Cosine similarity from the pgvector HNSW chunk search (0..1). */
  similarity: number;
}

export interface AssistantAnswer {
  question: string;
  answer: string;
  citations: Citation[];
  /** True when the backend could not reach Ollama and only passages are real. */
  degraded: boolean;
  /** "general" = the library had nothing and the model answered from its own knowledge. */
  mode?: "grounded" | "general";
}

/* ------------------------------------------------------------------ */
/* Warehouse analytics (GET /api/analytics/overview)                   */
/* ------------------------------------------------------------------ */

export interface TopicActivityRow {
  department: string;
  parent_cluster: string | null;
  topic_name: string | null;
  total_saves: number;
  total_posts: number;
  total_views: number;
}

export interface CollaborationRow {
  source_department: string;
  target_department: string;
  interactions: number;
}

export interface MonthlyTrendRow {
  year: number;
  month: number;
  month_name: string;
  saves: number;
  posts: number;
  views: number;
}

export interface AnalyticsOverview {
  topic_breakdown: TopicActivityRow[];
  cross_dept_collaboration: CollaborationRow[];
  monthly_trends: MonthlyTrendRow[];
}

export interface TrendingTopic {
  topic: string;
  recent_7d: number;
  baseline_weekly_avg: number;
  spike_ratio: number;
}

export interface FlaggedAccount {
  user_id: string;
  full_name: string;
  department: string;
  post_count: number;
  anomaly_score: number;
}

export interface TrendsAndAnomalies {
  trending_topics: TrendingTopic[];
  flagged_spam_accounts: FlaggedAccount[];
}

/* ------------------------------------------------------------------ */
/* Data-mining suite (view types, populated by lib/normalize.ts)       */
/* ------------------------------------------------------------------ */

export interface ThematicBundle {
  /** Longest non-redundant keyword set (fpmax). */
  items: string[];
  /** 0..1 */
  support: number;
  paper_count: number | null;
}

export interface AssociationRule {
  antecedents: string[];
  consequents: string[];
  /** 0..1 */
  confidence: number;
  lift: number;
  support: number | null;
}

export interface TopicAssociations {
  school: string;
  total_papers: number | null;
  bundles: ThematicBundle[];
  rules: AssociationRule[];
}

export interface ClusterSummary {
  cluster_id: number;
  label: string | null;
  size: number;
  /** Any additional numeric centroid / mean metrics, keyed by display name. */
  metrics: Record<string, number>;
  /** Discretised dominant traits, e.g. "Coauthors_High". */
  traits: string[];
}

export interface DefiningRule {
  /** Antecedent traits, e.g. ["Coauthors_High", "Breadth_High"]. */
  traits: string[];
  cluster_id: number;
  confidence: number | null;
  lift: number | null;
}

export interface ResearcherArchetypes {
  silhouette_score: number | null;
  total_researchers: number | null;
  clusters: ClusterSummary[];
  rules: DefiningRule[];
}

export type AnomalyKind = "HIGH_IMPACT_SPOTLIGHT" | "INTEGRITY_REVIEW";
export type Severity = "high" | "medium" | "low";

export interface AnomalyItem {
  id: string;
  kind: AnomalyKind;
  /** Human title: paper title / member name when available, else entity ref. */
  title: string;
  entity_ref: string;
  score: number;
  severity: Severity;
  reason: string | null;
  detected_at: string | null;
  /** Flat, display-ready facts pulled from `details` (e.g. citations, pagerank). */
  facts: Array<{ label: string; value: string }>;
}

export interface AnomalyFeed {
  spotlights: AnomalyItem[];
  integrity: AnomalyItem[];
}

export interface GatekeeperInput {
  title: string;
  abstract: string;
  author_count: number;
  reference_count: number;
  submissions_last_24h: number;
  publication_year: number;
}

export interface GatekeeperVerdict {
  flagged: boolean;
  score: number | null;
  /** Server-reported scorer latency in ms, when provided. */
  server_ms: number | null;
  /** Measured browser round-trip in ms. */
  round_trip_ms: number;
  reasons: string[];
  raw: unknown;
}
