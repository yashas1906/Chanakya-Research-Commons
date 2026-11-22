/**
 * Typed client for the CRC FastAPI backend.
 *
 * Routes marked [committed] exist in backend/main.py today. Routes marked
 * [contract] come from the product brief (mining / anomaly services) and are not in
 * the committed repository; their paths live in ENDPOINTS so they are a one-line fix
 * if your backend names them differently. A missing route surfaces as
 * ApiError{kind:"unsupported"} and the UI renders an honest "not available" state.
 */
import {
  normalizeAnomalies,
  normalizeArchetypes,
  normalizeAssistant,
  normalizeComments,
  normalizeFeed,
  normalizeGatekeeper,
  normalizeOverview,
  normalizeSavedPaper,
  normalizeSearch,
  normalizeTopicAssociations,
  isRecord,
  num,
  paperList,
  str,
} from "@/lib/normalize";
import type {
  AlsoSavedPaper,
  AnalyticsOverview,
  AnomalyFeed,
  AssistantAnswer,
  Collection,
  Comment,
  FeedPost,
  GatekeeperInput,
  GatekeeperVerdict,
  Member,
  Paper,
  RecommendedPaper,
  RecommendedPerson,
  ResearcherArchetypes,
  SavedPaper,
  SearchResponse,
  TopicAssociations,
  TrendsAndAnomalies,
} from "@/types/crc";

export const API_ORIGIN = (process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8000").replace(/\/$/, "");
export const API_BASE = `${API_ORIGIN}/api`;

/** Candidate paths are tried in order; the first that is not 404/405 wins. */
export const ENDPOINTS = {
  assistant: ["/assistant/ask", "/rag/query"], // [committed] / [contract]
  topicAssociations: ["/analytics/topic-associations"], // [contract]
  researcherArchetypes: ["/analytics/researcher-archetypes"], // [contract]
  anomalies: ["/analytics/anomalies"], // [contract]
  gatekeeper: ["/analytics/gatekeeper", "/analytics/anomalies/score", "/analytics/gatekeeper/score"], // [contract]
  upvote: (postId: string) => `/posts/${postId}/upvote`, // [contract]
  comments: (postId: string) => `/posts/${postId}/comments`, // [contract]
  collections: "/collections", // [contract]
} as const;

/* -------------------------------- errors -------------------------------- */

export type ApiErrorKind = "network" | "unsupported" | "http";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly path: string;

  constructor(kind: ApiErrorKind, message: string, path: string, status: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.path = path;
  }
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

export function describeError(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}

/* ------------------------------- transport ------------------------------ */

interface ReqOptions {
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: ReqOptions["query"]): string {
  const url = new URL(`${API_BASE}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function request(path: string, opts: ReqOptions = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? "GET",
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      cache: "no-store",
    });
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new ApiError(
      "network",
      `Can't reach the CRC API at ${API_ORIGIN}. Start the backend (uvicorn backend.main:app --port 8000) and retry.`,
      path,
    );
  }

  if (res.status === 404 || res.status === 405) {
    // A FastAPI HTTPException(404, "User not found") is a real answer, not a missing route.
    const detail = await safeDetail(res);
    if (detail && detail !== "Not Found") throw new ApiError("http", detail, path, res.status);
    throw new ApiError("unsupported", "This backend doesn’t expose that endpoint yet.", path, res.status);
  }
  if (!res.ok) {
    const detail = await safeDetail(res);
    throw new ApiError("http", detail ?? `Request failed (${res.status}).`, path, res.status);
  }
  if (res.status === 204) return null;
  try {
    return await res.json();
  } catch {
    throw new ApiError("http", "The backend returned an unreadable response.", path, res.status);
  }
}

async function safeDetail(res: Response): Promise<string | null> {
  try {
    const j: unknown = await res.json();
    if (isRecord(j)) {
      if (typeof j.detail === "string") return j.detail;
      if (Array.isArray(j.detail) && isRecord(j.detail[0]) && typeof j.detail[0].msg === "string") return j.detail[0].msg;
    }
  } catch {
    /* not json */
  }
  return null;
}

/** Try each candidate path until one is not "unsupported". */
async function requestFirst(paths: readonly string[], opts: ReqOptions): Promise<unknown> {
  let last: ApiError | null = null;
  for (const p of paths) {
    try {
      return await request(p, opts);
    } catch (e) {
      if (e instanceof ApiError && e.kind === "unsupported") {
        last = e;
        continue;
      }
      throw e;
    }
  }
  throw last ?? new ApiError("unsupported", "No matching endpoint.", paths[0] ?? "");
}

/* -------------------------------- members ------------------------------- */

export async function getMembers(limit = 60, signal?: AbortSignal): Promise<Member[]> {
  const raw = await request("/users", { query: { limit }, signal });
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r): Member => {
      const u = isRecord(r) ? r : {};
      return {
        user_id: str(u.user_id),
        university_id: str(u.university_id),
        full_name: str(u.full_name),
        email: str(u.email),
        role: str(u.role, "student") as Member["role"],
        department: str(u.department),
        bio: typeof u.bio === "string" ? u.bio : null,
        interest_tags: Array.isArray(u.interest_tags) ? (u.interest_tags as string[]) : null,
        is_flagged_spam: u.is_flagged_spam === true,
      };
    })
    .filter((m) => m.user_id && !m.is_flagged_spam);
}

/* --------------------------------- search ------------------------------- */

export async function search(q: string, signal?: AbortSignal): Promise<SearchResponse> {
  const raw = await request("/search", { query: { q, limit: 8 }, signal });
  return normalizeSearch(raw, q);
}

/* ---------------------------------- feed -------------------------------- */

export async function getFeed(userId: string | null, signal?: AbortSignal): Promise<FeedPost[]> {
  return normalizeFeed(await request("/feed", { query: { user_id: userId, limit: 40 }, signal }));
}

export async function createPost(input: {
  author_id: string;
  title: string;
  body: string;
  tags: string[];
  attached_paper_id?: string | null;
}): Promise<void> {
  await request("/posts", { method: "POST", body: input });
}

/** Optimistic-UI friendly: resolves with the server's count when it returns one. */
export async function toggleUpvote(postId: string, userId: string): Promise<{ upvote_count: number | null }> {
  const raw = await request(ENDPOINTS.upvote(postId), { method: "POST", body: { user_id: userId } });
  const o = isRecord(raw) ? raw : {};
  return { upvote_count: o.upvote_count === undefined ? null : num(o.upvote_count) };
}

export async function getComments(postId: string, signal?: AbortSignal): Promise<Comment[]> {
  return normalizeComments(await request(ENDPOINTS.comments(postId), { signal }), postId);
}

export async function addComment(
  postId: string,
  input: { author_id: string; body: string; parent_comment_id?: string | null },
): Promise<void> {
  await request(ENDPOINTS.comments(postId), { method: "POST", body: input });
}

/* --------------------------------- library ------------------------------ */

export async function getHoldings(limit = 40, signal?: AbortSignal): Promise<Paper[]> {
  return paperList(await request("/library", { query: { limit }, signal }));
}

export async function getSaves(userId: string, signal?: AbortSignal): Promise<SavedPaper[]> {
  const raw = await request("/library", { query: { user_id: userId, limit: 100 }, signal });
  return Array.isArray(raw) ? raw.map(normalizeSavedPaper) : [];
}

export async function savePaper(userId: string, paperId: string, notes = ""): Promise<void> {
  await request("/library/save", {
    method: "POST",
    body: { user_id: userId, paper_id: paperId, private_notes: notes },
  });
}

export async function getCollections(userId: string, signal?: AbortSignal): Promise<Collection[]> {
  const raw = await request(ENDPOINTS.collections, { query: { user_id: userId }, signal });
  const list = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.collections) ? raw.collections : [];
  return list.map((r): Collection => {
    const u = isRecord(r) ? r : {};
    return {
      collection_id: str(u.collection_id),
      name: str(u.name, "Untitled collection"),
      description: typeof u.description === "string" ? u.description : null,
      paper_count: u.paper_count === undefined ? undefined : num(u.paper_count),
      papers: Array.isArray(u.papers) ? paperList(u.papers) : undefined,
    };
  });
}

export async function getRecommendations(
  userId: string,
  signal?: AbortSignal,
): Promise<{ papers: RecommendedPaper[]; people: RecommendedPerson[] }> {
  const raw = await request(`/recommendations/${userId}`, { signal });
  const o = isRecord(raw) ? raw : {};
  const papers = Array.isArray(o.recommended_papers) ? o.recommended_papers : [];
  const people = Array.isArray(o.recommended_people) ? o.recommended_people : [];
  return {
    papers: papers.map((r): RecommendedPaper => {
      const u = isRecord(r) ? r : {};
      return {
        paper_id: str(u.paper_id),
        canonical_title: str(u.canonical_title),
        publication_year: u.publication_year === null ? null : num(u.publication_year),
        venue: typeof u.venue === "string" ? u.venue : null,
        topics: Array.isArray(u.topics) ? (u.topics as string[]) : null,
        save_count: num(u.save_count),
        pagerank_score: num(u.pagerank_score),
        match_score: num(u.match_score),
      };
    }),
    people: people.map((r): RecommendedPerson => {
      const u = isRecord(r) ? r : {};
      return {
        user_id: str(u.user_id),
        full_name: str(u.full_name),
        role: str(u.role, "student") as RecommendedPerson["role"],
        department: str(u.department),
        interest_tags: Array.isArray(u.interest_tags) ? (u.interest_tags as string[]) : null,
        match_score: num(u.match_score),
      };
    }),
  };
}

export async function getAlsoSaved(paperId: string, signal?: AbortSignal): Promise<AlsoSavedPaper[]> {
  const raw = await request(`/papers/${paperId}/also-saved`, { signal });
  if (!Array.isArray(raw)) return [];
  return raw.map((r): AlsoSavedPaper => {
    const u = isRecord(r) ? r : {};
    return {
      paper_id: str(u.paper_id),
      canonical_title: str(u.canonical_title),
      publication_year: u.publication_year === null ? null : num(u.publication_year),
      save_count: num(u.save_count),
    };
  });
}

/* -------------------------------- assistant ----------------------------- */

export async function askAssistant(
  question: string,
  libraryOnly: boolean,
  signal?: AbortSignal,
): Promise<AssistantAnswer> {
  const raw = await requestFirst(ENDPOINTS.assistant, {
    method: "POST",
    // `query` is sent alongside `question` so the alternate /rag/query contract also validates.
    body: { question, query: question, library_only: libraryOnly },
    signal,
  });
  return normalizeAssistant(raw, question);
}

/* -------------------------------- analytics ----------------------------- */

export async function getOverview(department: string | null, signal?: AbortSignal): Promise<AnalyticsOverview> {
  return normalizeOverview(await request("/analytics/overview", { query: { department }, signal }));
}

export async function getTrends(signal?: AbortSignal): Promise<TrendsAndAnomalies> {
  const raw = await request("/trends-and-anomalies", { signal });
  const o = isRecord(raw) ? raw : {};
  const topics = Array.isArray(o.trending_topics) ? o.trending_topics : [];
  const flagged = Array.isArray(o.flagged_spam_accounts) ? o.flagged_spam_accounts : [];
  return {
    trending_topics: topics.map((r) => {
      const u = isRecord(r) ? r : {};
      return {
        topic: str(u.topic),
        recent_7d: num(u.recent_7d),
        baseline_weekly_avg: num(u.baseline_weekly_avg),
        spike_ratio: num(u.spike_ratio),
      };
    }),
    flagged_spam_accounts: flagged.map((r) => {
      const u = isRecord(r) ? r : {};
      return {
        user_id: str(u.user_id),
        full_name: str(u.full_name),
        department: str(u.department),
        post_count: num(u.post_count),
        anomaly_score: num(u.anomaly_score),
      };
    }),
  };
}

/** `school` = "ALL" or one of SCHOOLS. Sent as both `school` and `department` (the committed analytics route uses `department`). */
export async function getTopicAssociations(school: string, signal?: AbortSignal): Promise<TopicAssociations> {
  const scoped = school === "ALL" ? undefined : school;
  const raw = await requestFirst(ENDPOINTS.topicAssociations, {
    query: { school: scoped, department: scoped },
    signal,
  });
  return normalizeTopicAssociations(raw, school);
}

export async function getResearcherArchetypes(signal?: AbortSignal): Promise<ResearcherArchetypes> {
  return normalizeArchetypes(await requestFirst(ENDPOINTS.researcherArchetypes, { signal }));
}

export async function getAnomalies(signal?: AbortSignal): Promise<AnomalyFeed> {
  return normalizeAnomalies(await requestFirst(ENDPOINTS.anomalies, { signal }));
}

export async function scoreSubmission(input: GatekeeperInput, signal?: AbortSignal): Promise<GatekeeperVerdict> {
  const t0 = performance.now();
  const raw = await requestFirst(ENDPOINTS.gatekeeper, {
    method: "POST",
    body: {
      ...input,
      // Derived features most scorers want, so the tester works with either feature set.
      title_length: input.title.length,
      abstract_length: input.abstract.length,
    },
    signal,
  });
  return normalizeGatekeeper(raw, Math.round((performance.now() - t0) * 10) / 10);
}
