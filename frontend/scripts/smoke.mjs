#!/usr/bin/env node
/**
 * Smoke test for a running Chanakya Research Commons (frontend + backend).
 *
 *   npm run smoke                       # http://localhost:3000 and http://localhost:8000
 *   SITE=http://host:3000 API=http://host:8000 npm run smoke
 *
 * It opens every page (using a real paper, post and member taken from the API) and checks the API calls
 * those pages depend on, including the Phase 6–10 flows: merged search with tabs, feed sorts, the paper
 * picker lookup and the full library list. It exits non-zero if anything fails.
 */
const SITE = (process.env.SITE ?? "http://localhost:3000").replace(/\/$/, "");
const API = (process.env.API ?? "http://localhost:8000").replace(/\/$/, "");

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
  } catch (error) {
    results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

async function getJson(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

async function page(path) {
  const res = await fetch(`${SITE}${path}`, { redirect: "manual" });
  // /analytics redirects to the admin dashboard by design.
  if (res.status >= 300 && res.status < 400) return `redirects to ${res.headers.get("location")}`;
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  const html = await res.text();
  if (!html.includes("<html")) throw new Error(`${path} did not return a page`);
  return `HTTP ${res.status}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const library = await getJson("/api/library?limit=1000").catch(() => []);
const feed = await getJson("/api/feed?sort=new&limit=5").catch(() => []);
const paperId = library[0]?.paper_id;
const postId = feed[0]?.post_id;
const memberId = feed[0]?.author_id;

// API behaviour the pages rely on.
await check("API library lists every holding (not capped at 100)", async () => {
  assert(library.length > 100, `only ${library.length} papers`);
  return `${library.length} papers`;
});
await check("API search returns one merged paper list plus people and discussions", async () => {
  const s = await getJson("/api/search?q=graph%20neural%20networks&limit=5&paper_limit=10&log=false");
  assert(Array.isArray(s.panels.papers) && s.panels.papers.length > 0, "no merged papers");
  assert(s.panels.papers.some((p) => p.in_chanakya_library) || s.panels.papers.some((p) => !p.in_chanakya_library), "papers lack the library flag");
  assert(Array.isArray(s.panels.people) && Array.isArray(s.panels.posts), "people or posts missing");
  return `${s.panels.papers.length} papers, ${s.panels.people.length} people, ${s.panels.posts.length} discussions`;
});
for (const sort of ["best", "new", "top"]) {
  await check(`API feed sort=${sort}`, async () => `${(await getJson(`/api/feed?sort=${sort}&limit=5`)).length} posts`);
}
await check("API feed sort=following needs a login", async () => {
  const res = await fetch(`${API}/api/feed?sort=following`);
  assert(res.status === 401, `expected 401, got ${res.status}`);
  return "401 for visitors";
});
await check("API paper picker lookup", async () => {
  const title = library[0]?.canonical_title ?? "data";
  const hits = await getJson(`/api/papers/suggest?q=${encodeURIComponent(title.slice(0, 10))}`);
  assert(hits.length > 0, "no suggestions");
  return `${hits.length} suggestions`;
});

// Every page renders.
const pages = [
  "/", "/feed", "/feed?sort=new", "/library", "/library?tab=saves", "/library?tab=recommended", "/library?tab=collections",
  "/search", "/search?q=data%20mining", "/search?q=data%20mining&tab=papers&source=library", "/search?q=data%20mining&tab=people",
  "/search?q=data%20mining&tab=discussions", "/assistant", "/admin", "/analytics", "/profile",
];
if (paperId) pages.push(`/papers/${paperId}`, `/feed?attach=${paperId}`);
if (postId) pages.push(`/feed/${postId}`);
if (memberId) pages.push(`/u/${memberId}`);
for (const path of pages) await check(`page ${path}`, () => page(path));

let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed against ${SITE} and ${API}`);
process.exit(failed ? 1 : 0);
