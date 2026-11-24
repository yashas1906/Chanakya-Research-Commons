# Chanakya Research Commons: Requirements Checklist and Pending Work

Checked against the DMW course project brief (submission due **28 Nov 2026**).
Audit date: 24 Nov 2026. Counts come from the live database at that date. **Phases 1–4 completed 24 Nov 2026** (rows below updated; numbers from `evaluation/evaluation_results.json`).

**Legend:** ✅ done · ⚠️ partly done or weak · ❌ missing · `[ ]` pending task

---

## Part A: Status against the brief

### F1. Accounts and profiles
| Requirement | Status | Notes |
|---|---|---|
| Register and log in with roles: student, faculty, researcher, admin | ✅ | Self-registration creates students; an admin changes roles. |
| Profile with department, interests (text and tags) | ✅ | Editable from the profile page (`PATCH /api/users/me`); the profile embedding is recomputed on save. |
| Links to publications or a personal page | ✅ | Personal page + up to 20 publication links, shown in the profile's About card. |
| Follow other members | ✅ | |
| Follow topics | ✅ | Follow buttons on trending topics, paper topics, search results and the Feed's topic filter; "Topics you follow" list in the Feed sidebar. |

### F2. Posts and discussions
| Requirement | Status | Notes |
|---|---|---|
| Create posts with tags | ✅ | |
| Attach papers or links from the library | ⚠️ | Papers ✅. Links only as text in the post body. |
| Comment, reply, upvote | ✅ | |
| Personal feed from followed people, followed topics and recommendations | ✅ | "Best" sort blends all three. |

### F3. Library
| Requirement | Status | Notes |
|---|---|---|
| Save from search results | ✅ | |
| Save by URL, DOI or arXiv ID | ✅ | "Add by DOI, arXiv or link" in the Library. Uses Crossref, arXiv or the page's own metadata; clear errors instead of placeholder papers; private-network links refused. |
| Personal collections | ✅ | |
| Private notes on saved items | ✅ | Write and edit notes in My saves and on the paper page. Re-saving no longer wipes notes. |
| Every save enters the shared library with a save count | ✅ | Counts match `library_saves` exactly. |

### F4. External content ingestion
| Requirement | Status | Notes |
|---|---|---|
| Paper metadata and abstracts from open scholarly sources | ✅ | OpenAlex + arXiv (arXiv fixed: https and 3 s between calls). 234 arXiv records loaded. |
| Articles from a curated set of RSS feeds | ✅ | 14 curated feeds in `data_pipeline/feeds.json`, stored as `item_type = 'article'` (129 articles). |
| Keep raw responses unchanged, then transform into tables | ✅ | Raw JSON/XML archived in MinIO; every record links to its raw file. |
| Scheduled batch refresh without reprocessing everything | ✅ | `ingest.py` keeps per-source cursors in `ingestion_state`, skips known items, logs `ingestion_runs`; `scheduler.py` (or the `scheduler` compose service) runs it every 6 h. |

### F5. Unified search
| Requirement | Status | Notes |
|---|---|---|
| One search box, four panels (external, library, people, posts) | ✅ | |
| Keyword and semantic search | ✅ | Rank fusion plus a PageRank boost. |
| External sources panel | ⚠️ | Queries the local OpenAlex copy only, not a live source. |
| Same paper from several sources appears once, sources listed | ✅ | MinHash/LSH + title + embedding verification merges duplicates into one record (46 merged, logged in `paper_merges`). Search and the paper page list every source. |

### F6. Recommendations
| Requirement | Status | Notes |
|---|---|---|
| Papers a member may want to read | ✅ | Profile embedding blended with saved-paper centroid. |
| Members to connect with | ✅ | |
| "Members who saved this also saved" on every library item | ✅ | All 461 library items return results: cached FP-Growth rules, then co-saves, then content similarity. Each result says which. |
| Sensible results for new users | ✅ | Falls back to profile text. |

### F7. Trends and monitoring
| Requirement | Status | Notes |
|---|---|---|
| Trending topics over a recent window | ✅ | Feed sidebar shows the 7-day vs 30-day sliding window with a spike badge; topics need at least 5 events. |
| Alerts when a topic suddenly spikes | ✅ | Raised by every scheduled refresh and on demand ("Scan for topic spikes" in the admin dashboard). |
| Spam / abnormal activity flags for admins | ✅ | Admin alert queue with "Not spam" / "Confirm", flag/clear in the members table, on-demand scan. Cleared members are not re-flagged unless they post again. Alerts are admin-only. Threshold tuning is Phase 3. |

### F8. Research assistant
| Requirement | Status | Notes |
|---|---|---|
| Plain-language questions | ✅ | |
| Answers grounded in retrieved papers with citations | ✅ | Refuses below a similarity cut-off; extractive fallback if Ollama is down. |
| Retrieved passages shown | ✅ | |

### F9. Admin analytics dashboard
| Requirement | Status | Notes |
|---|---|---|
| Research topics by department over time | ✅ | Monthly line chart of the most active topics, filterable by school. |
| Collaboration across departments | ✅ | School-to-school matrix. |
| Most saved and most discussed papers; engagement trends | ✅ | Both lists on the Activity tab (filterable by school), plus the existing engagement trend. |
| Drill-down university → department → topic → member | ✅ | Drill-down tab: university → school → topic → member (at Chanakya, `department` holds the school). |

### Data and seed corpus
| Requirement | Status | Notes |
|---|---|---|
| At least 500 papers with abstracts | ✅ | 741, all with abstracts and embeddings. |
| Citation links where available | ✅ | 188 internal edges (papers in the corpus rarely cite each other) plus OpenAlex global citation counts for 741 papers, used to validate PageRank (Spearman 0.41). |
| At least 50 members across at least 6 departments | ✅ | 62 members, 6 schools, all 4 roles. |
| At least 2,000 posts and comments | ✅ | 600 posts + 2,002 comments. |
| At least 10,000 save/view/search events over at least 6 months | ✅ | About 11,200 events, 22 May to 24 Nov (just over 6 months). |
| Follow links between members | ✅ | 360 member follows, 121 topic follows. |
| Documented generator with realistic patterns | ✅ | `seed_database.py`, `improve_data.py`. |
| Planted ground truth in a separate file | ✅ | Rebuilt by `evaluation/build_ground_truth.py` from the seed's planting rules: 30 duplicate pairs, 5 spam accounts, 3 spikes with a fixed anchor date. |
| Synthetic data replaceable without schema changes | ✅ | `users.is_synthetic` flag. |

### Evaluation
| Requirement | Status | Notes |
|---|---|---|
| Search quality vs baselines | ✅ | Held-out nDCG@10: hybrid 0.815 vs keyword 0.197 and old PageRank×50 hybrid 0.724; level with semantic-only (0.822, CIs overlap). PageRank weight tuned on dev queries (best = 0). |
| Matching / dedup quality | ✅ | Benchmark F1 1.00 vs 0.87 (old word-set MinHash) and 0.10 (exact title). Actual merges 45/46 correct, 30/30 planted duplicates merged. |
| Recommendation quality vs baselines | ⚠️ | New co-save + content hybrid: held-out recall@10 0.077 = item-CF, > popularity 0.019; beats the old formula on dev members (0.111 vs 0.049). Profile-only scored 0.115 on held-out members, so the result is within noise (26 members). Popularity was legitimately ~0: saves are spread thinly. |
| Spam detection | ✅ | One shared model, log-scaled features: PR-AUC 0.81, ROC-AUC 0.99; threshold 0.09 → P 0.83 / R 1.00. A post-count baseline scores PR-AUC 0.93 (report this). |
| RAG retrieval and refusal | ✅ | Hit@4 1.00; refusal rate 0.8 on out-of-corpus questions. |

### General expectations
| Requirement | Status | Notes |
|---|---|---|
| One Git repo with README (setup, architecture, reproduce results) | ⚠️ | README now lists every step (migrations, seed, improve_data, ingest, enrich, ELT, ground truth, evaluation). A clean from-scratch rerun has not been done yet (see Phase 3). |
| Config via environment files; no secrets committed | ✅ | All credentials come from `.env` (ignored by git); code stops with a clear message if one is missing and Docker Compose refuses to start without them. Old defaults remain in git history: they only ever protected local containers, but use fresh values for any shared deployment. |
| Runs locally on free / open-source software | ✅ | Docker Compose + local Ollama. |
| Report explains each library and model | ⬜ | Not part of this audit. Pending in the report. |

---

## Part B: Pending work in phases

### Phase 1: Missing requirements ✅ done
- [x] **F5 dedup:** use the MinHash/LSH duplicate detection in the app. Merge detected duplicates into one canonical paper with all sources listed (write a `paper_sources` row per source).
- [x] **F4 arXiv:** find out why arXiv records are missing and get them into `papers` / `paper_sources`.
- [x] **F4 RSS:** add an RSS/Atom feed fetcher for a curated feed list. Archive raw feeds in MinIO and load articles into their own table.
- [x] **F4 scheduling:** add a simple scheduler (cron or a Python scheduler) that runs incremental ingestion + ELT in batches. Verify `--incremental` only adds new items.
- [x] **F6 also-saved:** fall back to co-save similarity (or content similarity) when no association rules match, so every library item shows results. Cache the mined rules instead of recomputing per request.
- [x] **F1 profile edit:** add `PATCH /api/users/me` (bio, interests, tags, personal/publication links) and an edit form on the profile page. Recompute the profile embedding on save.

### Phase 2: Website gaps ✅ done
- [x] **F3:** "Add by DOI / arXiv ID / URL" box in the Library. Return an error instead of creating a placeholder paper when lookup fails. Support plain article URLs.
- [x] **F3:** write and edit private notes on saved papers.
- [x] **F1:** Follow / unfollow topic buttons (on tags, search results, trending topics).
- [x] **F7:** show trending topics from `/api/trends-and-anomalies` instead of counting loaded posts.
- [x] **F7:** admin alert list with Resolve / Unflag buttons (`/api/alerts`, `/api/alerts/{id}/resolve`). Optionally a "Run spam scan" button.
- [x] **F7:** create spike alerts live or on the scheduler, not only during seeding.
- [x] **F9:** drill-down view university → school → department → topic → member (add the topic level to the API).
- [x] **F9:** topic-by-department-over-time chart, and most saved / most discussed papers on the dashboard.

### Phase 3: Evaluation and data consistency ✅ done (one item open)
- [x] Duplicate detection scored on a benchmark corpus with the deployed detector, plus the system's actual merges (`paper_merges`) against planted labels and a manual audit (`evaluation/dedup_audit.json`).
- [x] Report note: the old 0.195 MinHash precision came from a stale ground-truth file; nearly all its "false positives" were planted or real OpenAlex duplicates.
- [x] `ground_truth.json` rebuilt from the seed's planting rules (`evaluation/build_ground_truth.py`, `evaluation/seed_labels.json`).
- [x] README pipeline steps complete (migrations, seed, `improve_data.py`, ingest, enrich citations, ELT, ground truth, evaluation).
- [ ] **Open:** re-run the full pipeline from scratch in a separate database to confirm it reproduces. Not done because re-seeding wipes the live database (including real accounts); OpenAlex results also change over time, so numbers will differ slightly.
- [x] Evaluation re-run; README results table replaced.
- [x] PageRank weight tuned on dev queries / reported on held-out queries; best weight is 0 (PageRank kept as tie-breaker, prestige tier, featured papers). Justification in README.
- [x] Recommendation evaluation fixed (double counting, wrong formula, dev/test member split); new co-save + content hybrid deployed. It ties item-CF on held-out members rather than beating it; explained in README.
- [x] Spam: one shared model (`backend/services/spam_service.py`), log-scaled features, threshold 0.09 from the sweep. The 3 false positives (Yashas Hombal, Divya Shetty, Fatima Sheikh) still need clearing with "Clear flag".
- [x] Duplicate detection precision improved (word 3-shingles + verification) and numbers reported for the deployed method.
- [x] Comment and vote events backfilled (migration 007) and tagged with topics; save events tagged; search events record the member.
- [x] Citation counts and reference edges fetched from OpenAlex (`data_pipeline/enrich_citations.py`, also run by the scheduler).

### Phase 4: Security and tidy-up ✅ done
- [x] The warehouse ELT and `/api/analytics/run-spam-job` contain two copies of the spam scan; move them into one shared module. (Done in Phase 3.)
- [x] Require login on `/api/recommendations/{user_id}` and only allow a member's own recommendations (or admin). (Done in Phase 3.)
- [x] `backend/tests/test_endpoints.py` registers new accounts in the live database on every run (76 members now vs 62); point tests at a separate test database or clean up after themselves.
- [x] Remove default passwords and the JWT key from `docker-compose.yml` and code defaults; read them from `.env` only.
- [x] Replace deprecated `@app.on_event("startup")` with a FastAPI lifespan handler.
- [x] Delete `CRC_Patches/`, `crc-frontend.patch` and `crc-frontend.zip` from the repo (old copies of the code).
- [x] Add backend tests for the main endpoints: 21 tests (`backend/tests/test_features.py`, `test_endpoints.py`); throwaway accounts use `@tests.crc.invalid` and are deleted by `conftest.py` (the 19 accounts left by earlier runs were removed).

### Phase 5: Submission
- [ ] Technical report: architecture, data design, method per feature and why, evaluation results, limitations, deployment plan for Chanakya.
- [ ] Explain each library and pretrained model used (sentence-transformers, pgvector, datasketch, NetworkX, mlxtend, scikit-learn, Ollama model, MinIO).
- [ ] README final pass: setup, architecture, how to reproduce every evaluation number.
- [ ] Demo script and viva preparation.

---

## Part C: Website walkthrough and UX audit (24 Nov 2026)

Checked by reading every page component, the API client and the backend endpoints, and querying the live database. Issues the user reported are marked **(reported)**.

### C1. How the site fits together

| Route | Component | What it is for | Main links out |
|---|---|---|---|
| `/` | `HomeWorkspace` | Landing page: quick search, six schools, featured papers, latest posts | `/library?school=`, `/papers/{id}`, `/feed/{id}`, `/search` |
| `/feed` | `FeedWorkspace` + `Composer` + `FeedRail` | Campus discussions. Sorts Best / New / Top; filters by school and topic in the left rail; trending topics, followed topics and suggested people in the right rail | `/feed/{id}`, `/papers/{id}` (attached paper), `/u/{id}` |
| `/feed/{postId}` | `PostThread` | One discussion: post, linked paper, comments, author card, more in this topic | `/papers/{id}`, `/assistant?paper=`, `/search?q=tag` |
| `/library` | `LibraryWorkspace` | Tabs: Chanakya holdings · Recommended · My saves · Collections. Left rail: sort, school, decade, PageRank tier. "Add by DOI, arXiv or link" button | `/papers/{id}` |
| `/papers/{paperId}` | `PaperDetail` | One paper: abstract, topics, citation metrics, discussions about it, "readers also saved", save, note, ask assistant, sources it was found in | `/library` (back link), `/feed?attach=` (start discussion), `/assistant?paper=` |
| `/search?q=` | `SearchWorkspace` + `ResultPanels` | Unified search: four panels (library, external, people, posts) in a 2×2 grid, related topics, follow-topic | `/papers/{id}`, `/feed/{id}`, `/feed` |
| `/assistant` | `AssistantWorkspace` | RAG Q&A with citations and retrieved passages; chat history | `/papers/{id}` |
| `/u/{userId}`, `/profile` | `ProfileView` | Member page: Follow button, tabs Overview / Posts / Comments / Collections / Saved (self) | `/feed/{id}`, `/papers/{id}` |
| `/admin`, `/analytics` | `AdminDashboard` | Admin only: overview, members, alerts, analytics, drill-down. `/analytics` redirects here | — |

Shell: the navbar has icon-only links (Home, Feed, Library, Assistant, plus Analytics for admins), a search toggle that opens `GlobalSearch`, a **+** button (`/feed?compose=1`) and the account menu. Only `/feed` and `/library` get the left filter rail.

**Where "Add by DOI, arXiv or link" fits.** It is requirement F3 ("save by URL, DOI or arXiv ID"). It covers papers that are *not* already in the Commons: you paste a DOI, arXiv ID or article URL, the backend (`POST /api/library/save-by-identifier`) looks it up in Crossref, arXiv or the page's own metadata, adds it to the shared corpus and saves it to your library. Keep it, but it needs a clearer place and label (see Phase 7).

### C2. Root causes found

| Symptom | Cause (verified) |
|---|---|
| **(reported)** My new post does not show under "New" | The feed query dropped every post whose author has `users.is_flagged_spam = TRUE`. The account Yashas Hombal was still flagged (one of the 3 spam false positives in Phase 3), so all of its posts were hidden in every sort, with no message explaining why. |
| **(reported)** "Start a discussion" does not start one | The link goes to `/feed?attach={paperId}`, but nothing read `attach`: the composer stayed closed and had no paper field. The paper page's only back link is hard-coded to `/library`. |
| **(reported)** No way to attach a paper to a post | `createPost` and `POST /api/posts` accept `attached_paper_id`, but `Composer` never sent it and had no paper picker. Only the 600 seeded posts have papers. |
| **(reported)** Browser Back skips pages | Library tabs and filters, feed search, the global scoped search and the admin tabs use `router.replace`, which overwrites the history entry. Feed sort, school and topic were local `useState`, not URL state, so they reset on Back. |
| **(reported)** Search is split confusingly | Papers are split into two separate panels by `in_chanakya_library` (library vs "external", but both come from the local DB). The same topic shows up in both, each with its own scroll box, inside a 2×2 grid. |
| **(reported)** Library shows "100" holdings | `getHoldings(100)` (API max 100) while 461 papers are in the library. Facet counts and filters only see those 100. |
| **(reported)** Discussions on a paper look unrelated or spammy | 120 of 600 seeded posts have a title that does not match their attached paper; seeded bodies are templated. `related_posts` filtered spam posts but not posts by spam-flagged authors. |
| No follow from a post | `PostCard` and `PostThread` link to the author but have no Follow button. The search People panel has neither a profile link nor a Follow button. |

### Phase 6: Broken flows ✅ done (24 Nov 2026; 4 new backend tests, 25/25 pass)
- [x] **Spam flag hides own posts:** cleared the false-positive flag on Yashas Hombal, Divya Shetty and Fatima Sheikh (24 Nov). Members now always see their own posts, marked "under review" if flagged.
- [x] **Attach a paper when posting:** "Attach a paper" in `Composer` opens a picker (your saves first, then any paper by title via the new `GET /api/papers/suggest`); the chosen paper is a removable chip. `POST /api/posts` now rejects an invalid (422) or unknown (404) paper.
- [x] **Start a discussion from a paper:** `/feed?attach=<id>` asks logged-out visitors to log in, then opens the composer with the paper attached.
- [x] **New post visible straight away:** after publishing, the feed switches to New (clearing filters), shows a "Your post is live" bar with a link to the post, and a toast.
- [x] **Browser Back:** feed sort, school and topic are in the URL (`?sort=&school=&topic=`) and pushed; Library tabs, sort and filters are pushed; admin tabs are pushed. Typing in the search bar still replaces (no history entry per keystroke). Analytics sub-tabs inside the admin dashboard still replace.
- [x] **Back links:** new `BackLink` on the paper and post pages: "← Back" returns to the previous in-app page; opened directly, it shows "← Library" / "← Feed".
- [x] **Paper discussions:** `related_posts` excludes posts by spam-flagged authors.

### Phase 7: Library redesign
- [ ] Tab order: **Chanakya holdings · My saves · Recommended · Collections**.
- [ ] Load all holdings (paginate or "Load more"; the API cap is 100), so the count says 461 and filters cover everything.
- [ ] One consistent page layout: header (title + one-line purpose) → tabs → toolbar row (filter-box search, sort dropdown, active filter chips, result count) → list. Move sort out of the left rail into the toolbar; keep school, decade and tier in the rail.
- [ ] Rename and reposition "Add by DOI, arXiv or link" to **"Add a paper not in the library"**, in the My saves toolbar and empty state, with one line explaining it.
- [ ] Paper rows: same card structure in every tab (title, authors · venue · year, 2-line abstract, meta row with tier, saves and topics, actions on the right).
- [ ] Recommended: shorten the long "How this list is made" box into a collapsible info line.
- [ ] Paper page: group the right sidebar into "Actions" (save + collection, note, ask assistant, share) and "About this record" (prestige, saved-by, sources, references).

### Phase 8: Search redesign
- [ ] Replace the 2×2 grid of scroll boxes with **one results page and tabs: All · Papers · People · Discussions**.
- [ ] Papers: one ranked list (library and external merged), with an "In Chanakya library" badge and a source filter (All / Library / External).
- [ ] "All" tab: top 5 papers, top 3 people and top 3 discussions, each with "See all →".
- [ ] Remove the internal scroll boxes; use page scroll and "Load more".
- [ ] People results: link to `/u/{id}` and add a Follow button. Discussion results: show the attached paper.
- [ ] Tab and query in the URL (`/search?q=&tab=`) so Back works.
- [ ] Scores (RRF, similarity) behind a "Why this result" tooltip rather than raw numbers.

### Phase 9: Feed and social
- [ ] **Follow from posts:** Follow / Following button on `PostCard`, on the `PostThread` author card, and in "Scholars you may know".
- [ ] **"Following" feed:** a Following sort or filter with posts from people and topics you follow; empty state linking to suggested people.
- [ ] Mark posts in "Best" with why they appear ("From someone you follow", "Topic you follow", "Recommended").
- [ ] Feed loads only 40 posts and the rail counts only those 40; add "Load more" and label the counts honestly.
- [ ] Composer: tag input as chips with suggestions from existing topics.
- [ ] Data: fix the 120 seeded posts whose title does not match their attached paper, and make templated bodies match the paper's school and topic.

### Phase 10: Navigation and polish
- [ ] Navbar is icon-only; add text labels on wide screens (or a visible label for the active page).
- [ ] One global search entry; label the scope chip clearly when the bar filters the current page on `/feed` and `/library`.
- [ ] Keep scroll position and loaded data when going Back to a list (cache `useAsync` results per URL).
- [ ] Consistent empty, loading and error states; every logged-out action (Start a discussion, Save, Follow) opens login and returns to the same place.
- [ ] Re-check every link and button in C1 after Phases 6–9, and add frontend smoke tests for these flows.
