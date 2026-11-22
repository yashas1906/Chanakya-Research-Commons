# CRC Frontend Redesign — Implementation Brief

> **For the coding agent / IDE.** This file is the single source of truth for this task. Read it fully before editing anything. It describes the *current* state of the repo, what is wrong with it (observed in the running app), and exactly what to build. Where this file names a file, route or field, it was checked against the repo; where it says **VERIFY**, confirm against your local copy first because your local backend may have routes that the public repo does not.

## 0. Ground rules

1. Work in `frontend/` (Next.js 14.2 App Router, React 18, TypeScript strict, Tailwind 3.4, `lucide-react`). Backend work happens in `backend/main.py` and `db/`.
2. **Always use `python` (never `python3`)** for any backend/CLI/verification command.
3. **Do not rewrite what already works.** The data layer (`lib/api.ts`, `lib/normalize.ts`, `types/crc.ts`), the analytics cards, the assistant workspace and the UI primitives in `components/ui/` are reused. Refactor in place; move or delete only what Section 7 lists.
4. **Light mode only.** No dark mode, no neon, no heavy gradients. Reddit is a *structural* reference for the feed (layout and interaction), not a visual one. Do not copy Reddit's colours, logo, wording or dark theme.
5. Finish by running, inside `frontend/`: `npx tsc --noEmit` (must print zero errors) and `npx next lint`. Then `npx next build`.
6. After each numbered step in Section 9, the app must still compile. Do not leave the tree broken between steps.

---

## 1. Project context

**Chanakya Research Commons (CRC)** is a university research discovery platform.

| Layer | Detail |
|---|---|
| Frontend | `frontend/` — Next.js App Router, fonts via `next/font/google` (Newsreader serif → `--font-serif`, Inter sans → `--font-sans`), tokens in `tailwind.config.ts` (`canvas #FAF9F6`, `paper #FFFFFF`, `sunken`, `ink`, `terracotta` = integrity flags, `sage` = breakout impact) |
| Backend | FastAPI in `backend/main.py`, psycopg2 `RealDictCursor`, base URL `http://localhost:8000`, all routes under `/api/*`, CORS currently `*` |
| Database | PostgreSQL 16 + pgvector (384-d MiniLM). `public` schema (operational) + `dw` star schema (analytics). Schema: `db/schema.sql`. Seed: `data_pipeline/seed_database.py` |
| AI | `sentence-transformers` embeddings, Ollama `llama3.2:3b` for the grounded RAG assistant |

### Current frontend map (what exists today)

```
frontend/
  app/            page.tsx (= search!), feed/, library/, assistant/, analytics/, layout.tsx, globals.css
  components/
    shell/        Header.tsx, MemberSwitcher.tsx
    search/       SearchBar, SearchWorkspace, ResultPanels, RelatedTopics
    feed/         FeedWorkspace, PostCard, Composer, CommentThread
    library/      LibraryWorkspace, PaperRow, PaperDrawer
    assistant/    AssistantWorkspace, AnswerText, EvidenceInspector
    analytics/    AnalyticsWorkspace, WarehouseActivityCard, TopicAssociationsCard,
                  ResearcherArchetypesCard, AnomalyWatchlistCard, GatekeeperTester, charts
    ui/           Drawer, Meter, Pill, SaveButton, Section, Skeleton, States, Tabs
  lib/            api.ts, normalize.ts, format.ts, hooks.ts, member-context.tsx, saves-context.tsx
  types/crc.ts
```

### Current backend routes (public repo — **VERIFY** against your local `main.py`)

```
GET  /api/users                       POST /api/posts
GET  /api/feed                        GET  /api/library
POST /api/library/save                GET  /api/search
GET  /api/recommendations/{user_id}   GET  /api/papers/{paper_id}/also-saved
GET  /api/trends-and-anomalies        POST /api/assistant/ask
GET  /api/analytics/overview
```

**Missing and required by this task:** `GET /api/papers/{paper_id}`, `GET /api/posts/{post_id}`, comments (list/create), voting, any authentication, a home-page aggregate. The mining endpoints the frontend already calls (`/analytics/topic-associations`, `/analytics/researcher-archetypes`, `/analytics/anomalies`, gatekeeper) are not in the public repo; if they are also absent locally, `lib/api.ts` already degrades to a "not available on this backend" state, so do not build them here.

### Relevant DB facts

- `users(user_id, university_id, full_name, email, password_hash, role, department, bio, interest_tags, ...)`; `role CHECK IN ('student','faculty','researcher','admin')`.
- **Seed writes the literal string `"hashed_demo_pass"` into `password_hash` for every user**, with `university_id = 24CU1000+i` and `email = member{n}@chanakyauniversity.edu.in`. There is no auth code anywhere today.
- `comments(comment_id, post_id, author_id, parent_comment_id, body, created_at)` — already supports nesting.
- `post_upvotes(user_id, post_id, created_at)` — **no vote value column**, so downvotes are impossible without a migration (Section 5.3).
- `posts.upvote_count INT` is the denormalised score.
- `papers(paper_id, doi, arxiv_id, canonical_title, abstract, authors JSONB, publication_year, venue, topics TEXT[], pagerank_score, save_count, in_chanakya_library)`; `paper_citations(citing_paper_id, cited_paper_id)`.

---

## 2. Problems observed in the running app

These come from screenshots of `localhost:3000` at 1920×1080, 100% browser zoom. Each has a root cause and a required fix.

### 2.1 The UI looks zoomed-out / shrunken
- **Cause:** the container is already 1280 px, but the type is tiny. There are **~140 uses of arbitrary sizes below 14 px** (`text-[10.5px]`, `[11px]`, `[12px]`, `[12.5px]`, `[13px]`, `[13.5px]`) across `components/` and `app/`; `.btn`, `.eyebrow`, `.input` and nav links are all 11–13.5 px. On a 1080p screen that reads as a 75% zoom.
- **Fix:** introduce a real type scale (Section 6) and replace every arbitrary `text-[Npx]` under 14 px that carries *reading content* (body, buttons, nav, inputs, card meta). Keep ≤ 12 px only for eyebrows and badges. Container becomes `mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8`.

### 2.2 Stray ▲▼ arrows in the top bar
- **Symptom:** a tiny up/down arrow control sits between the nav links and the member chip.
- **Cause:** in `components/shell/Header.tsx` the `<nav>` has `overflow-x-auto`, which forces `overflow-y` to `auto` as well. The active-tab underline is `absolute … -bottom-[13px]`, which overflows the nav box vertically, so the browser draws a classic vertical scrollbar (arrows only, on Windows/Brave).
- **Fix:** the new `Navbar` must not clip children. Draw the active indicator **inside** the link box (`after:absolute after:inset-x-3 after:bottom-0 after:h-0.5`) and give the link `relative`. Only allow horizontal scrolling below `md`, and hide its scrollbar (`[scrollbar-width:none] [&::-webkit-scrollbar]:hidden`).

### 2.3 `/` is the search page; there is no home
- `app/page.tsx` renders `SearchWorkspace` and the rest of the viewport is empty. There is no landing experience, and search exists only inside that page (its own `SearchBar`), so it is not reachable from other routes.
- **Fix:** `/` becomes a real Home (Section 4.3). Search moves to `/search?q=`; the search *input* moves into the global `Navbar`.

### 2.4 Feed is not a feed people can open or react to
- Post cards are not clickable, there is no thread page, no downvote, no share, and the action row (`▲ 27   Discussion`) sits at the very bottom of a tall card.
- Reference (Reddit post card): a flat card with author line → bold title → truncated body → **a single row of pill buttons**: `[▲ score ▼]  [💬 count]  [↗ Share]`. Reference (Reddit thread page): full body, then a "Join the conversation" composer, a sort control, a comment search, and nested comments with avatar/name/time, a vote pill, `Reply`, `Share`, and a collapse toggle with an indentation rail.
- **Fix:** Section 4.4.

### 2.5 Library uses a cramped drawer and shows unreadable scores
- Clicking a paper opens `PaperDrawer` (a right-side sheet) that squeezes the abstract into a narrow column.
- PageRank is shown as `PR 1.2e−3` (scientific notation, from `fmtPagerank`). Users cannot interpret it.
- "Recommended reading" shows **duplicate titles** (e.g. two entries called "Computer Vision").
- **Fix:** remove the drawer; papers open at `/papers/[paperId]`. Show PageRank as a **tier** ("Top 1%", "Top 10%", "Top 25%", "Mid", "Long tail") plus a small meter; keep the raw number only in a tooltip and on the paper page's metrics block. De-duplicate recommendations by `paper_id` (and by normalised title if ids differ).

### 2.6 Anyone can become anyone
- `MemberSwitcher` lists every member and switches identity in one click (`lib/member-context.tsx`, stored in `localStorage["crc.acting-member"]`). The current user in the screenshots is an **admin** that anyone can assume instantly, which exposes the integrity watchlist and gatekeeper.
- **Fix:** real sign-in with role gating, enforced on **both** client and server (Section 4.6 and 5.1).

---

## 3. Target information architecture

| Route | Purpose | Notes |
|---|---|---|
| `/` | Home / discovery | New. Public. |
| `/search?q=…` | 4-panel RRF hybrid search + related-topic chips | Moved from `/`. Driven by the global search bar. |
| `/feed` | Community feed (2-column) | Rework of existing page. |
| `/feed/[postId]` | Full post + threaded discussion | New. |
| `/library` | Interactive library | Drawer removed. |
| `/papers/[paperId]` | Full-page paper reader | New. Every paper link in the app points here. |
| `/assistant` | Grounded RAG assistant | Exists. Accept `?paper=<id>` to pre-scope (Section 4.5). |
| `/analytics` | Tabbed institutional dashboard | Exists. Add role-gated tabs. |
| `/papers/new` | Submit a paper | **P2 / optional.** Faculty+ only. |

Next.js notes: `app/search/page.tsx` and any page using `useSearchParams` must wrap the client component in `<Suspense>` (the current `app/page.tsx` already shows the pattern). Dynamic pages should be client components that fetch via `useAsync`, with `loading.tsx`/skeletons, a not-found state for 404s, and an error state for network failures (reuse `components/ui/States.tsx`).

---

## 4. Frontend requirements

### 4.1 Layout, scale and calm hierarchy
- Root layout: `<main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-8 sm:px-6 lg:px-8">`. Nothing may produce horizontal page scroll at 360, 768, 1280 or 1920 px (check with the browser console: `document.documentElement.scrollWidth <= window.innerWidth`).
- Use CSS Grid for 2-column pages: `grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]`. **Always `min-w-0` on grid/flex children that hold wide content** (tables, heatmaps, long titles); this is what caused an earlier overflow bug.
- Whitespace over density: section gaps `space-y-10`, card padding `p-5 sm:p-6`. Long lists are collapsible (`<details>`-style or a "Show more" control); analytics goes into tabs (4.7).
- Theme stays: canvas `#FAF9F6`, cards `#FFFFFF`, `border border-stone-200`, serif display headings, sans body, `tabular-nums` (`.num` class) on every score.

### 4.2 Global Navbar with persistent search — `frontend/components/Navbar.tsx`
Replaces `components/shell/Header.tsx`. Rendered once in `app/layout.tsx`, sticky (`sticky top-0 z-40`), `h-16`, `border-b border-stone-200`, `bg-canvas/95 backdrop-blur-sm`.

- **Left:** brand mark + "Chanakya Research Commons"; links **Home** (`/`), **Feed**, **Library**, **RAG Assistant**, **Analytics**. Active state via `usePathname` (`/` exact; others `startsWith`). `aria-current="page"`.
- **Center:** `components/shell/GlobalSearch.tsx` — an always-visible input (`type="search"`, `role="search"` form). Pressing **`/`** anywhere (except while typing in an input/textarea/contenteditable, and ignoring modifier keys) focuses it; **Esc** blurs. Submit → `router.push('/search?q=' + encodeURIComponent(q.trim()))`; ignore empty. On `/search` it reflects the current `q` from the URL. Show a `/` key hint inside the field.
- **Right:** `components/shell/AccountMenu.tsx` — when signed out: a **Sign in** button (opens `LoginModal`). When signed in: avatar + name + `RoleBadge` (Student / Faculty / Researcher / Admin), and a menu with *Profile summary*, *Switch account* (opens `LoginModal` — never an instant switch), *Sign out*.
- **Responsive:** below `md`, the nav links collapse into a menu button and the search collapses to an icon that expands to a full-width row. Verify at 390 px.
- Keep the backend-unreachable banner currently in `Header.tsx` (the `status === "error"` strip) but drive it from a lightweight `/api` health check or from the auth/members load.
- Delete `components/shell/Header.tsx` and `components/shell/MemberSwitcher.tsx` once nothing imports them.

### 4.3 Home — `app/page.tsx`
A calm, scannable landing page. Data comes from one aggregate call, `getHome()` → `GET /api/home` (Section 5.4), plus `getTopicAssociations()` for themes.

1. **Hero** — eyebrow, serif H1 (e.g. "Find the work, the people and the conversation."), one-line sub-copy, a large search field that submits to `/search` (same component as the navbar, bigger), and **quick-launch pills**: one per school (`SCHOOLS` in `types/crc.ts`) that links to `/search?q=<school>` or `/library?school=<school>`, plus 3–4 sample queries.
2. **Stats strip** — animated-free counters (no count-up gimmicks): *Indexed papers*, *Active scholars*, *Research clusters*, *Campus discussions*. Use `fmtInt`. Skeleton while loading; hide a stat (not the strip) if the backend omits it.
3. **Trending maximal research themes** — from `TopicAssociations.bundles` (fpmax maximal itemsets). Each theme is a chip group; clicking a theme navigates to `/search?q=<items joined by space>`. Show the top 6; "See all themes" → `/analytics?tab=associations`. If the endpoint is unsupported, render the shared "not available on this backend" state, not an error.
4. **Featured high-PageRank papers** — 6 cards (title, authors line, venue·year, PageRank **tier**), each wrapped in `<Link href={`/papers/${id}`}>`. Save button must not trigger navigation (`stopPropagation` / sibling, not nested interactive elements inside the link).
5. **Breakout scholar spotlights** — from the anomaly feed's `HIGH_IMPACT_SPOTLIGHT` items (sage accent). Visible to everyone. "View all" → `/analytics?tab=anomalies`.
6. **Recent campus discussions** — 4 latest posts (title, author, topic flair, score, comment count) → `/feed/[postId]`; "View all" → `/feed`.

Each module has its own loading skeleton and its own error/empty state so one failure never blanks the page.

### 4.4 Feed and thread

**`/feed` — `components/feed/FeedWorkspace.tsx`, `PostCard.tsx`**
- 2-column grid: left = stream, right = sticky rail (`lg:sticky lg:top-24`, hidden below `lg`, its key content appears above the stream on mobile as collapsible).
- Top of stream: a compact **create-post** trigger (reuse `Composer`) — disabled with a "Sign in to post" prompt for signed-out users — then topic filter pills (keep existing school/topic filters), then a sort toggle (**Best** = server relevance order, **New** = `created_at desc`, **Top** = score desc).
- **Post card layout (top → bottom):**
  1. Row: avatar (initials, `Avatar` from `ui/Section`), **author name**, `department · role` badge, `·`, `relTime(created_at)`.
  2. **Topic flair pill** (first tag, `Pill`) — remaining tags in the thread view only.
  3. **Title** (serif, `text-xl`, the whole title is a `Link` to `/feed/[postId]`).
  4. **Snippet** — body clamped to 3 lines (`line-clamp-3`); if an attached paper exists, a small attached-paper strip linking to `/papers/[id]`.
  5. **Action bar** (a single flex row of rounded-full pill buttons, `h-9`, `border border-stone-200`):
     - **Vote pill:** `[▲] score [▼]` — one pill, three controls. Upvote/downvote are toggles (clicking the active direction clears it). The active arrow uses an `ink` fill; terracotta/sage are reserved for integrity/impact semantics and must not be used for vote state.
     - **Comment pill:** icon + `comment_count` → links to `/feed/[postId]#comments`.
     - **Share pill:** copies `${location.origin}/feed/${post_id}` via `navigator.clipboard.writeText` (fallback to a hidden textarea + `execCommand('copy')` when the Clipboard API is unavailable, e.g. non-HTTPS) and shows a toast "Link copied".
     - **Save** (bookmark) pill for the attached paper if present, else saves the post locally (P2) — at minimum, hide it when there is nothing to save.
  - The whole card is clickable via a stretched-link pattern on the title (`after:absolute after:inset-0`); interactive children get `relative z-10` so they stay independently clickable.
- **Voting behaviour:** optimistic update with rollback on failure (existing `PostCard` already does optimistic upvote — extend it). Signed-out click → open `LoginModal` instead of calling the API. State comes from the server's `my_vote` (not just localStorage; remove the per-member localStorage upvote cache).
- **Right rail** (`components/feed/FeedRail.tsx`): (a) *Community guidelines* — static card of 4–5 short rules (be rigorous, cite sources, no self-promotion spam, respect authorship, report integrity concerns); (b) *Trending topics* — top tags from the loaded posts with counts (clicking applies the topic filter); (c) *Start a discussion* CTA that focuses the composer; (d) the existing *Scholars you may know* list, collapsed to 3 with "Show more".

**`/feed/[postId]` — `app/feed/[postId]/page.tsx` + `components/feed/PostThread.tsx`**
- Breadcrumb/back link "← Feed". Left column: full post (author header, topic flair + all tags, serif title, **complete body** preserving paragraphs via `whitespace-pre-wrap`), then the same action bar (Share copies this URL), then the **linked paper card** (title, authors, venue·year, tier, `View paper →`, `Ask the assistant →`), then the comment composer, then the thread. Right column (sticky): **author profile summary** (avatar, name, role badge, department, bio, interest tags, "View posts by …" optional) and a small "More in this topic" list (reuse `/api/feed` filtered by the first tag, excluding the current post).
- **Comment composer:** "Join the conversation" single-line field that expands to a textarea with Cancel / Comment buttons; gated by sign-in.
- **Thread (`CommentThread.tsx`):** build a tree from the flat list using `parent_comment_id` (guard against orphans and cycles — treat an orphan as a root). Each node: avatar, name, role badge, relative time, body, then `Reply` (opens an inline composer under that node), `Share` (copies `…/feed/[postId]#c-<comment_id>`), and a **collapse toggle** (shows `[+] N replies`). Indent with a left rail (`border-l border-stone-200 pl-4`) and **cap visual depth at 5** (deeper replies continue at depth 5 with a "Continue thread" affordance). Sort: **Best/Newest/Oldest** (without comment votes, "Best" = oldest-first top-level then replies; label it "Top-level first" if you prefer honesty). Include an in-thread comment filter box (client-side substring match, highlighting not required).
- Scroll to and highlight `#c-<id>` on load.
- States: loading skeleton, 404 ("This discussion doesn't exist or was removed"), network error with retry.

### 4.5 Library and paper reader

**`/library` — `components/library/LibraryWorkspace.tsx`, `PaperRow.tsx`**
- **Remove** `PaperDrawer.tsx` (and `ui/Drawer.tsx` if nothing else uses it). Row click and title link go to `/papers/[paperId]`.
- Tabs (existing `Tabs`): *Chanakya holdings* · *My saves* · *Collections*. Keep counts. Persist the active tab and filters in the URL query (`?tab=&q=&school=&year=&tier=&sort=`) so views are shareable and survive refresh.
- **Real-time filter:** debounced (`useDebounced`, 200 ms) client-side filter over the loaded list by title, authors, venue and topics. Show "N results" and an empty state with "Clear filters".
- **Filter chips:** *School* (6 `SCHOOLS`), *Year* (decade buckets or a min/max select derived from data), *PageRank tier* (Top 1% / Top 10% / Top 25% / All). Multi-select within a group is OR, across groups is AND. Chips are a horizontally wrapping row, never a horizontally scrolling one.
- **VERIFY:** how `PaperRow` currently derives the school tag. If the backend does not return a `school` field per paper, add it server-side to `/api/library` (derive from `topics` via the same mapping the seed uses) instead of guessing in the client.
- One-click bookmark (existing `SaveButton` + `saves-context`); signed-out → `LoginModal`.
- **PageRank display:** replace `fmtPagerank` usage in lists with a `PrestigeTier` component (label + `PrestigePips`/`Meter` from `ui/Meter.tsx`). Tier thresholds come from the server's `pagerank_percentile` when present; otherwise compute percentile over the full holdings list (not the filtered view, so tiers do not shift while filtering).
- **Recommended reading rail:** dedupe (2.5).

**`/papers/[paperId]` — `app/papers/[paperId]/page.tsx` + `components/paper/*`**
Full-width reader, 2-column on `lg` (main + sticky side panel).
- **Header:** serif H1 title, authors (each as plain text; do not invent author pages), `venue · year`, **DOI** as an external link (`https://doi.org/<doi>`, `target="_blank" rel="noopener noreferrer"`) when present, arXiv id link when present.
- **Prestige block:** PageRank tier + meter + the raw score (`fmtPagerank`) with a one-line explanation ("citation-graph prestige within the Chanakya corpus"); `Saved by N members`; **citation graph metrics**: *cites* (outgoing count), *cited by* (incoming count), with up to 8 titled references / citing papers as links to their own `/papers/[id]` pages when they exist locally.
- **Abstract:** full text, readable measure (`max-w-prose`, `text-base leading-7`, serif or sans — pick one and stay consistent). Topic tags as `Tag` pills linking to `/search?q=<topic>`.
- **Actions:** `SaveToCollection` — a save button with a collection picker (existing `getCollections`, `savePaper`; allow "No collection"); **Ask the RAG assistant about this paper** → `/assistant?paper=<paper_id>&q=<prefilled question>`; Share (copy URL).
- **Linked campus discussions:** posts whose `attached_paper_id` equals this paper (from the paper payload), each linking to `/feed/[postId]`; empty state with "Start a discussion about this paper" which opens the composer pre-attached to the paper (`/feed?attach=<paper_id>`).
- **Also saved by readers** (existing `getAlsoSaved`) as a "Readers also saved" list.
- 404 and error states as in 4.4. Add `generateMetadata`-free dynamic `<title>` via `document.title` in an effect (client component) or a server `generateMetadata` if you move the fetch server-side.
- Assistant: when `?paper=` is present, `AssistantWorkspace` shows a dismissible "Scoped to: <title>" chip and passes it through. **VERIFY** whether `POST /api/assistant/ask` can scope to a paper; if not, add an optional `paper_id` to `AskAssistantRequest` and filter the chunk query by `paper_id` (keep behaviour unchanged when absent).

### 4.6 Authentication and hierarchical role gating

**Files:** `frontend/context/AuthContext.tsx` (new, per the original brief), `components/auth/LoginModal.tsx`, `components/auth/RequireRole.tsx`, `components/ui/RoleBadge.tsx`. `lib/member-context.tsx` is removed; every `useMember()` call site (`SaveButton`, `LibraryWorkspace`, `CommentThread`, `Composer`, `PostCard`, `FeedWorkspace`, `saves-context`, the old Header/MemberSwitcher) migrates to `useAuth()`.

**Roles and hierarchy**

| Tier | Roles | Can |
|---|---|---|
| 1 | `student` | Browse, search, save to library, post, comment, vote, use the assistant |
| 2 | `faculty`, `researcher` | Tier 1 + submit papers + **department analytics** |
| 3 | `admin` (Admin / Dean) | Tier 2 + **Integrity & Metadata Watchlist**, **Live Gatekeeper Console**, system alerts |

```ts
export type Role = "student" | "faculty" | "researcher" | "admin";
export const ROLE_RANK: Record<Role, number> = { student: 1, faculty: 2, researcher: 2, admin: 3 };
export const hasRole = (user: { role: Role } | null, min: Role) =>
  !!user && ROLE_RANK[user.role] >= ROLE_RANK[min];
```

**`AuthContext` API:** `{ user: Member | null; token: string | null; status: "loading" | "anonymous" | "authenticated"; login(identifier, passcode): Promise<void>; logout(): void; can(min: Role): boolean }`.
- On mount, read the token from `localStorage["crc.auth.token"]` (wrap in try/catch), call `GET /api/auth/me`; on 401 clear it and become `anonymous`. On `login`, store token + user. On `logout`, clear storage and reset any member-scoped state (saves cache, optimistic votes).
- `lib/api.ts` attaches `Authorization: Bearer <token>` to every request when a token exists, and on a `401` response triggers a global `logout()` plus a "Session expired" toast. Add a new `ApiError` kind `"unauthorized"` / `"forbidden"` (401 / 403) so UI can distinguish them from `"unsupported"`.
- **Never trust the client for authorization.** The UI hides gated content for UX; the backend (5.1) enforces it.

**`LoginModal`:** accessible dialog (focus trap, `Esc` closes, `aria-modal`). Fields: **University email or ID** (accepts `member3@chanakyauniversity.edu.in` or `24CU1002`) and **Passcode / PIN** (`type="password"`, `autocomplete="current-password"`, show/hide toggle). Inline error "Those details don't match a Chanakya account." (generic — do not reveal which field was wrong). Disable submit while pending. After success, close and, if opened from a gated action, perform the intended navigation. "Switch account" uses the same modal and replaces the session only after the new login succeeds.

**`RequireRole`:** `<RequireRole min="admin" fallback="signin|forbidden">` renders children when allowed; otherwise a calm panel — signed out: "Sign in to continue" + button; signed in but under-privileged: "This area is available to Admin accounts" with a link home. **Never render the gated component's children (or fire its data requests) when denied.** Use `useAsync(..., { enabled })` so the request is not made.

**Where gates apply:**
- `/analytics`: *Overview/Topic associations/Researcher archetypes* → any signed-in or public as today; **department filter and department views → `faculty+`**; **Integrity watchlist tab, Gatekeeper tester, system alerts → `admin` only** (tabs hidden for others, not merely disabled).
- Post, comment, vote, save, "Ask assistant" persist actions → authenticated (browsing stays public).
- `/papers/new` → `faculty+`.

### 4.7 Analytics — tabbed dashboard (`app/analytics/page.tsx`, `AnalyticsWorkspace.tsx`)
- Use the existing `Tabs` and reflect the active tab in `?tab=` (`activity`, `associations`, `archetypes`, `anomalies`). Only the active tab's data is fetched (lazy), so the page is fast and calm.
- Tab contents: **Activity** (`WarehouseActivityCard`), **Topic associations** (`TopicAssociationsCard`, fpmax bundles + fpgrowth rules, lift ≥ 1.2), **Researcher archetypes** (`ResearcherArchetypesCard`, Ward clusters + defining rules), **Anomalies** (`AnomalyWatchlistCard`: *Breakout spotlights* for everyone; *Integrity watchlist* + `GatekeeperTester` wrapped in `RequireRole min="admin"`).
- Keep `min-w-0` on every grid child (the heatmap has a min width and previously caused page overflow).

### 4.8 Search — `app/search/page.tsx`
- Move `SearchWorkspace` here. **Remove its own big `SearchBar`** (the navbar owns the input now); keep a compact result header: "Results for “q”" and timing/count. Update every `router.push('/?q=…')` (currently `SearchWorkspace.tsx:34`) to `/search?q=…`, and any `href="/"`-as-search link.
- Keep 4 panels (*Chanakya Library*, *External Literature*, *University Scholars*, *Campus Discussions*), the `related_topics` chips (lift ≥ 1.5, pivot and "+" refine), and make **every paper result a link to `/papers/[paperId]`** and every discussion result a link to `/feed/[postId]`.
- Empty `q`: show the "Try …" sample queries, not an error.

### 4.9 Shared pieces
- `components/ui/Toast.tsx` — `ToastProvider` + `useToast()`; bottom-center, `role="status"`, auto-dismiss 2.5 s, one at a time. Mount in `layout.tsx`.
- `components/ui/PrestigeTier.tsx`, `components/paper/PaperCard.tsx` (single compact paper card used by Home, Library, Search, Feed attachments so styling stays consistent).
- `lib/format.ts`: add `pagerankTier(percentile)`, `fmtCount(n)` (1.6K style, tabular), keep `fmtPagerank` for the metrics block only.

---

## 5. Backend requirements (`backend/main.py`, `db/`)

Keep existing routes backwards compatible. Return JSON-serialisable types (cast `UUID`/`datetime` as the existing code does). Use parameterised SQL only. Validate UUID path params and return `404` for unknown ids and `422/400` for malformed ones.

### 5.1 Authentication (new)

Use the standard library only (no new dependency required).

- **Password format:** `pbkdf2$<iterations>$<salt_hex>$<hash_hex>` using `hashlib.pbkdf2_hmac("sha256", pw, salt, 200_000)`; verify with `hmac.compare_digest`.
- **Legacy/demo compatibility:** every seeded user has `password_hash == "hashed_demo_pass"`. In `verify_password`, if the stored value equals that literal, compare the submitted passcode to `os.environ.get("CRC_DEMO_PASSCODE", "chanakya-demo")`. Log a startup warning when this path is enabled. Update `data_pipeline/seed_database.py` to write a real pbkdf2 hash of `CRC_DEMO_PASSCODE` for new seeds. Document the demo passcode in `README.md`.
- **Token:** `base64url(json{sub, role, exp}) + "." + base64url(HMAC_SHA256(secret, payload))`, 8-hour expiry, secret from `CRC_AUTH_SECRET` (refuse to start in non-dev mode if unset; in dev, generate a random secret and warn). **Re-read the role from the DB** on each request in `current_user` so a demotion takes effect immediately.
- **Endpoints**
  - `POST /api/auth/login` — body `{ "identifier": str, "passcode": str }` where `identifier` matches `lower(email)` **or** `university_id`. Success → `{ "token", "expires_at", "user": Member }`. Failure → `401 {"detail":"Invalid credentials"}` (same message for unknown user and wrong passcode; constant-time compare). Add a simple in-memory throttle: 5 failed attempts per identifier per minute → `429`.
  - `GET /api/auth/me` → `Member` (never include `password_hash` or, for other users, `email`).
- **Dependencies:** `current_user_optional`, `current_user` (401 if missing/invalid), `require_role(min_role)` (403 if below). Rank: student 1, faculty/researcher 2, admin 3.
- **Enforcement:**
  - `POST /api/posts`, `POST /api/library/save`, voting, comments → `current_user`; **use the token's user id and ignore `author_id` / `user_id` in the body** (keep the fields in the models so old callers do not 422).
  - Anomaly **integrity** data, gatekeeper scoring, system alerts, and the `flagged_spam_accounts` key of `/api/trends-and-anomalies` (today it returns `{trending_topics, flagged_spam_accounts}` and also runs the Isolation Forest job on every GET) → `require_role("admin")`; for non-admins omit the key rather than returning an empty list. The **spotlight** / `trending_topics` subset stays public.
  - Department-filtered analytics (`/api/analytics/overview?department=`) → `faculty+`.
  - `GET /api/users` must stop returning `email` (and keep `password_hash` out of every response).
- Replace `allow_origins=["*"]` with an env-driven list (`CRC_CORS_ORIGINS`, default `http://localhost:3000`) now that requests carry credentials.

### 5.2 Paper detail

`GET /api/papers/{paper_id}` (optional auth).

```jsonc
{
  "paper_id": "uuid", "canonical_title": "…", "abstract": "…",
  "authors": ["…"],                 // keep JSONB as stored; frontend already normalises via authorsLine
  "publication_year": 2023, "venue": "…", "doi": "10.…|null", "arxiv_id": "…|null",
  "topics": ["…"], "in_chanakya_library": true,
  "pagerank_score": 0.0012, "pagerank_percentile": 0.97,   // percent_rank() over papers.pagerank_score
  "save_count": 5,
  "cites_count": 12, "cited_by_count": 4,
  "references": [{ "paper_id": "uuid", "canonical_title": "…", "publication_year": 2020 }],   // ≤ 8
  "cited_by":   [{ "paper_id": "uuid", "canonical_title": "…", "publication_year": 2024 }],   // ≤ 8
  "related_posts": [{ "post_id": "uuid", "title": "…", "author_name": "…", "upvote_count": 3,
                      "comment_count": 2, "created_at": "…" }],                                // ≤ 10, newest first
  "is_saved": false, "collection_id": null          // only meaningful when authenticated
}
```

Compute the percentile with a window function over the full `papers` table in a CTE, then filter to the requested id (do not scan per-row). Citation counts come from `paper_citations`.

### 5.3 Posts, comments and voting

- **Migration** (`db/migrations/002_post_votes.sql`, also appended to `db/schema.sql`):
  ```sql
  ALTER TABLE post_upvotes
    ADD COLUMN IF NOT EXISTS value SMALLINT NOT NULL DEFAULT 1 CHECK (value IN (-1, 1));
  CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);
  ```
  `posts.upvote_count` remains the denormalised **net score** (`SUM(value)`); recompute it from the table inside the same transaction as the vote change so it cannot drift.
- `GET /api/feed` — keep current fields and add `author_id`, `comment_count` (subquery/aggregate on `comments`), and `my_vote` (`-1|0|1`, only when authenticated). Add a `sort` query param: `best` (current relevance behaviour; default), `new`, `top`.
- `GET /api/posts/{post_id}` → the feed row shape **plus** `author: { user_id, full_name, role, department, bio, interest_tags, post_count }` and `attached_paper: { paper_id, canonical_title, authors, venue, publication_year, pagerank_percentile } | null`.
- `GET /api/posts/{post_id}/comments` → flat list ordered by `created_at`, each with `comment_id, post_id, author_id, author_name, author_role, author_dept, parent_comment_id, body, created_at`. Frontend builds the tree.
- `POST /api/posts/{post_id}/comments` `{ body: str (1–5000 chars), parent_comment_id?: uuid }` → the created comment row. Validate that the parent belongs to the same post. Insert an `activity_events` row (`event_type='comment'`) like `create_post` does.
- `POST /api/posts/{post_id}/vote` `{ value: -1 | 0 | 1 }` → `{ upvote_count, my_vote }`. `0` deletes the row. Upsert with `ON CONFLICT (user_id, post_id) DO UPDATE`. Keep `POST /api/posts/{id}/upvote` as a toggle alias (the current `lib/api.ts` `ENDPOINTS.upvote` path) so nothing breaks.
- Fix the connection handling in anything you touch: use `try/finally` (or a context manager) so cursors and connections close on exceptions.

### 5.4 Home aggregate

`GET /api/home` (public):
```jsonc
{
  "stats": { "papers": 60, "scholars": 50, "clusters": 6, "posts": 40 },
  "featured_papers": [ /* top 6 by pagerank_score among in_chanakya_library: id, title, authors, venue, year, pagerank_percentile, save_count */ ],
  "recent_posts":   [ /* 4 newest non-spam posts, feed row shape incl. comment_count */ ]
}
```
`clusters` = `COUNT(DISTINCT parent_cluster)` from `dw.dim_topic`; `scholars` = non-flagged users. Breakout scholars and maximal themes are fetched by the frontend from the existing analytics endpoints, not duplicated here.

### 5.4b Collections (needed by "Save to collection")
The `collections` table exists but no route uses it, and `SavePaperRequest` has no `collection_id`. **VERIFY** locally, then add if missing:
- `GET /api/collections` (auth) → the caller's collections `[{ collection_id, name, description, paper_count }]`.
- `POST /api/collections` (auth) `{ name (1–120), description? }` → created row.
- Extend `SavePaperRequest` with `collection_id: Optional[str] = None` and write it into `library_saves.collection_id` (the `UNIQUE (user_id, paper_id)` upsert should *update* the collection on re-save). Keep `DELETE /api/library/save/{paper_id}` (auth) so a bookmark can be removed; the current UI only toggles on.
- Make sure `ENDPOINTS.collections` in `lib/api.ts` points at the final route path.

### 5.5 Paper submission (P2)
`POST /api/papers` (`faculty+`): `{ title, abstract, authors[], publication_year, venue?, doi?, topics[] }` → embeds title+abstract with `vec_literal`, inserts with `in_chanakya_library = TRUE`, returns `{ paper_id }`. Reject duplicate DOI with `409`. Build the matching `/papers/new` form only after everything else is done.

### 5.6 Verification (always `python`)
```bash
python -c "import ast,sys; ast.parse(open('backend/main.py').read())"
cd backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload   # same as README, via `python -m`
python - <<'PY'
import urllib.request, json
print(urllib.request.urlopen("http://localhost:8000/api/home").read()[:200])
PY
```

---

## 6. Design tokens and type scale

Add to `tailwind.config.ts` (`theme.extend.fontSize`) and use these names instead of arbitrary pixel classes:

| Token | Size / line-height | Use |
|---|---|---|
| `text-body` | 16 / 26 | Body copy, abstracts, post bodies |
| `text-ui` | 15 / 22 | Buttons, nav links, inputs, card meta |
| `text-meta` | 14 / 20 | Secondary text, timestamps, author lines |
| `text-label` | 12 / 16, `uppercase tracking-eyebrow` | Eyebrows, badges only |
| `text-h1` | 40 / 44 serif (`lg`), 32 / 36 (base) | Page titles |
| `text-h2` | 28 / 34 serif | Section titles |
| `text-h3` | 20 / 28 serif | Card titles, post titles |

- Update `.btn`, `.btn-primary`, `.input`, `.eyebrow` in `app/globals.css` to these tokens; minimum interactive height 40 px (`h-10`), 36 px for pill-in-card buttons.
- Nothing smaller than `text-meta` (14 px) except `text-label`.
- Colour semantics are fixed: **terracotta** = integrity concerns only, **sage** = breakout/high impact only; ink is the interactive/active colour. Do not use red/green for vote state.
- Keep `prefers-reduced-motion` handling. No animated number count-ups.

---

## 7. File plan

**Create**
```
frontend/context/AuthContext.tsx
frontend/components/Navbar.tsx
frontend/components/shell/GlobalSearch.tsx
frontend/components/shell/AccountMenu.tsx
frontend/components/auth/LoginModal.tsx
frontend/components/auth/RequireRole.tsx
frontend/components/ui/RoleBadge.tsx
frontend/components/ui/Toast.tsx
frontend/components/ui/PrestigeTier.tsx
frontend/components/home/{Hero,StatsStrip,TrendingThemes,FeaturedPapers,BreakoutScholars,RecentDiscussions}.tsx
frontend/components/paper/{PaperCard,PaperDetail,CitationMetrics,SaveToCollection,LinkedDiscussions}.tsx
frontend/components/feed/{VoteButtons,ShareButton,PostActionBar,FeedRail,PostThread}.tsx
frontend/app/search/page.tsx
frontend/app/feed/[postId]/page.tsx
frontend/app/papers/[paperId]/page.tsx
frontend/app/papers/new/page.tsx            (P2)
db/migrations/002_post_votes.sql            (the db/migrations/ folder does not exist yet; db/ currently holds only schema.sql)
```

**Modify** — `app/layout.tsx` (Navbar, providers, container, Toast), `app/page.tsx` (Home), `app/globals.css`, `tailwind.config.ts`, `lib/api.ts` (auth header, new functions: `login`, `me`, `getHome`, `getPaper`, `getPost`, `votePost`, plus comment helpers; add the `ENDPOINTS` entries), `lib/format.ts`, `types/crc.ts` (`PaperDetail`, `PostDetail`, `HomePayload`, `AuthUser`, extend `FeedPost` with `author_id`, `comment_count`, `my_vote`; extend `Comment` with `author_role`), `lib/normalize.ts` (normalise new payloads defensively like the existing ones), `components/search/SearchWorkspace.tsx`, `components/feed/{FeedWorkspace,PostCard,Composer,CommentThread}.tsx`, `components/library/{LibraryWorkspace,PaperRow}.tsx`, `components/analytics/{AnalyticsWorkspace,AnomalyWatchlistCard,GatekeeperTester}.tsx`, `components/assistant/AssistantWorkspace.tsx`, `components/ui/SaveButton.tsx`, `lib/saves-context.tsx`.

**Delete** — `components/shell/Header.tsx`, `components/shell/MemberSwitcher.tsx`, `components/library/PaperDrawer.tsx`, `components/ui/Drawer.tsx` (only if unreferenced), `lib/member-context.tsx` (after migrating all call sites; run `grep -rn "member-context\|useMember" frontend` to confirm zero hits).

**Backend:** `backend/main.py`, `db/schema.sql`, `db/migrations/002_post_votes.sql`, `data_pipeline/seed_database.py`, `README.md`.

---

## 8. Data-contract rules for the frontend

- All network calls go through `lib/api.ts`. Normalise in `lib/normalize.ts`; components receive typed view models and never touch raw JSON.
- Every data-driven region has **loading, empty and error** states (`Skeleton`, `EmptyState`, `ErrorState`). A `404` from a detail endpoint is a *not found* state, not a generic error.
- Optimistic updates (votes, saves, comments) must roll back and surface a toast on failure.
- Never block page render on the auth check; render public content immediately and upgrade when `status` resolves.
- No `any`. Prefer `unknown` + narrowing in normalisers.

---

## 9. Execution order (each step must compile)

1. **Backend foundations:** migration, auth module + endpoints, `require_role`, token user override on write routes, `/api/papers/{id}`, `/api/posts/{id}`, comments, vote, `/api/home`, feed extensions. Verify with `python` + `curl`/the snippet in 5.6.
2. **Tokens and layout:** type scale, `globals.css`, container, `ToastProvider`.
3. **Auth:** `AuthContext`, `LoginModal`, `RequireRole`, `RoleBadge`; migrate `useMember` call sites; update `lib/api.ts`.
4. **Navbar + global search**; delete `Header`/`MemberSwitcher`; fix the scrollbar bug (2.2).
5. **Routes:** move search to `/search`; build Home.
6. **Feed:** card redesign, vote/share/comment pills, rail, then `/feed/[postId]` and the threaded comments.
7. **Papers:** `/papers/[paperId]`, then Library rework and drawer removal; tier display and recommendation de-dupe.
8. **Analytics:** tabs + role gates.
9. **P2:** `/papers/new`, assistant paper scoping polish.
10. **Verify** (Section 10).

---

## 10. Acceptance checklist

**Automated**
- [ ] `cd frontend && npx tsc --noEmit` → 0 errors
- [ ] `npx next lint` → clean; `npx next build` → succeeds, all routes listed (`/`, `/search`, `/feed`, `/feed/[postId]`, `/library`, `/papers/[paperId]`, `/assistant`, `/analytics`)
- [ ] `python -c "import ast; ast.parse(open('backend/main.py').read())"` passes

**Layout and scale (check at 390, 768, 1280, 1920 px, 100% zoom)**
- [ ] No horizontal scrollbar on any route
- [ ] No text under 14 px outside eyebrows/badges (`grep -rnE "text-\[(1[0-3](\.5)?)px\]" frontend/app frontend/components` returns only label/badge uses)
- [ ] No stray scrollbar arrows in the top bar

**Navigation and search**
- [ ] Navbar identical on every route; search input present on all; `/` focuses it (not while typing in a field); Enter → `/search?q=…`
- [ ] `/` shows Home with stats, themes, featured papers, spotlights, discussions, each with its own loading/error state

**Feed and papers**
- [ ] Clicking a post title/card opens `/feed/[postId]`; Share copies the exact URL and shows a toast
- [ ] Vote pill up/down toggles correctly, survives reload (server `my_vote`), reverts on failure
- [ ] Comments nest, Reply works inline, collapse works, depth caps at 5, `#c-<id>` deep link scrolls
- [ ] Every paper link anywhere (Home, Feed attachment, Search, Library, Recommendations) opens `/papers/[paperId]`; no drawer remains
- [ ] Library filters (text, school, year, tier) update live and persist in the URL; PageRank shows a tier, not `1.2e−3`; recommendations contain no duplicates

**Auth and roles**
- [ ] No unauthenticated one-click identity switch exists anywhere
- [ ] Wrong credentials → generic error, no account enumeration; 6th rapid failure → throttled
- [ ] Student cannot see or fetch the Integrity watchlist / Gatekeeper (verify the **network request is not sent**, and that calling the endpoint directly with a student token returns `403`)
- [ ] Faculty can use department filters; cannot see admin tabs
- [ ] Admin sees everything; Sign out clears the token and all member-scoped state
- [ ] An expired/invalid token → one "Session expired" toast and a clean signed-out UI

## 11. Decisions made here (change if you disagree)

- **Downvotes** require a `value` column on `post_upvotes`; `upvote_count` is treated as net score.
- **Auth** uses stdlib PBKDF2 + HMAC-signed bearer tokens rather than adding JWT/passlib. If you prefer `PyJWT`/`passlib[bcrypt]`, swap the helper functions only; the endpoint contracts stay the same.
- **Demo passcode:** seeded accounts all share `CRC_DEMO_PASSCODE` (default `chanakya-demo`) until real credentials are issued. Change it before any shared deployment.
- **Container width** stays `max-w-7xl` (1280 px) as specified; the "too small" feeling is fixed through the type scale, not by widening.
- **Out of scope:** dark mode, email/SMS verification, password reset, real SSO, comment voting, moderation tools.
