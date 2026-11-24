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
  normalizePaper,
  normalizeOverview,
  normalizeSavedPaper,
  normalizeSearch,
  normalizeTopicAssociations,
  isRecord,
  num,
  paperList,
  str,
  strOrNull,
} from "@/lib/normalize";
import type {
  AlsoSavedPaper,
  AnalyticsOverview,
  AuthUser,
  AnomalyFeed,
  AssistantAnswer,
  Citation,
  Collection,
  Comment,
  FeedPost,
  GatekeeperInput,
  GatekeeperVerdict,
  Member,
  Paper,
  PaperDetail,
  HomePayload,
  PostDetail,
  ProfileComment,
  ProfilePayload,
  RecommendedPaper,
  RecommendedPerson,
  ResearcherArchetypes,
  SavedPaper,
  SearchResponse,
  TopicAssociations,
  TrendsAndAnomalies,
  AdminOverview,
  AdminMembersPage,
  AdminMember,
  AdminMemberSort,
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
  upvote: (postId: string) => `/posts/${postId}/upvote`,
  vote: (postId: string) => `/posts/${postId}/vote`,
  comments: (postId: string) => `/posts/${postId}/comments`, // [contract]
  collections: "/collections",
} as const;

/* -------------------------------- errors -------------------------------- */

export type ApiErrorKind = "network" | "unsupported" | "http" | "unauthorized" | "forbidden";

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
  method?: "GET" | "POST" | "DELETE";
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
  let token: string | null = null;
  try {
    token = typeof window === "undefined" ? null : window.localStorage.getItem("crc.auth.token");
  } catch {
    token = null;
  }
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? "GET",
      headers,
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
  if (res.status === 401 || res.status === 403) {
    const detail = await safeDetail(res);
    if (res.status === 401 && token && !path.endsWith("/auth/login") && typeof window !== "undefined") {
      window.dispatchEvent(new Event("crc:auth-expired"));
    }
    throw new ApiError(
      res.status === 401 ? "unauthorized" : "forbidden",
      detail ?? (res.status === 401 ? "Sign in to continue." : "You don’t have permission to do that."),
      path,
      res.status,
    );
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

function parseAuthUser(raw: unknown): AuthUser {
  const u = isRecord(raw) ? raw : {};
  return {
    user_id: str(u.user_id),
    university_id: str(u.university_id),
    full_name: str(u.full_name),
    email: strOrNull(u.email) ?? undefined,
    role: str(u.role, "student") as AuthUser["role"],
    department: str(u.department),
    bio: strOrNull(u.bio),
    interest_tags: Array.isArray(u.interest_tags) ? (u.interest_tags as string[]) : null,
    is_flagged_spam: u.is_flagged_spam === true,
  };
}

function parseAuthResponse(raw: unknown): { token: string; expires_at: string; user: AuthUser } {
  const o = isRecord(raw) ? raw : {};
  return { token: str(o.token, str(o.access_token)), expires_at: str(o.expires_at), user: parseAuthUser(o.user) };
}

export async function login(identifier: string, passcode: string): Promise<{ token: string; expires_at: string; user: AuthUser }> {
  return parseAuthResponse(await request("/auth/login", { method: "POST", body: { identifier, passcode } }));
}

export interface RegisterInput {
  full_name: string;
  university_id: string;
  email: string;
  password: string;
  department: string;
  role?: "student" | "faculty" | "researcher";
  interest_tags?: string[];
}

export async function register(input: RegisterInput): Promise<{ token: string; expires_at: string; user: AuthUser }> {
  return parseAuthResponse(await request("/auth/register", { method: "POST", body: { role: "student", ...input } }));
}

export async function getMe(signal?: AbortSignal): Promise<AuthUser> {
  const raw = await request("/auth/me", { signal });
  const u = isRecord(raw) ? raw : {};
  return {
    user_id: str(u.user_id),
    university_id: str(u.university_id),
    full_name: str(u.full_name),
    email: strOrNull(u.email) ?? undefined,
    role: str(u.role, "student") as AuthUser["role"],
    department: str(u.department),
    bio: strOrNull(u.bio),
    interest_tags: Array.isArray(u.interest_tags) ? (u.interest_tags as string[]) : null,
    is_flagged_spam: u.is_flagged_spam === true,
  };
}

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

/* -------------------------------- profiles ------------------------------ */

export async function getProfile(userId: string, signal?: AbortSignal): Promise<ProfilePayload> {
  const raw = await request(`/users/${userId}`, { signal });
  const o = isRecord(raw) ? raw : {};
  const stats = isRecord(o.stats) ? o.stats : {};
  const comments = Array.isArray(o.comments) ? o.comments : [];
  return {
    user: { ...parseAuthUser(o.user), created_at: isRecord(o.user) ? strOrNull(o.user.created_at) : null },
    stats: {
      post_count: num(stats.post_count),
      comment_count: num(stats.comment_count),
      karma: num(stats.karma),
      follower_count: num(stats.follower_count),
      following_count: num(stats.following_count),
      saved_count: num(stats.saved_count),
    },
    posts: normalizeFeed(Array.isArray(o.posts) ? o.posts : []),
    comments: comments.map((c): ProfileComment => {
      const r = isRecord(c) ? c : {};
      return {
        comment_id: str(r.comment_id),
        post_id: str(r.post_id),
        post_title: str(r.post_title),
        body: str(r.body),
        created_at: str(r.created_at),
      };
    }),
    is_following: o.is_following === true,
  };
}

export async function followUser(userId: string): Promise<void> {
  await request(`/users/${userId}/follow`, { method: "POST" });
}

export async function unfollowUser(userId: string): Promise<void> {
  await request(`/users/${userId}/follow`, { method: "DELETE" });
}

/* ---------------------------------- feed -------------------------------- */

export async function getFeed(userId: string | null, signal?: AbortSignal, sort = "best"): Promise<FeedPost[]> {
  return normalizeFeed(await request("/feed", { query: { user_id: userId, limit: 40, sort }, signal }));
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

export async function getPost(postId: string, signal?: AbortSignal): Promise<PostDetail> {
  const raw = await request(`/posts/${postId}`, { signal });
  const o = isRecord(raw) ? raw : {};
  const feedPost = normalizeFeed([o])[0];
  const author = isRecord(o.author) ? o.author : {};
  const paper = isRecord(o.attached_paper) ? o.attached_paper : null;
  return {
    ...feedPost,
    author_name: str(author.full_name, feedPost.author_name),
    author_role: str(author.role, "student") as FeedPost["author_role"],
    author_dept: str(author.department),
    author: {
      user_id: str(author.user_id),
      full_name: str(author.full_name, feedPost.author_name),
      role: str(author.role, "student") as AuthUser["role"],
      department: str(author.department),
      bio: strOrNull(author.bio),
      interest_tags: Array.isArray(author.interest_tags) ? (author.interest_tags as string[]) : null,
      post_count: num(author.post_count),
    },
    attached_paper: paper ? {
      paper_id: str(paper.paper_id),
      canonical_title: str(paper.canonical_title),
      authors: Array.isArray(paper.authors) ? (paper.authors as Paper["authors"]) : null,
      venue: strOrNull(paper.venue),
      publication_year: paper.publication_year === null ? null : num(paper.publication_year),
      pagerank_percentile: paper.pagerank_percentile === null ? null : num(paper.pagerank_percentile),
    } : null,
  };
}

/** Optimistic-UI friendly: resolves with the server's count when it returns one. */
export async function toggleUpvote(postId: string, userId: string): Promise<{ upvote_count: number | null }> {
  const raw = await request(ENDPOINTS.upvote(postId), { method: "POST", body: { user_id: userId } });
  const o = isRecord(raw) ? raw : {};
  return { upvote_count: o.upvote_count === undefined ? null : num(o.upvote_count) };
}

export async function votePost(postId: string, value: -1 | 0 | 1): Promise<{ upvote_count: number; my_vote: -1 | 0 | 1 }> {
  const raw = await request(ENDPOINTS.vote(postId), { method: "POST", body: { value } });
  const o = isRecord(raw) ? raw : {};
  const vote = num(o.my_vote);
  return {
    upvote_count: num(o.upvote_count),
    my_vote: vote === -1 || vote === 1 ? vote : 0,
  };
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

export async function savePaper(userId: string, paperId: string, notes = "", collectionId?: string | null): Promise<void> {
  await request("/library/save", {
    method: "POST",
    body: { user_id: userId, paper_id: paperId, private_notes: notes, collection_id: collectionId ?? null },
  });
}

export async function removeSavedPaper(paperId: string): Promise<void> {
  await request(`/library/save/${paperId}`, { method: "DELETE" });
}

export async function createCollection(name: string, description = ""): Promise<Collection> {
  const raw = await request(ENDPOINTS.collections, { method: "POST", body: { name, description } });
  const o = isRecord(raw) ? raw : {};
  return {
    collection_id: str(o.collection_id),
    name: str(o.name, name),
    description: strOrNull(o.description),
    paper_count: num(o.paper_count),
  };
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

export async function getPaper(paperId: string, signal?: AbortSignal): Promise<PaperDetail> {
  const raw = await request(`/papers/${paperId}`, { signal });
  const o = isRecord(raw) ? raw : {};
  const citationRows = (key: string) => Array.isArray(o[key]) ? (o[key] as unknown[]).map((row) => {
    const item = isRecord(row) ? row : {};
    return {
      paper_id: str(item.paper_id),
      canonical_title: str(item.canonical_title),
      publication_year: item.publication_year === null ? null : num(item.publication_year),
    };
  }) : [];
  const posts = Array.isArray(o.related_posts) ? o.related_posts.map((row) => {
    const item = isRecord(row) ? row : {};
    return {
      post_id: str(item.post_id),
      title: str(item.title),
      author_name: str(item.author_name),
      upvote_count: num(item.upvote_count),
      comment_count: num(item.comment_count),
      created_at: str(item.created_at),
    };
  }) : [];
  return {
    ...normalizePaper(raw),
    arxiv_id: strOrNull(o.arxiv_id),
    in_chanakya_library: o.in_chanakya_library === true,
    pagerank_percentile: o.pagerank_percentile === null ? null : num(o.pagerank_percentile),
    cites_count: num(o.cites_count),
    cited_by_count: num(o.cited_by_count),
    references: citationRows("references"),
    cited_by: citationRows("cited_by"),
    related_posts: posts,
    is_saved: o.is_saved === true,
    collection_id: strOrNull(o.collection_id),
  };
}

export async function getHome(signal?: AbortSignal): Promise<HomePayload> {
  const raw = await request("/home", { signal });
  const o = isRecord(raw) ? raw : {};
  const s = isRecord(o.stats) ? o.stats : {};
  const feed = normalizeFeed(o.recent_posts);
  return {
    stats: {
      papers: num(s.papers),
      scholars: num(s.scholars),
      clusters: num(s.clusters),
      posts: num(s.posts),
    },
    featured_papers: Array.isArray(o.featured_papers) ? o.featured_papers.map(normalizePaper) : [],
    recent_posts: feed,
  };
}

/* -------------------------------- assistant ----------------------------- */

export async function askAssistant(
  question: string,
  libraryOnly: boolean,
  signal?: AbortSignal,
  paperId?: string | null,
): Promise<AssistantAnswer> {
  const raw = await requestFirst(ENDPOINTS.assistant, {
    method: "POST",
    // `query` is sent alongside `question` so the alternate /rag/query contract also validates.
    body: { question, query: question, library_only: libraryOnly, paper_id: paperId ?? undefined },
    signal,
  });
  return normalizeAssistant(raw, question);
}

export interface AssistantStreamHandlers {
  /** Sources arrive first, before any text. */
  onMeta: (citations: Citation[]) => void;
  /** A piece of the answer as the model writes it. */
  onToken: (text: string) => void;
  /** Replaces the whole answer (refusals and the model-free fallback). */
  onReplace: (answer: string) => void;
  /** The library had nothing, so the model is answering from general knowledge. */
  onGeneral: () => void;
  onDone: (info: { degraded: boolean; reason?: string }) => void;
}

/**
 * Streams an answer from POST /assistant/ask/stream (newline-delimited JSON). Backends without that
 * route fall back to the single-response endpoint so the page keeps working.
 */
export async function streamAssistant(
  question: string,
  libraryOnly: boolean,
  signal: AbortSignal,
  paperId: string | null,
  handlers: AssistantStreamHandlers,
): Promise<void> {
  const path = "/assistant/ask/stream";
  let token: string | null = null;
  try {
    token = window.localStorage.getItem("crc.auth.token");
  } catch {
    token = null;
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ question, query: question, library_only: libraryOnly, paper_id: paperId ?? undefined }),
      signal,
      cache: "no-store",
    });
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new ApiError("network", `Can't reach the CRC API at ${API_ORIGIN}. Start the backend (uvicorn backend.main:app --port 8000) and retry.`, path);
  }

  if (res.status === 404 || res.status === 405) {
    const full = await askAssistant(question, libraryOnly, signal, paperId);
    handlers.onMeta(full.citations);
    if (full.mode === "general") handlers.onGeneral();
    handlers.onReplace(full.answer);
    handlers.onDone({ degraded: full.degraded });
    return;
  }
  if (!res.ok || !res.body) {
    const detail = await safeDetail(res);
    throw new ApiError(res.status === 401 ? "unauthorized" : res.status === 403 ? "forbidden" : "http", detail ?? `Request failed (${res.status}).`, path, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  const dispatch = (line: string) => {
    if (!line.trim()) return;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    if (!isRecord(event)) return;
    if (event.type === "meta") handlers.onMeta(normalizeAssistant({ citations: event.citations }, question).citations);
    else if (event.type === "mode" && event.mode === "general") handlers.onGeneral();
    else if (event.type === "token" && typeof event.text === "string") handlers.onToken(event.text);
    else if (event.type === "replace" && typeof event.answer === "string") handlers.onReplace(event.answer);
    else if (event.type === "done") {
      finished = true;
      handlers.onDone({ degraded: event.degraded === true, reason: typeof event.reason === "string" ? event.reason : undefined });
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(dispatch);
    }
    buffer += decoder.decode();
    dispatch(buffer);
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new ApiError("network", "The connection to the assistant dropped before the answer finished.", path);
  }
  if (!finished) handlers.onDone({ degraded: false });
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

const adminRoles = ["student", "faculty", "researcher", "admin"] as const;
const asAdminRole = (value: unknown): AdminMember["role"] =>
  adminRoles.includes(value as AdminMember["role"]) ? (value as AdminMember["role"]) : "student";
const adminRows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

export async function getAdminOverview(signal?: AbortSignal): Promise<AdminOverview> {
  const raw = await request("/admin/overview", { signal });
  const o = isRecord(raw) ? raw : {};
  const totals = isRecord(o.totals) ? o.totals : {};
  return {
    totals: {
      members: num(totals.members),
      flagged_members: num(totals.flagged_members),
      papers: num(totals.papers),
      library_papers: num(totals.library_papers),
      posts: num(totals.posts),
      comments: num(totals.comments),
      votes: num(totals.votes),
      saves: num(totals.saves),
      open_alerts: num(totals.open_alerts),
    },
    members_by_role: adminRows(o.members_by_role).map((r) => ({ role: asAdminRole(r.role), count: num(r.count) })),
    members_by_department: adminRows(o.members_by_department).map((r) => ({ department: str(r.department), count: num(r.count) })),
    activity: adminRows(o.activity).map((r) => ({
      day: str(r.day),
      posts: num(r.posts),
      comments: num(r.comments),
      votes: num(r.votes),
      saves: num(r.saves),
    })),
    open_alerts: adminRows(o.open_alerts).map((r) => ({
      alert_id: str(r.alert_id),
      alert_type: str(r.alert_type),
      entity_ref: str(r.entity_ref),
      entity_name: strOrNull(r.entity_name),
      severity_score: num(r.severity_score),
      detected_at: strOrNull(r.detected_at),
    })),
    top_contributors: adminRows(o.top_contributors).map((r) => ({
      user_id: str(r.user_id),
      full_name: str(r.full_name),
      role: asAdminRole(r.role),
      department: str(r.department),
      posts: num(r.posts),
      karma: num(r.karma),
    })),
  };
}

export interface AdminMemberQuery {
  q?: string;
  role?: string;
  department?: string;
  flagged?: boolean;
  sort: AdminMemberSort;
  order: "asc" | "desc";
  limit: number;
  offset: number;
}

export async function getAdminMembers(query: AdminMemberQuery, signal?: AbortSignal): Promise<AdminMembersPage> {
  const raw = await request("/admin/members", {
    query: {
      q: query.q,
      role: query.role,
      department: query.department,
      flagged: query.flagged ? true : undefined,
      sort: query.sort,
      order: query.order,
      limit: query.limit,
      offset: query.offset,
    },
    signal,
  });
  const o = isRecord(raw) ? raw : {};
  return {
    total: num(o.total),
    limit: num(o.limit, query.limit),
    offset: num(o.offset),
    items: adminRows(o.items).map((r) => ({
      user_id: str(r.user_id),
      university_id: str(r.university_id),
      full_name: str(r.full_name),
      email: str(r.email),
      role: asAdminRole(r.role),
      department: str(r.department),
      interest_tags: Array.isArray(r.interest_tags) ? r.interest_tags.filter((v): v is string => typeof v === "string") : [],
      created_at: strOrNull(r.created_at),
      last_active: strOrNull(r.last_active),
      is_synthetic: r.is_synthetic === true,
      is_flagged_spam: r.is_flagged_spam === true,
      spam_score: num(r.spam_score),
      posts: num(r.posts),
      comments: num(r.comments),
      saves: num(r.saves),
      votes_cast: num(r.votes_cast),
      karma: num(r.karma),
    })),
  };
}

export async function getAnalyticsDrilldown(school?: string, department?: string, signal?: AbortSignal): Promise<{
  level: "school" | "department" | "member";
  count: number;
  data: Record<string, unknown>[];
}> {
  const raw = await request("/analytics/drilldown", { query: { school, department }, signal });
  const o = isRecord(raw) ? raw : {};
  const level = o.level === "department" || o.level === "member" ? o.level : "school";
  return { level, count: num(o.count), data: adminRows(o.data) };
}
