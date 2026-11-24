# Chanakya Research Commons: Requirements Checklist and Pending Work

Checked against the DMW course project brief (submission due **28 Nov 2026**).
Audit date: 24 Nov 2026. Counts come from the live database at that date. **Phases 1, 2 and 3 completed 24 Nov 2026** (rows below updated; numbers from `evaluation/evaluation_results.json`).

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

### Phase 4: Security and tidy-up
- [x] The warehouse ELT and `/api/analytics/run-spam-job` contain two copies of the spam scan; move them into one shared module. (Done in Phase 3.)
- [x] Require login on `/api/recommendations/{user_id}` and only allow a member's own recommendations (or admin). (Done in Phase 3.)
- [ ] `backend/tests/test_endpoints.py` registers new accounts in the live database on every run (76 members now vs 62); point tests at a separate test database or clean up after themselves.
- [ ] Remove default passwords and the JWT key from `docker-compose.yml` and code defaults; read them from `.env` only.
- [ ] Replace deprecated `@app.on_event("startup")` with a FastAPI lifespan handler.
- [ ] Delete `CRC_Patches/`, `crc-frontend.patch` and `crc-frontend.zip` from the repo (old copies of the code).
- [ ] Add backend tests for the main endpoints (currently 1 test).

### Phase 5: Submission
- [ ] Technical report: architecture, data design, method per feature and why, evaluation results, limitations, deployment plan for Chanakya.
- [ ] Explain each library and pretrained model used (sentence-transformers, pgvector, datasketch, NetworkX, mlxtend, scikit-learn, Ollama model, MinIO).
- [ ] README final pass: setup, architecture, how to reproduce every evaluation number.
- [ ] Demo script and viva preparation.
