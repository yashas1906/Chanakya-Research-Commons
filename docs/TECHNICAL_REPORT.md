# Chanakya Research Commons: Technical Report

**Course:** Data Mining and Warehousing (DMW), Semester 5, Chanakya University
**Submission:** 28 November 2026
**Repository:** `Chanakya-Research-Commons/` (this report: `docs/TECHNICAL_REPORT.md`)

All figures in this report come from the live development database on 25 November 2026 and from
`evaluation/evaluation_results.json`, regenerated the same day by `evaluation/evaluate_all.py`.

---

## Contents

1. [Summary](#1-summary)
2. [Problem and scope](#2-problem-and-scope)
3. [System architecture](#3-system-architecture)
4. [Data design](#4-data-design)
5. [Methods, feature by feature](#5-methods-feature-by-feature)
6. [Evaluation](#6-evaluation)
7. [Libraries and pretrained models](#7-libraries-and-pretrained-models)
8. [Limitations](#8-limitations)
9. [Deployment plan for Chanakya University](#9-deployment-plan-for-chanakya-university)
10. [Reproducing the results](#10-reproducing-the-results)
11. [Appendix A: Requirement trace](#appendix-a-requirement-trace)
12. [Appendix B: Main API endpoints](#appendix-b-main-api-endpoints)

---

## 1. Summary

Chanakya Research Commons (CRC) is a research platform for the university's six schools. Members keep a
shared library of papers, discuss them in a feed, search papers, people and discussions from one box, get
recommendations, and ask a research assistant that answers only from retrieved papers and cites them.
Administrators get a dashboard built on a star-schema data warehouse, with trend and spam alerts.

The data-mining methods behind it, and what they achieved on held-out or planted test data:

| Feature | Method | Result |
|---|---|---|
| Duplicate records across sources | MinHash + LSH on word 3-shingles, verified by title overlap and embedding similarity, merged with union-find | F1 **1.00** on a 29-pair benchmark (exact-title baseline 0.10); 45 of 46 real merges correct |
| Unified search | Reciprocal Rank Fusion of pgvector semantic search and PostgreSQL full-text search | nDCG@10 **0.81** on 25 held-out queries (keyword-only 0.20) |
| Citation authority | PageRank over the internal citation graph (NetworkX) | Spearman **0.41** against OpenAlex global citation counts |
| Recommendations | Co-save collaborative filtering + content similarity, z-score blended | Recall@10 **0.107** on held-out members (popularity 0.018; ties item-CF) |
| "Members who saved this also saved" | FP-Growth association rules, then co-saves, then embedding similarity | Answers for **461 / 461** library items |
| Trending topics and spike alerts | 7-day vs 30-day sliding-window rate ratio | Recall@3 **1.00**, alert precision **1.00** on 3 planted spikes |
| Spam accounts | Isolation Forest on log-scaled posting behaviour | ROC-AUC **0.975**, PR-AUC 0.73 on 5 planted spammers |
| Research assistant | Dense retrieval over abstract chunks + local LLM (Llama 3.2 3B via Ollama), similarity refusal gate | Hit@4 **1.00**; refuses **4 / 5** out-of-corpus questions |
| Admin analytics | Star schema (4 dimensions, 2 facts), FP-Growth / FP-Max topic bundles, Ward clustering | Drill-down university → school → topic → member |

Everything runs locally on free software: Docker Compose (PostgreSQL 16 with pgvector, MinIO, Ollama),
a FastAPI backend and a Next.js frontend.

---

## 2. Problem and scope

Research at a young, multi-school university is scattered. A paper one student finds useful stays in their
own downloads folder; the people working on a topic in another school are hard to find; and general
search engines know nothing about who at Chanakya is reading what. The brief asked for a "research commons"
that brings these together and uses data mining to make it useful:

- **F1** accounts and profiles with roles, interests, and follows (people and topics);
- **F2** posts and discussions with tags, attached papers, comments, replies, votes and a personal feed;
- **F3** a shared library with saves, collections, private notes and save counts;
- **F4** ingestion from open scholarly sources and RSS, keeping raw responses, in scheduled batches;
- **F5** one search box over external papers, the library, people and posts, keyword plus semantic, with
  duplicates merged;
- **F6** recommendations of papers and people, "also saved", and sensible cold-start behaviour;
- **F7** trending topics, spike alerts and spam flags;
- **F8** a research assistant that answers from retrieved papers with citations;
- **F9** an admin analytics dashboard with drill-down;
- a seed corpus (≥ 500 papers, ≥ 50 members over ≥ 6 departments, ≥ 2,000 posts and comments,
  ≥ 10,000 events over ≥ 6 months) with **planted ground truth** for evaluation.

Out of scope: full-text PDF processing, a live connection to the university's identity provider, and
real member data (all members except one test account are synthetic and flagged `is_synthetic`).

---

## 3. System architecture

```
 OpenAlex API    arXiv API    14 RSS / Atom feeds    Crossref / web page metadata (save-by-identifier)
      │              │                │                         │
      └──────────────┴────────┬───────┘                         │
                              ▼                                 │
   data_pipeline/ingest.py  (incremental, cursor per source/topic/feed)
      │  1. archive each raw response unchanged ──► MinIO  raw-ingestion/{openalex,arxiv,rss}/…
      │  2. parse → embed (MiniLM, 384-d) → MinHash signature → chunk abstracts
      │  3. entity resolution (dedup.py): MinHash LSH + verification → merge into one record
      ▼
 ┌──────────────────────────── PostgreSQL 16 + pgvector + pg_trgm ────────────────────────────┐
 │  public (OLTP)                                    dw (star schema, rebuilt by run_dw_elt.py) │
 │  users, follows, papers, paper_sources,           dim_date, dim_member, dim_paper, dim_topic │
 │  paper_chunks, paper_citations, paper_merges,     fact_research_activity                     │
 │  library_saves, collections, posts, comments,     fact_dept_collaboration                    │
 │  post_upvotes, activity_events, system_alerts,    views: topic baskets, researcher profiles  │
 │  ingestion_state, ingestion_runs                                                             │
 └───────────────▲──────────────────────────────────────────────────────▲──────────────────────┘
                 │ SQL (pooled connections)                              │ ELT every 6 h
 ┌───────────────┴─────────────── FastAPI backend (backend/main.py) ──┐  │ data_pipeline/scheduler.py
 │ auth (JWT) · feed · posts · library · search (RRF) · recommend     │  │   ingest → dedup → PageRank
 │ also-saved (FP-Growth) · trends · spam (Isolation Forest)          │  │   → star schema → alerts
 │ assistant (retrieve → Ollama) · admin + analytics (OLAP queries)   │──┘
 └───────────────▲───────────────────────────────────────▲───────────┘
                 │ JSON over HTTP                        │ HTTP
 ┌───────────────┴──────────────┐            ┌───────────┴───────────┐
 │ Next.js 14 frontend (:3000)  │            │ Ollama (:11434)       │
 │ Home · Feed · Library ·      │            │ llama3.2:3b           │
 │ Search · Assistant · Paper · │            └───────────────────────┘
 │ Profile · admin Dashboard    │
 └──────────────────────────────┘
```

**Why this shape.** One PostgreSQL instance holds the operational tables, the vectors (pgvector) and the
warehouse (`dw` schema). For a university of this size that avoids running and synchronising a separate
vector database and OLAP engine, while the separate `dw` schema keeps analytical queries away from the
tables the website writes to. MinIO plays the role of a data lake: raw API responses are stored before any
parsing, so a parser bug can be fixed and the data re-derived without calling the source again. The
expensive or global computations (deduplication, PageRank, warehouse rebuild, alert scans) run in batch;
everything a member waits for (search, feed, recommendations, retrieval) is a single indexed SQL query.

**Components and where they live**

| Component | Path | Role |
|---|---|---|
| Schema | `db/schema.sql`, `db/migrations/002–010` | OLTP + warehouse DDL; migrations are idempotent (`db/apply_migrations.py`) |
| Seed generator | `data_pipeline/seed_database.py`, `improve_data.py` | Real papers from OpenAlex/arXiv; synthetic members and 6 months of activity with planted patterns |
| Ingestion | `data_pipeline/ingest.py`, `feeds.json`, `scheduler.py` | Incremental batches from OpenAlex, arXiv, RSS; 6-hourly refresh |
| Entity resolution | `data_pipeline/dedup.py` | MinHash LSH, verification, union-find merge, `paper_merges` log |
| Warehouse ELT | `data_pipeline/run_dw_elt.py`, `enrich_citations.py` | PageRank, topic clustering, star schema, spike and spam alerts |
| Backend | `backend/main.py`, `backend/services/*.py`, `backend/domains.py` | REST API; search, recommendation, spam and mining logic shared with the evaluation |
| Frontend | `frontend/` | Next.js 14 (App Router, TypeScript, Tailwind) |
| Evaluation | `evaluation/build_ground_truth.py`, `evaluate_all.py` | Ground truth from planting rules; every metric in §6 |
| Tests | `backend/tests/` | 33 API tests against the development database; test accounts clean up after themselves |

---

## 4. Data design

### 4.1 Operational schema (`public`)

```
users ─┬─ user_follows (follower → followee)        papers ─┬─ paper_sources   (one row per source record)
       ├─ topic_follows (topic or domain)                    ├─ paper_chunks    (abstract chunks + vectors)
       ├─ collections ─┐                                     ├─ paper_citations (citing → cited)
       ├─ library_saves ┴──────────────────────────► papers  └─ paper_merges    (audit of duplicate merges)
       ├─ posts ─┬─ comments (parent_comment_id → threads)
       │         └─ post_upvotes (value −1 / +1)
       └─ activity_events (search, view_paper, save_paper, create_post, add_comment, vote_post)
system_alerts (topic_spike, spam_account) · ingestion_state (cursors) · ingestion_runs (audit)
```

Design decisions:

- **One canonical `papers` row per work**, with every source in `paper_sources`. Search, saves, posts and
  citations all point at the canonical row, so merging a duplicate moves them across in one place.
  `papers.sources` (JSONB) caches the source list for display.
- **Articles are papers with `item_type = 'article'`.** RSS articles and web pages are searched, saved,
  discussed and used by the assistant exactly like papers, without a parallel set of tables.
- **Vectors live next to the data**: `papers.embedding`, `paper_chunks.chunk_embedding`,
  `users.profile_embedding`, `posts.post_embedding` (all 384-d, HNSW cosine indexes).
- **`activity_events` is the single event log** (14,389 rows). It feeds trends, spam features,
  recommendations evaluation and the warehouse. Each event carries `topic_tags` so topic trends need no join.
- **Library membership is derived:** `papers.in_chanakya_library` is true when a member has saved the paper
  or an administrator posted it (`papers.created_by`), and `save_count` always equals the rows in
  `library_saves`.
- **Posts are filed under a fixed list of 32 research domains** (`backend/domains.py`). Free-text tags
  fragmented the feed's filter (typos and one-off tags); a closed vocabulary keeps topic counts meaningful.
  Paper-level topics ("VLSI design") map to their domain, so following a paper topic still matches posts.
- **Synthetic data is replaceable:** every generated member has `is_synthetic = TRUE`; real accounts can be
  added beside them and the synthetic ones deleted without schema changes.

**Indexes.** HNSW (`vector_cosine_ops`) on every embedding column; GIN on the generated `tsvector` columns
of papers (title weight A, abstract weight B) and posts; B-tree on `activity_events(occurred_at)`, on
`comments(post_id, created_at)` and on foreign keys used in joins; unique constraints on DOI and arXiv ID.

### 4.2 Data lake (MinIO)

Every API response (OpenAlex JSON, arXiv Atom XML, RSS/Atom XML) is written unchanged to the
`raw-ingestion` bucket, keyed by source, topic or feed, and date, before it is parsed. Each
`paper_sources` row stores `raw_minio_path`, so any record can be traced to the bytes it came from.

### 4.3 Data warehouse (`dw` star schema)

```
              dim_date (date_key, full_date, year, quarter, month, week_of_year, academic_semester)
                                 │
 dim_member ───── fact_research_activity ───── dim_topic (topic_name, parent_cluster)
 (role, school,   (date, member, topic, paper:  │
  is_active)       saves, posts, comments,      dim_paper (title, year, primary_source,
                   upvotes, views)                         pagerank_tier)

 fact_dept_collaboration (date_key, source_department, target_department, interaction_type, interaction_count)
```

- **Grain.** `fact_research_activity`: one row per date × member × topic × paper with additive counts.
  `fact_dept_collaboration`: one row per date × ordered pair of schools × interaction type (follow or
  comment).
- **Conformed dimensions.** `dim_member` and `dim_date` are shared by both facts, so engagement and
  collaboration can be sliced by the same school and semester.
- **Derived attributes.** `dim_paper.pagerank_tier` (High / Medium / Low at the 80th and 40th percentiles).
  `dim_topic.parent_cluster` comes from Ward agglomerative clustering of topic centroids (the mean
  embedding of each topic's papers) into four clusters named after their largest topics.
- **Analytical views.** `vw_paper_topic_baskets` (one basket of topics per paper, for FP-Growth / FP-Max)
  and `vw_researcher_profiles` (per-member publication and engagement features, for clustering).
- **Rebuild.** `run_dw_elt.py` rebuilds the warehouse from the operational tables after each ingestion
  batch (every 6 hours with the scheduler). At this data size a full rebuild takes seconds and avoids
  slowly-changing-dimension bookkeeping; §9 describes the incremental load for production.

The dashboard's queries (monthly engagement, topic activity by school, the school-to-school collaboration
matrix, most saved and most discussed papers, and the drill-down) read only from `dw`.

### 4.4 Seed corpus and planted ground truth

| Item | Brief | In the database |
|---|---|---|
| Papers and articles with abstracts | ≥ 500 | **1,089** (960 papers + 129 RSS articles), all with abstracts and embeddings |
| Source records | | 772 OpenAlex, 234 arXiv, 129 RSS; 46 duplicates merged |
| Citation links | where available | 188 internal edges + OpenAlex global citation counts |
| Members | ≥ 50 across ≥ 6 departments | 61 (60 synthetic) across 6 schools, all 4 roles |
| Posts + comments | ≥ 2,000 | 601 + 2,002 |
| Events | ≥ 10,000 over ≥ 6 months | 14,389, 22 May – 25 Nov 2026 (searches 5,284; views 5,253; comments 2,002; saves 735; posts 602; votes 513) |
| Follows | | 362 member follows, 120 topic follows |
| Library | | 726 saves by 61 members, 61 collections, 461 library items |

Papers are real (OpenAlex and arXiv results for 24 research topics, four per school, plus RSS articles).
Members and their activity are generated by `seed_database.py` (fixed random seed) and made realistic by
`improve_data.py`: Indian names, school-appropriate interests, posts that discuss papers on the author's own
topics, comments in several registers, and votes. The generator plants patterns with known answers:

- **30 near-duplicate papers** (perturbed punctuation, "and" → "&", "(Preprint)" suffixes);
- **5 spam accounts** that post 120 promotional posts in bursts minutes apart;
- **3 topic spikes** (graph neural networks, CRISPR gene editing, data privacy law) over five days before a
  fixed anchor date.

`evaluation/build_ground_truth.py` rebuilds `evaluation/ground_truth.json` from the planting rules recorded
in `evaluation/seed_labels.json`, never from any detector's output, so the evaluation cannot grade itself.

---

## 5. Methods, feature by feature

Each subsection says what runs, the parameters, and why it was chosen over the alternatives.

### F1. Accounts, profiles and follows

- Passwords are hashed (bcrypt, or PBKDF2-SHA256 with 200,000 iterations for seeded accounts); sessions are
  HS256 JWTs valid for 8 hours. Five failed logins per identifier per minute triggers throttling.
- Roles: student, researcher, faculty, admin. Every admin route is checked on the server
  (`require_role("admin")`), not only hidden in the interface.
- A profile's text (role, school, bio, interests) is embedded with MiniLM into `users.profile_embedding`
  and re-embedded on every edit. That one vector drives the feed ranking, people suggestions and cold-start
  recommendations.

### F2. Posts, discussions and the feed

Members post with a title, body, up to three research domains and an optional attached paper; comments
nest by `parent_comment_id`; votes are ±1 and stored as a running total.

**"Best" feed ranking** (signed in): for every post,

```
relevance = 2.0 · [author is followed] + 1.5 · [post is in a followed domain or topic] + cos(post, profile)
```

ordered by relevance, then by recency. The two social terms are larger than any similarity (cosine ≤ 1),
so followed people come first, followed domains next, and content similarity orders the rest. Each post
shows the reason it is there ("From someone you follow", "On a topic you follow", "Recommended for you").
*Why:* a transparent additive score is easy to explain to members and to tune; with ~600 posts a learned
ranker would have too little feedback to train on. Other sorts: New, Top (votes) and Following (only
followed people and domains).

**Karma** is the sum of vote scores on a member's (non-flagged) posts.

### F3. Library

- Saving writes `library_saves`, recomputes `save_count` and sets `in_chanakya_library`. Collections and
  private notes hang off the save; re-saving never wipes an existing note.
- **Save by DOI, arXiv ID or URL**: the backend looks the identifier up in Crossref, the arXiv API or the
  page's own `citation_*` / Open Graph metadata. If nothing is found it returns a clear error rather than
  creating a placeholder; private-network URLs are refused. New items are embedded, chunked and filed under
  the school and topic most common among their seven nearest neighbours.
- **Admin holdings**: administrators can post a paper or article with every field (title, type, authors,
  abstract, venue, year, DOI, arXiv ID, link, school, topics) straight into the library, then edit or
  delete it; each holding records who posted it.

### F4. External content ingestion

- **Sources.** OpenAlex (metadata, abstracts reconstructed from the inverted index, references, citation
  counts), arXiv (Atom API, 3 s between calls as arXiv asks) and 14 curated RSS/Atom feeds, each assigned to
  a school (`data_pipeline/feeds.json`). Only feeds published for syndication are used; pages are never
  scraped.
- **Raw first.** Each response goes to MinIO unchanged before parsing (§4.2).
- **Incremental batches.** `ingestion_state` keeps a cursor per source, topic or feed (OpenAlex paging
  cursor, arXiv offset, RSS `ETag` / `Last-Modified` for conditional GET). Records whose external ID, DOI or
  arXiv ID is already known are skipped *before* the expensive embedding step. Each run is logged in
  `ingestion_runs` (fetched / inserted / skipped).
- **Schedule.** `scheduler.py` runs ingestion, entity resolution and the warehouse ELT every 6 hours (RSS
  every cycle, scholarly sources less often), either as a process or as the `scheduler` Compose service.

### F5. Entity resolution (duplicates across sources)

The same work often arrives twice: an arXiv preprint and its OpenAlex journal record, or a reformatted title.

1. **Signature.** 128-permutation MinHash over word 3-shingles of title + abstract (`datasketch`).
2. **Candidates.** MinHash LSH with threshold 0.5 returns pairs whose estimated Jaccard similarity is likely
   above 0.5, without comparing all ~600,000 pairs.
3. **Verification.** A candidate pair is accepted if it shares a DOI or arXiv ID, or if its exact shingle
   Jaccard ≥ 0.5 *and* (title word Jaccard ≥ 0.4 or embedding cosine ≥ 0.93).
4. **Merge.** Accepted pairs are grouped with union-find; each group keeps one canonical record. Sources,
   saves, notes, posts, citations and events move to it, and the merge is logged in `paper_merges`.
5. **Author names.** Name variants ("A. Kumar" / "Arun Kumar") match on surname plus compatible initials.

*Why MinHash + LSH:* exact title matching misses reformatted titles and wrongly matches short generic titles
("Introduction"); pairwise embedding comparison is quadratic. LSH makes candidate generation near-linear,
and the cheap verification step removes the false candidates that an LSH threshold alone lets through
(word *sets* at 0.65 gave precision 0.76; word 3-shingles plus verification gave 1.00).

### F5. Unified search

One query feeds four panels: Chanakya library papers, open-literature papers, people and discussions.
Papers are ranked by **Reciprocal Rank Fusion** of two candidate lists (40 each):

```
score(p) = 1 / (60 + semantic_rank(p)) + 1 / (60 + keyword_rank(p)) + w · pagerank_percentile(p)
```

- *Semantic rank*: nearest papers to the query embedding (pgvector HNSW, cosine).
- *Keyword rank*: PostgreSQL full-text search (`plainto_tsquery`, `ts_rank` on the GIN-indexed tsvector).
- *w = 0*: the PageRank weight was swept on 26 development queries and every positive weight lowered nDCG
  (0.753 at 0 → 0.730 at 0.001 → 0.661 at 0.05), so PageRank only breaks ties (and drives the prestige tier
  and featured papers).

*Why RRF:* the two scores are on incomparable scales (cosine distance vs `ts_rank`); RRF uses only ranks, has
one well-known constant (k = 60), needs no training data and is robust when one list is empty (a query with
no keyword match still gets semantic results). The search also proposes related topics from FP-Growth rules
with lift ≥ 1.5 for query expansion, and records each search as an event.

**PageRank.** NetworkX PageRank (damping 0.85) over the directed citation graph of papers in the corpus,
recomputed by the ELT. It is shown as a prestige tier (percentile) on each paper.

### F6. Recommendations

**Papers for a member** (`backend/services/recommendation_service.py`):

```
content(p) = 0.7 · cos(p, profile) + 0.3 · cos(p, centroid of the member's saved papers)
cf(p)      = ln(1 + Σ over other members m: |saves(m) ∩ my saves| · [m saved p])      (item co-saves)
score(p)   = 1.0 · z(cf) + 0.5 · z(content)
```

`z()` standardises each signal over the candidate papers so they are on one scale; a signal with no spread
(e.g. co-saves for a member with no saves) contributes nothing, so **new members get content-only results
from their profile text** (the cold-start case). Weights were chosen on a development half of the members
and reported on the other half (§6.3). Each recommendation says why ("Saved by readers with libraries like
yours", "Similar to papers you saved", "Fits your profile and interests").

**People to connect with**: nearest profile embeddings, excluding people already followed.

**"Members who saved this also saved"**, filled in three tiers so every library item gets an answer:

1. **Association rules**: FP-Growth (`mlxtend`) over member libraries (each member's saves is one basket),
   pairs only, minimum support of two members, ranked by confidence then lift. Rules are cached until the
   library changes, not recomputed per request.
2. **Co-saves**: other papers in the libraries of members who saved this one.
3. **Similar papers**: nearest library papers by embedding, for items nobody has co-saved yet.

*Why tiers:* with 726 saves spread over 461 papers, rules alone answer only 151 items (a third). The tiers keep the
explainable rule-based answer where data supports it and fall back gracefully, and the interface says
which tier produced each suggestion.

### F7. Trends, spikes and spam

**Trending topics and spike alerts.** For each topic, events in the last 7 days are compared with the
average weekly rate over the preceding 30 days:

```
spike_ratio = events_7d / max(weekly_rate_30d, ε)        alert when ratio ≥ 1.5 and events_7d ≥ 5
```

The minimum count stops tiny topics from "spiking" on two events. Spike alerts are raised by every
scheduled refresh and on demand from the dashboard, and stored in `system_alerts` for review.
*Why:* a rate ratio against the topic's own baseline is interpretable ("+183 % on a usual week") and works
for topics of very different sizes; it needs no labelled history.

**Spam accounts** (`backend/services/spam_service.py`): an Isolation Forest (150 trees, fixed seed) over
three features per member: log(1 + post count), log(1 + mean seconds between posts) and mean upvotes.
Members with fewer than two posts get a neutral gap (one post has no gap to measure). The anomaly score is
`−decision_function`; members at or above 0.09 are flagged into the admin queue, where an administrator
confirms or clears them. Cleared members are not re-flagged unless they post again.
*Why Isolation Forest:* spam is rare and unlabelled in a real deployment, so a supervised classifier has
nothing to learn from; Isolation Forest isolates unusual points with few random splits and needs no labels.
Log scaling matters: on raw seconds, a member who posts every few weeks looked as anomalous as a bot (PR-AUC
0.56 raw vs higher with log features).

A second Isolation Forest (`anomaly_service.py`, the "gatekeeper") scores new paper submissions on
abstract length, co-author and keyword counts against the corpus, for the admin's submission tester.

### F8. Research assistant (retrieval-augmented generation)

1. Abstracts are split into chunks (about two per paper, 2,073 chunks) and embedded.
2. The question is embedded and the 4 nearest chunks are retrieved (pgvector cosine), optionally limited
   to the library or to one paper.
3. **Refusal gate:** chunks with similarity below **0.32** are dropped. If none remain, the assistant says
   the library has nothing on it (for open questions it may then answer from general knowledge, clearly
   labelled and with no citations; paper-scoped and library-only questions never fall back).
4. The prompt numbers the passages and instructs the model to answer only from them and cite every claim
   as [1], [2]; temperature 0.2. The answer streams to the browser with the retrieved passages shown beside
   it, each linked to its paper.
5. If Ollama is down, an **extractive fallback** returns the passage sentences most similar to the question,
   still with citation numbers.

*Why this design:* retrieval grounds the answer in the university's corpus and makes it checkable; the
similarity gate is the simplest defence against confident answers to questions the corpus cannot support;
a 3-billion-parameter local model runs on a laptop CPU, so no member data leaves the machine.

### F9. Admin dashboard and analytics

Visible to administrators only (checked on the server):

- **Overview**: totals, members by role and school, top contributors, and the alert queue (topic spikes;
  suspected spam with "Not spam, clear flag" / "Confirm spam").
- **Members**: searchable, sortable directory; per member, change role, and view, edit or delete any post.
- **Chanakya holdings**: post, edit and delete library records; posting history.
- **Analytics** (all from the `dw` schema): monthly engagement with change vs the prior month; topic activity
  by school over time; school-to-school collaboration matrix; most saved and most discussed papers;
  drill-down university → school → topic → member.
- **Topic associations**: FP-Growth and FP-Max over paper topic baskets per school (support ≥
  max(0.04, 3 / baskets), lift ≥ 1.2), giving co-occurring topics and maximal topic bundles.
- **Researcher archetypes**: Ward agglomerative clustering of member profiles (publications, citations,
  co-authors, PageRank, topic breadth), checked with the silhouette score; each cluster is described by
  tertile trait rules.

---

## 6. Evaluation

`evaluation/evaluate_all.py` imports the same SQL and constants the API uses (`search_service.py`,
`recommendation_service.py`, `spam_service.py`, `dedup.py`), so the numbers describe the deployed system,
not a re-implementation. Where a setting is tuned, it is tuned on a development split and reported on held-out
data. 95 % confidence intervals are bootstrap intervals over queries or members (1,000 resamples).

### 6.1 Duplicate detection (F4/F5)

Benchmark: the 1,089-record corpus plus planted copies (1,118 records, 29 unambiguous planted pairs).

| Method | Precision | Recall | F1 |
|---|---|---|---|
| Exact title match | 0.054 | 0.690 | 0.101 |
| Word-set MinHash LSH 0.65 (original method) | 0.763 | 1.000 | 0.866 |
| **Deployed: 3-shingle MinHash LSH 0.5 + verification** | **1.000** | **1.000** | **1.000** |

Merges actually made in the database: **45 of 46 correct (precision 0.978)**, all 30 planted duplicates
merged. The single error merged a book with one of its chapters, which share an abstract in OpenAlex.
Author name-variant matching: **0.933** accuracy on 15 pairs.

### 6.2 Unified search (F5)

51 benchmark queries across the six schools, graded 0/1/2 by whether the query's terms appear in a paper's
title or topics; 26 development queries (for the PageRank weight), 25 held out.

| System (held-out queries) | nDCG@10 [95 % CI] | MRR |
|---|---|---|
| Keyword only (full-text) | 0.197 [0.089, 0.316] | 0.44 |
| Semantic only (pgvector) | 0.822 [0.703, 0.926] | 0.83 |
| Previous hybrid with PageRank × 50 | 0.724 [0.590, 0.843] | 0.73 |
| **Deployed hybrid RRF (w = 0)** | **0.815 [0.694, 0.920]** | **0.83** |

The hybrid is level with semantic-only search (intervals overlap) and far ahead of keyword search, which
fails on paraphrased queries. It is kept over semantic-only because exact terms (acronyms, author names, rare
technical words) are where embedding search is weakest, and RRF lets the keyword list rescue them at no cost
on this benchmark. Removing the old PageRank boost raised held-out nDCG from 0.724 to 0.815.

**PageRank validity:** Spearman ρ = **0.41** (p ≈ 2 × 10⁻⁴⁶) between corpus PageRank and OpenAlex global
citation counts over 1,089 papers. The graph has only 188 internal edges (papers in a topic-sampled corpus
rarely cite each other), which is why PageRank is a weak relevance signal here.

### 6.3 Recommendations (F6)

Temporal hold-out: the last 20 % (at least one) of each member's saves are hidden; the model must rank them in
its top 10 out of 1,089 papers. 56 members with saves, split alternately into development (weights chosen)
and test halves.

| Method | Recall@10 (test) | nDCG@10 (test) | Recall@10 (all) |
|---|---|---|---|
| Popularity | 0.018 | 0.022 | 0.018 |
| Profile similarity only | 0.036 | 0.036 | 0.071 |
| Saved-paper centroid only | 0.054 | 0.026 | 0.051 |
| Previous 0.5 profile + 0.5 centroid | 0.054 | 0.031 | 0.069 |
| Item-based collaborative filtering | 0.107 | 0.075 | 0.107 |
| **Deployed co-save + content hybrid** | **0.107** | **0.066** | **0.098** |

The hybrid ties item-CF on held-out members and beats every content-only baseline and popularity. With 28
test members the confidence intervals overlap ([0.018, 0.214] for both CF and the hybrid), so the honest
conclusion is "as good as CF, much better than popularity", not "better than CF". It is deployed because,
unlike pure CF, it still produces sensible results for members with no saves (content term only). Absolute
recall is low because saves are spread thinly: 726 saves over 1,089 candidate papers.

"Also saved" coverage (measured by calling the endpoint for every library item): association rules alone
answer 151 of 461 library items; with the co-save and similarity tiers **461 / 461**.

### 6.4 Trends and spam (F7)

**Topic spikes** (3 planted, anchored at the planted burst): the top 3 topics by spike ratio are exactly the
three planted ones (**recall@3 = 1.00**), and alerts at ratio ≥ 1.5 contain only those (**precision = recall
= 1.00**).

**Spam accounts** (5 planted among 61 members):

| Method | PR-AUC | ROC-AUC |
|---|---|---|
| Baseline: rank by post count | 0.925 | 0.991 |
| **Isolation Forest (deployed)** | **0.730** | **0.975** |

At the deployed threshold 0.09: precision 0.67, recall 0.80 (4 of 5 spammers, 2 false alarms). The best-F1
threshold on today's population is 0.08 (precision 0.71, recall 1.00).

Two honest findings. (1) A one-feature baseline ranks better, because the planted spammers differ mainly in
volume; the forest is kept because it needs no hand-set rule for other kinds of unusual behaviour (bursty
timing, ignored posts), and every flag goes to a human review queue. (2) The threshold is unstable: on
24 November, when 15 leftover test accounts were still in the population, the same threshold gave precision
0.83 and recall 1.00. With five positives, a threshold "tuned" on the same accounts it is reported on is
optimistic. In deployment the threshold would be set from the admin's confirm / clear decisions (§9).

### 6.5 Research assistant (F8)

| Test | Result |
|---|---|
| 15 in-corpus questions: a passage from the expected paper is in the top 4 (Hit@4) | **1.00** |
| Mean top-1 similarity (in-corpus) | 0.70 |
| Share of question terms found in the retrieved passages | 0.73 |
| Mean retrieval latency | 22 ms |
| 5 out-of-corpus "trap" questions refused at similarity < 0.32 | **0.80** (mean top-1 similarity 0.24) |

Answer generation by the LLM is not scored automatically (that needs human judgement); retrieval quality
and the refusal gate are what the system controls.

### 6.6 Software tests

33 backend tests (`backend/tests/`) exercise the API end to end against the development database: login and
throttling, profiles, posts with attached papers, domain validation, feeds and follow reasons, library saves
and notes, save-by-identifier, search panels, recommendations privacy, also-saved, trends, moderation,
drill-down, admin holdings (create / edit / duplicate DOI / delete), admin post moderation and role changes,
and comment editing and deletion (author only; placeholder kept when a comment has replies).
Test accounts use a reserved domain and are deleted with everything they created.

---

## 7. Libraries and pretrained models

| Library / model | Version | Used for | Why this one |
|---|---|---|---|
| **sentence-transformers** with **all-MiniLM-L6-v2** | ≥ 2.2 | 384-d embeddings of papers, chunks, profiles, posts and queries | Small (≈ 80 MB, 6 layers), fast on CPU, trained on 1 billion sentence pairs for semantic similarity; good retrieval quality for its size. A larger model (e.g. all-mpnet-base, 768-d) would double index size and latency for a modest gain. |
| **PostgreSQL 16 + pgvector** (HNSW) | pg16 | Vector storage and approximate nearest-neighbour search; also all relational data and the warehouse | Vectors sit next to the rows they describe, so a search can join, filter (library only, one paper) and rank in one SQL query. HNSW gives sub-linear search with high recall. |
| PostgreSQL full-text search (`tsvector`, GIN) and **pg_trgm** | built in | Keyword ranking for search; fuzzy matching | Stemming, stop words and weighted fields (title A, abstract B) without another service. |
| **datasketch** | ≥ 1.6 | MinHash signatures and MinHash LSH for duplicate detection | Mature implementation of MinHash and LSH buckets; makes candidate generation near-linear. |
| **NetworkX** | ≥ 3.0 | Citation graph and PageRank | Standard, well-tested graph algorithms; the graph (≈ 1,100 nodes) fits in memory easily. |
| **mlxtend** | ≥ 0.23 | FP-Growth, FP-Max and association rules (also-saved, topic bundles, search expansion) | FP-Growth avoids Apriori's candidate generation, so it is faster on sparse baskets; mlxtend gives support, confidence, lift and conviction directly. |
| **scikit-learn** | ≥ 1.3 | Isolation Forest (spam, submission gatekeeper), Ward agglomerative clustering (topics, researcher archetypes), silhouette score, StandardScaler | Reference implementations with fixed random seeds for reproducible results. |
| pandas, NumPy, SciPy | | Feature tables, basket matrices, Spearman correlation, bootstrap intervals | |
| **Ollama** with **Llama 3.2 3B** (`llama3.2:3b`) | latest | Answer generation in the research assistant | Runs locally on a laptop CPU (≈ 2 GB quantised), so questions and library data stay on university machines; good instruction following for its size. Replaceable via `OLLAMA_MODEL`. |
| **MinIO** | latest | S3-compatible object store for raw API responses (data lake) | Same API as Amazon S3, so the code moves to any S3-compatible store unchanged; runs in one container. |
| FastAPI, Pydantic, Uvicorn | ≥ 0.100, 2.x | REST API, request validation, OpenAPI docs | Typed request models reject bad input before it reaches SQL; automatic docs at `/docs`. |
| psycopg2 | ≥ 2.9 | PostgreSQL driver with a threaded connection pool | |
| PyJWT, bcrypt / passlib | | Session tokens, password hashing | |
| requests | | OpenAlex, arXiv, RSS, Crossref calls | |
| Next.js 14, React 18, TypeScript, Tailwind CSS, lucide-react | | Frontend | App Router pages, type-checked API client, consistent design tokens. |
| Docker Compose | | PostgreSQL, MinIO, Ollama, backend, frontend, pipeline and scheduler services | One command to run the whole stack on free software. |

**External data sources** (all free and open): OpenAlex (CC0 metadata), the arXiv API, Crossref, and the
RSS/Atom feeds listed in `data_pipeline/feeds.json`.

---

## 8. Limitations

1. **Synthetic community.** Members, posts, comments and events are generated. The planted patterns are
   cleaner than real behaviour (spammers that differ mainly in volume, spikes with a sharp onset), so the
   spam and spike results are upper bounds on real performance.
2. **Small evaluation samples.** 25 held-out search queries, 28 held-out members and 5 spam accounts give wide
   confidence intervals; several comparisons (hybrid vs semantic search, hybrid vs item-CF) are ties.
3. **Automatic relevance labels.** Search relevance is graded by query terms in titles and topics, not by
   human judges. This favours keyword overlap somewhat and cannot judge relevance that is purely conceptual.
4. **Sparse citation graph.** Only 188 internal citation edges, so PageRank adds no relevance and the
   prestige tier is coarse.
5. **Spam threshold.** Tuned on five positives and visibly unstable when the population changes (§6.4).
6. **Assistant reads abstracts only.** No full-text PDFs, so detailed method questions cannot be answered;
   answer quality of the 3B model is not scored automatically.
7. **External panel is a local copy.** The "open literature" panel searches papers already ingested from
   OpenAlex/arXiv, not a live query to those services.
8. **Links in posts** are plain text in the body; only papers can be attached as records.
9. **Single machine.** One PostgreSQL instance, in-process caches and a full warehouse rebuild suit the
   current size, not tens of thousands of members.
10. **No from-scratch re-run in a separate database.** Re-seeding wipes the live database, and OpenAlex
    results change over time, so a fresh seed will give slightly different counts and scores.

---

## 9. Deployment plan for Chanakya University

**Phase 0: Preparation (2–3 weeks).**
- Host on a university VM (8 vCPU, 32 GB RAM, 200 GB SSD) or an equivalent cloud instance; a small GPU or a
  separate inference VM for Ollama if answer latency matters.
- Replace demo passcodes with **single sign-on** through the university's Google Workspace or Microsoft
  Entra ID (OIDC); map staff/student groups to roles; keep local admin accounts for break-glass access.
- Managed or self-hosted PostgreSQL with daily backups and point-in-time recovery; MinIO with versioning (or
  any S3-compatible store); secrets from a vault, TLS via the campus reverse proxy.
- Delete synthetic members (`is_synthetic = TRUE`) and their activity; keep the real paper corpus.
- Publish a privacy notice under India's **Digital Personal Data Protection Act, 2023**: what is logged
  (searches, views, saves), why (recommendations, trends), retention (e.g. raw events 12 months, then
  aggregated in `dw` only), and how to export or delete one's data.

**Phase 1: Pilot (one semester, one or two schools).**
- Seed the library from each school's reading lists and faculty publications (via DOI import and admin
  holdings); add school-specific RSS feeds.
- Run the scheduler every 6 hours; monitor ingestion runs, API latency and error rates.
- Collect **real labels**: admin confirm / clear decisions on spam flags, "not relevant" feedback on search
  and recommendations, and thumbs up/down on assistant answers.

**Phase 2: Re-tune on real data.**
- Re-set the spam threshold from the confirm / clear history (precision target set by moderators' time).
- Re-run the search benchmark with human relevance judgements from librarians and faculty.
- Re-fit recommendation weights on real save histories; consider a larger embedding model if search
  quality is the bottleneck.

**Phase 3: University-wide.**
- Incremental warehouse loads (append facts by date partition, type-2 history for member role/school changes)
  instead of full rebuilds; partition `activity_events` by month.
- Move caches (also-saved rules, search expansion) to Redis if the API runs on several workers.
- Add full-text PDFs for open-access papers (chunked like abstracts) so the assistant can answer method-level
  questions.
- Dashboard for the research office: topic trends by school, cross-school collaboration, most-used papers
  for library acquisitions.

**Success measures.** Weekly active members per school; share of searches that end in a save or open;
cross-school follows and discussions (from `fact_dept_collaboration`); moderator precision on spam flags;
assistant answers rated helpful.

---

## 10. Reproducing the results

Prerequisites: Docker Desktop, Python 3.12, Node.js 18+. Copy `.env.example` to `.env` and set the passwords,
`CRC_AUTH_SECRET` and `CRC_DEMO_PASSCODE`.

```bash
docker compose up -d postgres minio ollama
python -m venv .venv && .venv/Scripts/activate        # Windows; use .venv/bin/activate elsewhere
pip install -r backend/requirements.txt

python db/apply_migrations.py                         # schema + migrations 002–010
python data_pipeline/seed_database.py                 # OpenAlex/arXiv papers, synthetic community, planted truth
python data_pipeline/improve_data.py                  # realistic names, comments, votes
python -m data_pipeline.fix_post_papers --apply       # attach seeded posts to on-topic papers
python data_pipeline/ingest.py                        # next batch incl. RSS, then entity resolution
python data_pipeline/enrich_citations.py              # OpenAlex citation counts and reference edges
python data_pipeline/run_dw_elt.py                    # PageRank, star schema, alerts

python evaluation/build_ground_truth.py               # labels from the planting rules
python evaluation/evaluate_all.py                     # every number in §6 → evaluation/evaluation_results.json
python -m pytest backend/tests -q                     # 33 API tests

docker exec -it crc_ollama ollama pull llama3.2:3b    # for the assistant
python start.py                                       # backend :8000, frontend :3000, opens the browser
```

| Report section | Key in `evaluation/evaluation_results.json` |
|---|---|
| 6.1 Duplicate detection | `F4_F5_entity_resolution` |
| 6.2 Search, PageRank | `F5_unified_search`, `F5_pagerank_validation` |
| 6.3 Recommendations | `F6_recommendations` |
| 6.4 Spikes and spam | `F7_trends_and_spam` |
| 6.5 Assistant | `F8_assistant_retrieval` |

---

## Appendix A: Requirement trace

| Brief | Where it is implemented | Evidence |
|---|---|---|
| F1 roles, profiles, follows | `main.py` auth, `/api/users/*`, `/api/topics/*/follow`; Profile page | Tests: profile edit, follows |
| F2 posts, comments, votes, feed | `/api/posts`, `/api/feed`; Feed, post pages | §5 F2; tests: feed reasons, posts |
| F3 library, collections, notes, save by ID | `/api/library/*`, `/api/collections/*`; Library | §5 F3; tests: notes, save-by-identifier |
| F4 ingestion, raw lake, schedule | `ingest.py`, `feeds.json`, `scheduler.py`, MinIO | §5 F4; `ingestion_runs` |
| F5 unified search, dedup | `search_service.py`, `dedup.py`, `/api/search` | §6.1, §6.2 |
| F6 recommendations, also saved | `recommendation_service.py`, `/api/papers/{id}/also-saved` | §6.3 |
| F7 trends, spikes, spam | `/api/trends-and-anomalies`, `spam_service.py`, alert queue | §6.4 |
| F8 assistant | `/api/assistant/ask[/stream]`, Assistant page | §6.5 |
| F9 dashboard, drill-down | `/api/admin/*`, `/api/analytics/*`, `dw` schema | §4.3, §5 F9 |
| Seed corpus + ground truth | `seed_database.py`, `improve_data.py`, `build_ground_truth.py` | §4.4 |
| Evaluation vs baselines | `evaluate_all.py` | §6 |
| Runs locally on free software | `docker-compose.yml`, `start.py` | §10 |
| Explain libraries and models | This report | §7 |

## Appendix B: Main API endpoints

Interactive documentation: `http://localhost:8000/docs`.

| Method and path | Purpose |
|---|---|
| `POST /api/auth/register`, `/api/auth/login`, `GET /api/auth/me` | Accounts and sessions |
| `PATCH /api/users/me`, `GET /api/users/{id}` | Profiles |
| `POST/DELETE /api/users/{id}/follow`, `/api/topics/{topic}/follow` | Follows |
| `GET /api/feed?sort=best\|new\|top\|following` | Feed with reasons |
| `POST/PATCH/DELETE /api/posts[/{id}]`, `POST /api/posts/{id}/vote`, `/comments` | Discussions |
| `GET /api/library`, `POST /api/library/save`, `/save-by-identifier`, `/api/collections/*` | Library |
| `GET /api/search?q=` | Four-panel hybrid search + related topics |
| `GET /api/recommendations/{user_id}`, `/api/papers/{id}/also-saved` | Recommendations |
| `GET /api/papers/{id}` | Paper page (sources, citations, discussions) |
| `GET /api/trends-and-anomalies`, `/api/alerts`, `POST /api/alerts/{id}/resolve` | Trends and moderation |
| `POST /api/assistant/ask`, `/api/assistant/ask/stream` | Research assistant |
| `GET /api/admin/overview`, `/api/admin/members`, `/api/admin/members/{id}/posts`, `PATCH .../role` | Admin |
| `GET/POST/PATCH/DELETE /api/admin/holdings[/{id}]` | Admin library holdings |
| `GET /api/analytics/overview`, `/drilldown`, `/topic-associations`, `/researcher-archetypes`, `/anomalies` | Warehouse analytics |
