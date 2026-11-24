# Chanakya Research Commons: Requirements Checklist and Pending Work

Checked against the DMW course project brief (submission due **28 Nov 2026**).
Audit date: 24 Nov 2026. Counts come from the live database at that date. **Phase 1 completed 24 Nov 2026** (rows below updated).

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
| Follow topics | ⚠️ | API exists (`/api/topics/{topic}/follow`); no button in the website. |

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
| Save by URL, DOI or arXiv ID | ⚠️ | API handles DOI and arXiv. No input in the website. Plain URLs unsupported. Failed lookups save a fake placeholder paper. |
| Personal collections | ✅ | |
| Private notes on saved items | ⚠️ | Notes are displayed but cannot be written or edited in the website. |
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
| Trending topics over a recent window | ⚠️ | Backend sliding-window endpoint exists but the website doesn't use it; Feed counts tags on loaded posts instead. |
| Alerts when a topic suddenly spikes | ⚠️ | Created only when the pipeline runs, not live. Read-only for admins. |
| Spam / abnormal activity flags for admins | ⚠️ | Works, but has false positives (a real member was flagged) and admins have no unflag button. |

### F8. Research assistant
| Requirement | Status | Notes |
|---|---|---|
| Plain-language questions | ✅ | |
| Answers grounded in retrieved papers with citations | ✅ | Refuses below a similarity cut-off; extractive fallback if Ollama is down. |
| Retrieved passages shown | ✅ | |

### F9. Admin analytics dashboard
| Requirement | Status | Notes |
|---|---|---|
| Research topics by department over time | ⚠️ | Per-school topic totals and overall monthly totals, but no topic-over-time view. |
| Collaboration across departments | ✅ | School-to-school matrix. |
| Most saved and most discussed papers; engagement trends | ⚠️ | Engagement trend ✅. Most saved/discussed papers not on the dashboard. |
| Drill-down university → department → topic → member | ⚠️ | API `/api/analytics/drilldown` exists (no topic level) but is not used by the website. |

### Data and seed corpus
| Requirement | Status | Notes |
|---|---|---|
| At least 500 papers with abstracts | ✅ | 741, all with abstracts and embeddings. |
| Citation links where available | ⚠️ | Only 193 links; PageRank runs on a sparse graph. |
| At least 50 members across at least 6 departments | ✅ | 62 members, 6 schools, all 4 roles. |
| At least 2,000 posts and comments | ✅ | 600 posts + 2,002 comments. |
| At least 10,000 save/view/search events over at least 6 months | ✅ | About 11,200 events, 22 May to 24 Nov (just over 6 months). |
| Follow links between members | ✅ | 360 member follows, 121 topic follows. |
| Documented generator with realistic patterns | ✅ | `seed_database.py`, `improve_data.py`. |
| Planted ground truth in a separate file | ⚠️ | `ground_truth.json` is stale: 8 of its 20 planted duplicates no longer exist. |
| Synthetic data replaceable without schema changes | ✅ | `users.is_synthetic` flag. |

### Evaluation
| Requirement | Status | Notes |
|---|---|---|
| Search quality vs baselines | ⚠️ | Deployed setup (hybrid + PageRank, nDCG@10 0.70) scores below semantic-only (0.80). |
| Matching / dedup quality | ⚠️ | MinHash F1 0.26 (precision 0.195), and the app doesn't use it. |
| Recommendation quality vs baselines | ⚠️ | Personalised recall@5 0.05 < item-CF baseline 0.075. Popularity baseline at exactly 0.0 suggests a bug. |
| Spam detection | ⚠️ | App threshold 0.18 sits where evaluated recall falls to 0.4 or lower. |
| RAG retrieval and refusal | ✅ | Hit@4 0.93; refusal rate 0.8 on out-of-corpus questions. |

### General expectations
| Requirement | Status | Notes |
|---|---|---|
| One Git repo with README (setup, architecture, reproduce results) | ⚠️ | README is thorough, but its steps skip `improve_data.py`, so results don't reproduce. |
| Config via environment files; no secrets committed | ⚠️ | `.env` is ignored, but `docker-compose.yml` and code contain default passwords and a JWT signing key. |
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

### Phase 2: Website gaps (backend exists, no UI)
- [ ] **F3:** "Add by DOI / arXiv ID / URL" box in the Library. Return an error instead of creating a placeholder paper when lookup fails. Support plain article URLs.
- [ ] **F3:** write and edit private notes on saved papers.
- [ ] **F1:** Follow / unfollow topic buttons (on tags, search results, trending topics).
- [ ] **F7:** show trending topics from `/api/trends-and-anomalies` instead of counting loaded posts.
- [ ] **F7:** admin alert list with Resolve / Unflag buttons (`/api/alerts`, `/api/alerts/{id}/resolve`). Optionally a "Run spam scan" button.
- [ ] **F7:** create spike alerts live or on the scheduler, not only during seeding.
- [ ] **F9:** drill-down view university → school → department → topic → member (add the topic level to the API).
- [ ] **F9:** topic-by-department-over-time chart, and most saved / most discussed papers on the dashboard.

### Phase 3: Evaluation and data consistency
- [ ] Score duplicate detection from `paper_merges` (the system's actual merges) instead of recomputing MinHash inside `evaluate_all.py`.
- [ ] Note for the report: with stale ground truth, MinHash looked like precision 0.195; inspection showed nearly all "false positives" were planted or real OpenAlex duplicates.
- [ ] Regenerate `ground_truth.json` from the current database (or re-seed cleanly), so planted duplicates, spam accounts and spikes all exist.
- [ ] Add `improve_data.py` to the README pipeline steps in the right order, then re-run the full pipeline from scratch to confirm it reproduces.
- [ ] Re-run `evaluation/evaluate_all.py` and update the README results table.
- [ ] Tune the PageRank weight in search so the deployed setup beats semantic-only, or justify it in the report.
- [ ] Fix the popularity baseline (0.0) in the recommendation evaluation; improve the personalised method so it beats item-CF, or explain why not.
- [ ] Set the spam threshold from the evaluation curve; unflag false positives (for example Yashas Hombal).
- [ ] Improve MinHash precision (shingle size, threshold) and report the numbers of the method the app actually uses.
- [ ] Log comment and vote events in `activity_events` (currently 2 and 13 events vs 2,002 comments and 503 votes), and record `user_id` on search events.
- [ ] Optionally fetch more citation links from OpenAlex (`referenced_works`) to strengthen PageRank.

### Phase 4: Security and tidy-up
- [ ] Require login on `/api/recommendations/{user_id}` and only allow a member's own recommendations (or admin).
- [ ] Remove default passwords and the JWT key from `docker-compose.yml` and code defaults; read them from `.env` only.
- [ ] Replace deprecated `@app.on_event("startup")` with a FastAPI lifespan handler.
- [ ] Delete `CRC_Patches/`, `crc-frontend.patch` and `crc-frontend.zip` from the repo (old copies of the code).
- [ ] Add backend tests for the main endpoints (currently 1 test).

### Phase 5: Submission
- [ ] Technical report: architecture, data design, method per feature and why, evaluation results, limitations, deployment plan for Chanakya.
- [ ] Explain each library and pretrained model used (sentence-transformers, pgvector, datasketch, NetworkX, mlxtend, scikit-learn, Ollama model, MinIO).
- [ ] README final pass: setup, architecture, how to reproduce every evaluation number.
- [ ] Demo script and viva preparation.
