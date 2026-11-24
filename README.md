# Chanakya Research Commons (CRC)

> **DMW (Data Mining & Warehousing) Course Project** — Semester 5, Chanakya University  
> An intelligent academic research commons combining an operational PostgreSQL/pgvector database, a star-schema data warehouse, graph mining (PageRank), vector/hybrid search (RRF), association rule mining (FP-Growth), unsupervised anomaly detection (Isolation Forest), RAG with local LLM (Ollama), and a dual frontend (Next.js + Instant Static React UI). Seeded with live research literature from the OpenAlex API and archived to an S3-compatible raw data lake (MinIO).

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [End-to-End System Architecture](#2-end-to-end-system-architecture)
3. [DMW Core Concepts & Feature Mapping](#3-dmw-core-concepts--feature-mapping)
4. [Database Design & Schema Architecture](#4-database-design--schema-architecture)
   - [4.1 Operational / OLTP Schema (`public`)](#41-operational--oltp-schema-public)
   - [4.2 Data Warehouse / OLAP Schema (`dw` Star Schema)](#42-data-warehouse--olap-schema-dw-star-schema)
   - [4.3 Vector & Indexing Strategy](#43-vector--indexing-strategy)
5. [Data Pipeline & Ingestion Engine](#5-data-pipeline--ingestion-engine)
   - [5.1 Stage 1: Ingestion & Seeding (`seed_database.py`)](#51-stage-1-ingestion--seeding-seed_databasepy)
   - [5.2 Stage 2: Deduplication, PageRank & Star Schema ELT (`run_dw_elt.py`)](#52-stage-2-deduplication-pagerank--star-schema-elt-run_dw_eltpy)
6. [Backend API Architecture (FastAPI)](#6-backend-api-architecture-fastapi)
7. [Frontend Applications](#7-frontend-applications)
   - [7.1 Instant Browser UI (`frontend_static/index.html`)](#71-instant-browser-ui-frontend_staticindexhtml)
   - [7.2 Production Next.js App Router (`frontend/`)](#72-production-nextjs-app-router-frontend)
8. [Evaluation Framework & Benchmarks](#8-evaluation-framework--benchmarks)
9. [Infrastructure Setup (Docker)](#9-infrastructure-setup-docker)
10. [Quick Start Guide](#10-quick-start-guide)
11. [Environment Variables](#11-environment-variables)
12. [Project Structure](#12-project-structure)
13. [Changelog](#13-changelog)

---

## 1. Project Overview

Chanakya Research Commons is designed for university research communities (students, faculty, scholars, and administrators) spanning six key academic schools:
- **SAHSS** - School of Arts, Humanities and Social Sciences
- **SBS** - School of Biosciences
- **SOE** - School of Engineering
- **SLGPP** - School of Law, Governance and Public Policy
- **SMS** - School of Management Sciences
- **SMNS** - School of Mathematics and Natural Sciences

The platform addresses core challenges in university research lifecycle management:
1. **Literature Discovery & Deduplication**: Harvesting canonical papers across disciplines, deduplicating preprints and versioned works via MinHash Locality-Sensitive Hashing (LSH).
2. **Unified Hybrid Search**: Blending semantic vectors (HNSW cosine similarity), lexical full-text search (`tsvector` + GIN), and citation network authority (PageRank) via Reciprocal Rank Fusion (RRF).
3. **Collaborative Research Graph**: Modeling social follows, paper saves, discussions, and multi-department interaction facts.
4. **Intelligent Recommendations**: Combining vector similarity with Market Basket Analysis (FP-Growth Association Rule Mining) to discover "Users Who Saved X Also Saved Y".
5. **Community Health & Trend Analytics**: Sliding-window spike detection for emerging topics and unsupervised Isolation Forests to flag bot/spam bursts.
6. **Grounded Question Answering (RAG)**: Chunk-level semantic retrieval coupled with a local Ollama LLM (`llama3.2:3b`) for citation-backed research assistance.
7. **Institutional Decision Support**: A dimensional Star Schema tracking research throughput, departmental velocity, and interdisciplinary collaboration.

---

## 2. End-to-End System Architecture

```
                                  ┌────────────────────────────────┐
                                  │      OpenAlex Open API         │
                                  │   (Real Research Literature)   │
                                  └───────────────┬────────────────┘
                                                  │ HTTP REST (24 Topics across 6 Schools)
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 DATA PIPELINE & ELT ENGINE                                      │
│                                                                                                 │
│  [ Stage 1: seed_database.py ]                                                                  │
│    • Raw Payload Extraction ───────────► MinIO Data Lake (`raw-ingestion/openalex/*.json`)      │
│    • 128-Perm MinHash Signatures                                                                │
│    • all-MiniLM-L6-v2 Embeddings (384-d) ──► PostgreSQL `papers` & `paper_chunks`              │
│    • Synthetic Member Generation (60 users: 55 authentic + 5 spam)                              │
│    • Activity Simulator (10,500+ events, 600 posts, 2,000 comments, 3 planted topic spikes)     │
│                                                                                                 │
│  [ Stage 2: run_dw_elt.py ]                                                                     │
│    • MinHashLSH Deduplication (threshold=0.65) ──► evaluation/predicted_duplicates.json         │
│    • NetworkX Citation Graph PageRank (alpha=0.85) ──► papers.pagerank_score                    │
│    • Agglomerative Clustering on Topic Vectors ──► 4 Broad Research Clusters                    │
│    • Star Schema ELT ──► dw.dim_*, dw.fact_research_activity, dw.fact_dept_collaboration       │
└────────────────────────────────────────┬────────────────────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                  POSTGRESQL 16 + PGVECTOR                                       │
│                                                                                                 │
│   ┌───────────────────────────────────────────┐   ┌──────────────────────────────────────────┐  │
│   │        Operational / OLTP (`public`)      │   │        Data Warehouse / OLAP (`dw`)      │  │
│   │ • users (profile_embedding)               │   │ • dim_date (academic semester)           │  │
│   │ • papers (embedding, search_tsv, minhash) │   │ • dim_member (role, dept, active)        │  │
│   │ • paper_sources (MinIO data lake path)    │   │ • dim_paper (PageRank tier)              │  │
│   │ • paper_chunks (chunk_embedding for RAG)  │   │ • dim_topic (parent cluster)             │  │
│   │ • library_saves, collections              │   │ • fact_research_activity                 │  │
│   │ • posts, comments, post_upvotes           │   │ • fact_dept_collaboration                │  │
│   │ • activity_events, system_alerts          │   │                                          │  │
│   └───────────────────────────────────────────┘   └──────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────────────────────┬───────────────────────┘
                        │                                                 │
                        ▼                                                 ▼
┌─────────────────────────────────────────────────┐     ┌─────────────────────────────────────────┐
│                FASTAPI BACKEND                  │     │           LOCAL LLM (OLLAMA)            │
│                 (Port: 8000)                    │◄───►│              (Port: 11434)              │
│  • Hybrid 4-Panel Search (RRF + PageRank)       │     │ • llama3.2:3b                           │
│  • Personalized Feed & Recommendations          │     │ • Prompt grounding & inline citations  │
│  • Market Basket FP-Growth ("Also Saved")       │     └─────────────────────────────────────────┘
│  • Sliding-Window Trend Spikes                  │
│  • Isolation Forest Spam Scoring                │
│  • Star Schema OLAP Analytics Endpoint          │
└───────────────────────┬─────────────────────────┘
                        │
         ┌──────────────┴──────────────┐
         ▼                             ▼
┌───────────────────────────┐  ┌────────────────────────────────────────┐
│  INSTANT PREVIEW FRONTEND │  │        FULL NEXT.JS FRONTEND           │
│  (`frontend_static/`)     │  │             (`frontend/`)              │
│  • Zero-build React 18    │  │ • Next.js 14 App Router, TypeScript    │
│  • Tailwind CSS via CDN   │  │ • Modern components & dashboard        │
│  • Runs directly in browser│ │ • npm run dev (Port: 3000)             │
└───────────────────────────┘  └────────────────────────────────────────┘
```

---

## 3. DMW Core Concepts & Feature Mapping

| Project Feature | Practical Implementation | Core DMW Concept |
|---|---|---|
| **F1: Member Graph** | 60 synthetic members, interest tags, 384-d profile vectors, user-follows | Relational Data Modeling, Vector Representation |
| **F2: Dynamic Feed** | Cosine similarity against user profile + follow network boost | Content-Based Filtering & Social Graph Weighting |
| **F3: University Library** | Shared canonical repository, user collections, private annotations | Relational Junctions, Entity Consolidation |
| **F4: Raw Ingestion Lake** | OpenAlex payload capture, raw JSON archived to MinIO bucket | Data Ingestion, S3-Compatible Object Storage |
| **F5: Deduplication** | 128-permutation MinHash + LSH with Jaccard threshold = 0.65 | Dimensionality Reduction, Locality-Sensitive Hashing |
| **F5: Authority Scoring** | Directed citation network analysis using NetworkX PageRank ($\alpha=0.85$) | Link Analysis, Web Mining, Graph Centrality |
| **F5: Hybrid Search** | 4-panel RRF: $1/(60+s_{rank}) + 1/(60+k_{rank}) + 10 \times \text{PageRank}$ | Information Retrieval, Reciprocal Rank Fusion |
| **F5: Search Expansion** | High-lift association rules (`lift >= 1.5`) recommend related query topics | Query Expansion & Association Mining |
| **F6: "Also Saved" Rules** | Frequent itemset mining over library save baskets (`mlxtend`) | Association Rule Mining, FP-Growth Algorithm |
| **F6: Topic Baskets & Bundles** | Subgroup-stratified FP-Growth & FP-Max (`len >= 2`) on `dw.vw_paper_topic_baskets` | Maximal Frequent Itemsets & Multi-Level Association Rules |
| **F6: Researcher Clustering** | Ward Agglomerative Clustering + discretized tertile trait rules (FP-Growth) | Hierarchical Clustering & Profile Discovery |
| **F7: Trend Detection** | 7-day sliding window counts compared to 30-day baseline average | Time-Series Stream Mining, Concept Drift |
| **F7: Bot/Spam Filter** | Unsupervised Isolation Forest on post frequency, delta, upvotes | Outlier & Anomaly Detection |
| **F8: Grounded RAG** | Abstract chunking (2 chunks/paper), vector cosine match, Ollama LLM | Retrieval-Augmented Generation, Dense Retrieval |
| **F9: Data Warehouse** | Date, Member, Topic, Paper dimensions; Research & Collaboration facts | Dimensional Modeling, Star Schema, OLAP Cubes |

---

## 4. Database Design & Schema Architecture

The database `chanakya_commons` runs inside PostgreSQL 16 equipped with `pgvector` and `pg_trgm`.

### 4.1 Operational / OLTP Schema (`public`)

```
users (UUID PK, university_id, full_name, profile_embedding, role, department, spam_score)
  ├── user_follows (follower_id, followee_id)
  ├── topic_follows (user_id, topic_tag)
  ├── collections (collection_id, user_id, name)
  ├── library_saves (save_id, user_id, paper_id, collection_id, private_notes)
  │         │
  │         ▼
  │     papers (paper_id, canonical_title, abstract, authors, embedding, search_tsv, pagerank_score)
  │       ├── paper_sources (source_id, paper_id, source_name, raw_minio_path)
  │       ├── paper_citations (citing_paper_id, cited_paper_id)
  │       └── paper_chunks (chunk_id, paper_id, chunk_index, chunk_embedding)
  │
  ├── posts (post_id, author_id, attached_paper_id, post_embedding, search_tsv, upvotes)
  │     ├── comments (comment_id, post_id, author_id, parent_comment_id)
  │     └── post_upvotes (user_id, post_id)
  │
  └── activity_events (event_id BIGSERIAL, user_id, event_type, target_id, topic_tags, occurred_at)
```

### 4.2 Data Warehouse / OLAP Schema (`dw` Star Schema)

```
             ┌─────────────────────────┐
             │       dw.dim_date       │
             │ (date_key, quarter,     │
             │  academic_semester)     │
             └────────────┬────────────┘
                          │
  ┌─────────────────┐     │     ┌─────────────────┐
  │  dw.dim_member  ├─────┼─────┤   dw.dim_topic  │
  │ (member_key,    │     │     │ (topic_key,     │
  │  role, dept)    │     │     │  parent_cluster)│
  └─────────────────┘     │     └─────────────────┘
                          │
                          ▼
            ┌───────────────────────────┐
            │ dw.fact_research_activity │
            │ (date_key, member_key,    │
            │  topic_key, paper_key,    │
            │  saves, posts, views)     │
            └─────────────┬─────────────┘
                          │
             ┌────────────┴────────────┐
             │       dw.dim_paper      │
             │ (paper_key, title,      │
             │  pagerank_tier)         │
             └─────────────────────────┘

             ┌───────────────────────────┐
             │dw.fact_dept_collaboration │
             │(date_key, source_dept,    │
             │ target_dept, interactions)│
             └───────────────────────────┘
```

### 4.3 Vector & Indexing Strategy

```sql
-- Hierarchical Navigable Small World (HNSW) vector indexing (Cosine metric)
CREATE INDEX idx_papers_embedding ON papers USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_chunks_embedding ON paper_chunks USING hnsw (chunk_embedding vector_cosine_ops);
CREATE INDEX idx_users_embedding  ON users  USING hnsw (profile_embedding vector_cosine_ops);
CREATE INDEX idx_posts_embedding  ON posts  USING hnsw (post_embedding vector_cosine_ops);

-- Generalized Inverted Index (GIN) for English Full-Text Search
CREATE INDEX idx_papers_tsv ON papers USING GIN (search_tsv);
CREATE INDEX idx_posts_tsv  ON posts  USING GIN (search_tsv);

-- B-Tree index for Time-Series stream queries
CREATE INDEX idx_events_time ON activity_events (occurred_at DESC);
```

---

## 5. Data Pipeline & Ingestion Engine

### 5.1 Stage 1: Ingestion & Seeding (`seed_database.py`)

- **OpenAlex Live Extraction**: Fetches literature across 24 academic topics for 6 schools (`has_abstract:true`, `publication_year:>2021`).
- **Data Lake Storage**: Uploads raw unaltered response JSON payloads to MinIO (`raw-ingestion/openalex/*.json`).
- **Planted Near-Duplicates**: Injects 30 synthetic near-duplicates with perturbed titles (`:` $\rightarrow$ `-`, `and` $\rightarrow$ `&`, appending `(Preprint)`).
- **Dense Vector Embedding**: Uses `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions) to encode all paper titles+abstracts, user bios, and discussion posts.
- **MinHash Fingerprinting**: Generates 128-permutation hash values over shingled paper tokens stored as `BYTEA`.
- **RAG Chunking**: Splits paper abstracts into 2 indexed chunks with individual chunk embeddings in `paper_chunks`.
- **Community Simulation**:
  - 60 users (55 authentic researchers + 5 planted spammers).
  - 60 personal collections and ~720 paper saves.
  - 600 discussion posts (120 rapid burst posts from spammers).
  - 2,000 threaded comments.
  - 10,500 activity logs with deliberate 5-day traffic spikes on 3 topics: *Graph Neural Networks*, *CRISPR Gene Editing*, and *Data Privacy Law*.
- **Ground Truth Output**: Emits `evaluation/ground_truth.json`.

### 5.2 Stage 2: Deduplication, PageRank & Star Schema ELT (`run_dw_elt.py`)

```powershell
python data_pipeline/run_dw_elt.py
```

1. **MinHash + LSH Entity Resolution** (`data_pipeline/dedup.py`): 128-permutation MinHash over word 3-shingles of title + abstract, bucketed with `MinHashLSH(threshold=0.5)`. Each candidate pair is verified (shingle Jaccard >= 0.5, title word Jaccard >= 0.4, embedding cosine >= 0.93, or a shared DOI / arXiv id). Verified pairs are grouped with union-find and **merged** into one canonical record: sources, saves, notes, posts, citations and events move to it, the sources list is unioned, and each merge is logged in `paper_merges`. Predictions (including earlier merges) go to `evaluation/predicted_duplicates.json`.
2. **PageRank Citation Authority**: Builds a directed graph $G = (V, E)$ using NetworkX over `paper_citations`, computes `nx.pagerank(alpha=0.85)`, and writes continuous authority scores back to `papers.pagerank_score`.
3. **Star Schema Transformation**:
   - `dw.dim_date`: Extracted from all activity timestamps with semester tags.
   - `dw.dim_member`: Role, department, and spam status.
   - `dw.dim_paper`: Categorized into `High`, `Medium`, and `Low` PageRank tiers using 80th and 40th percentiles.
   - `dw.dim_topic`: Hierarchical `AgglomerativeClustering` over TF-IDF n-grams grouping 24 topics into 4 primary clusters:
     1. *Intelligent Systems & Computing*
     2. *Life Sciences & Bio-Engineering*
     3. *Policy, Governance & Society*
     4. *Applied Analytics & Hardware*
   - `dw.fact_research_activity`: Aggregates activity events across date, member, topic, and paper.
   - `dw.fact_dept_collaboration`: Aggregates cross-department user follows and inter-department comment interactions.

### 5.3 Stage 3: Incremental Ingestion & Scheduled Refresh (`ingest.py`, `scheduler.py`)

```powershell
python data_pipeline/ingest.py                    # next batch from OpenAlex, arXiv and RSS, then entity resolution
python data_pipeline/ingest.py --sources rss      # articles only
python data_pipeline/dedup.py --dry-run           # report duplicates without merging
python data_pipeline/scheduler.py --once          # one refresh cycle: ingest + run_dw_elt.py
python data_pipeline/scheduler.py --interval-hours 6   # keep refreshing every 6 hours
docker compose --profile scheduler up -d scheduler     # same, as a container
```

- **Sources**: OpenAlex (papers + abstracts + citation links), arXiv (preprints, 3 s between calls as arXiv asks) and the curated RSS/Atom feeds in `data_pipeline/feeds.json` (articles, stored with `papers.item_type = 'article'` so search, saving and the assistant treat them like papers).
- **Raw first**: every response is archived unchanged in MinIO (`raw-ingestion/{openalex,arxiv,rss}/...`) before it is parsed.
- **Incremental batches**: `ingestion_state` holds a cursor per source/topic/feed (OpenAlex cursor, arXiv offset, RSS ETag / Last-Modified), so each run fetches only the next batch. Items already stored (same external id, DOI or arXiv id) are skipped before any embedding work.
- **Audit trail**: each run is a row in `ingestion_runs` (fetched / inserted / skipped).
- **Entity resolution**: new records that duplicate existing ones (e.g. the arXiv preprint of an OpenAlex paper) are merged, so one paper lists several sources.

---

## 6. Backend API Architecture (FastAPI)

The API service is located at `backend/main.py`.

### Key Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/users` | List university members with department filtering |
| `GET` | `/api/feed` | Personalized feed ranked by profile vector cosine similarity + social graph weight |
| `POST` | `/api/posts` | Create new post with auto-generated embeddings and activity stream events |
| `GET` | `/api/library` | Browse Chanakya Shared Library or personal saved papers |
| `POST` | `/api/library/save` | Save paper to user library with private annotations |
| `GET` | `/api/search` | **4-Panel Unified Hybrid Search** using Reciprocal Rank Fusion (RRF) |
| `GET` | `/api/recommendations/{user_id}` | Content-based paper and collaborator recommendations |
| `GET` | `/api/papers/{paper_id}/also-saved` | **FP-Growth Association Rules** for library save basket analysis |
| `GET` | `/api/trends-and-anomalies` | 7-day topic spike ratios + **Isolation Forest** bot/spam detection |
| `POST` | `/api/assistant/ask` | **RAG Research Assistant** with passage retrieval & local Ollama response |
| `GET` | `/api/analytics/overview` | **Star Schema OLAP Queries** for department activity, collaboration, and trends |
| `GET` | `/api/analytics/topic-associations` | **Subgroup-Stratified FP-Growth & FP-Max** mining (Maximal bundles & high-lift rules) |
| `GET` | `/api/analytics/researcher-archetypes` | **Ward Agglomerative Clustering** & discretized trait profile rules |

### Running the Backend

```powershell
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Interactive OpenAPI docs: **http://localhost:8000/docs**

---

## 7. Frontend Applications

### 7.1 Instant Browser UI (`frontend_static/index.html`)

For immediate evaluation without Node.js build dependencies, `frontend_static/index.html` offers a single-file, zero-build React 18 application with Tailwind CSS:
- Live switcher between all 60 synthetic members.
- Interactive 4-Panel Unified Search (External, Library, People, Posts).
- Personalized Feed with one-click post creation.
- Personal & Shared Library views with FP-Growth "Also Saved" drawers.
- Grounded Research Assistant with citation badges.
- Institutional Analytics with topic breakdown, monthly trends, and collaboration matrices.
- Community Health tab showing Isolation Forest spam flags and sliding-window topic spikes.

**How to open:** Simply open `frontend_static/index.html` in any web browser, or serve it via:
```powershell
python -m http.server 3000 --directory frontend_static
```

### 7.2 Production Next.js App Router (`frontend/`)

A modern Next.js 14 App Router application with TypeScript and Tailwind CSS:
```powershell
cd frontend
npm install
npm run dev
```
Available at **http://localhost:3000**.

---

## 8. Evaluation Framework & Benchmarks

Every number below is produced by `evaluation/evaluate_all.py` against the code the application runs: the
search SQL (`backend/services/search_service.py`), the recommendation formula (`recommendation_service.py`),
the spam model (`spam_service.py`) and the entity-resolution step (`data_pipeline/dedup.py`). Labels come from
`evaluation/ground_truth.json`, rebuilt from the seed's planting rules (never from detector output), plus a
manual audit of real duplicates (`evaluation/dedup_audit.json`). Tunable settings are chosen on a development
split and reported on held-out data.

```powershell
python evaluation/build_ground_truth.py   # labels from the database + seed rules (seed_labels.json)
python evaluation/evaluate_all.py         # writes evaluation/evaluation_results.json (~10 s)
```

### Summary results (24 Nov 2026)

| Feature | Metric | Baselines | CRC system (deployed) | Notes |
|---|---|---|---|---|
| **F4/F5 duplicate detection** (benchmark: 1,118 records, 29 planted pairs) | Precision / Recall / F1 | Exact title: 0.054 / 0.690 / 0.101 · Word-set MinHash LSH 0.65: 0.763 / 1.000 / 0.866 | **1.000 / 1.000 / 1.000** | MinHash on word 3-shingles + LSH 0.5, verified by title overlap and embedding cosine ≥ 0.93 |
| **F4/F5 merges actually made** | Precision (planted labels + manual audit) | | **45/46 = 0.978**; 30/30 planted duplicates merged | The one error merges a book with one of its chapters (same abstract in OpenAlex) |
| **F4 author name variants** | Accuracy (15 pairs) | | **0.933** | Surname + compatible initials rule |
| **F5 unified search** (25 held-out queries) | nDCG@10 [95% CI] / MRR | Keyword only: 0.197 [0.089, 0.316] / 0.44 · Semantic only: 0.822 [0.703, 0.926] / 0.83 · Previous hybrid with PageRank×50: 0.724 [0.590, 0.843] / 0.73 | **Hybrid RRF: 0.815 [0.694, 0.920] / 0.83** | PageRank weight swept on 26 dev queries: every positive weight lowered nDCG (0.753 → 0.730 at 0.001), so it is 0 and PageRank only breaks ties |
| **F5 PageRank validity** | Spearman vs OpenAlex global citations | | **ρ = 0.41** (p ≈ 2e-46, 1,089 papers) | Only 188 internal citation edges, so the graph is sparse |
| **F6 paper recommendations** (temporal holdout, 26 held-out members) | Recall@10 / nDCG@10 | Popularity: 0.019 / 0.007 · Item-CF: 0.077 / 0.064 · Profile only: 0.115 / 0.055 · Previous 0.5 profile + 0.5 centroid: 0.077 / 0.048 | **Co-save + content hybrid: 0.077 / 0.063** | Weights chosen on the other 27 members (dev recall 0.111 vs 0.049 for the previous formula). Small sample: confidence intervals overlap |
| **F6 "also saved"** | Coverage of library items | Association rules alone: 10/464 | **461/461** | Rules → co-saves → similar papers |
| **F7 topic spikes** (anchored at the planted burst) | Recall@3 / alert precision | | **1.000 / 1.000** | 7-day vs 30-day window, ≥ 5 events, ratio ≥ 1.5 |
| **F7 spam accounts** (5 planted of 76 members) | PR-AUC / ROC-AUC | Post count alone: 0.925 / 0.993 | **Isolation Forest: 0.810 / 0.989**; at threshold 0.09: P 0.83, R 1.00, F1 0.91 | Threshold chosen on the same 5 accounts (optimistic). The simple post-count baseline ranks better here because the planted spammers are mainly prolific |
| **F8 assistant retrieval** (15 questions) | Hit@4 / latency | | **1.000 / 14 ms** | Average top-1 similarity 0.70 |
| **F8 refusal gate** (5 out-of-corpus questions) | Refusal rate | | **0.80** at similarity < 0.32 | |

> [!NOTE]
> **Honest findings for the report.** (1) A PageRank prior cannot raise these relevance judgements (they measure topical match, not authority) and the citation graph is sparse, so PageRank is kept for tie-breaks, the prestige tier and featured papers rather than relevance. (2) The recommendation hybrid matches the best baseline on held-out members and keeps working for new members (no co-saves → content only); with ~27 members per split the differences are within noise. (3) A one-feature baseline beats the Isolation Forest on PR-AUC because the planted spammers differ mainly in volume; the forest is kept because it needs no hand-set rule for other kinds of abnormal activity.

---

## 9. Infrastructure Setup (Docker)

Defined in `docker-compose.yml`:

| Service | Container | Image | Host Port | Internal Port | Role |
|---|---|---|---|---|---|
| PostgreSQL | `crc_postgres` | `pgvector/pgvector:pg16` | **5434** | 5432 | Primary Relational & Vector DB (`public` + `dw`) |
| MinIO | `crc_minio` | `minio/minio:latest` | **9000** / **9001** | 9000 / 9001 | Raw S3-Compatible Object Store & Ingestion Lake |
| Ollama | `crc_ollama` | `ollama/ollama:latest` | **11434** | 11434 | Local LLM inference engine (`llama3.2:3b`) |

> [!NOTE]
> PostgreSQL is mapped to host port **5434** (`5434:5432`) to prevent conflicts with pre-existing local PostgreSQL instances on port 5432. All connection strings in `.env` reflect this mapping.

---

## 10. Quick Start Guide

### Step 1: Start Infrastructure
```powershell
cd "Chanakya-Research-Commons"
docker compose up -d
docker compose ps
```

### Step 2: Set Up Python Virtual Environment
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install psycopg2-binary minio sentence-transformers datasketch requests python-dotenv fastapi uvicorn scikit-learn mlxtend networkx pandas numpy
```

### Step 3: Apply Migrations and Seed Database (Stage 1)
```powershell
python db/apply_migrations.py
python data_pipeline/seed_database.py
python data_pipeline/improve_data.py
```
*Applies every migration in `db/migrations/`, downloads the embedding model, fetches papers from OpenAlex and arXiv, archives raw responses to MinIO, seeds PostgreSQL, then replaces placeholder names and comments with realistic ones.*

### Step 3b: Ingest More Content (Stage 3, optional but recommended)
```powershell
python data_pipeline/ingest.py
```
*Fetches the next batch from OpenAlex, arXiv and the RSS feeds, and merges duplicates. Use `scheduler.py` to repeat this on a schedule.*

### Step 4: Run Graph Mining & Star Schema ELT (Stage 2)
```powershell
python data_pipeline/run_dw_elt.py
```
*Executes MinHash LSH deduplication, computes PageRank, clusters topics, and populates `dw.*` star schema tables.*

### Step 5: Enrich Citations, Refresh the Warehouse and Run the Evaluation Suite
```powershell
python data_pipeline/enrich_citations.py      # OpenAlex citation counts + reference edges
python data_pipeline/run_dw_elt.py            # entity resolution, PageRank, star schema, alerts
python evaluation/build_ground_truth.py       # labels from the seed's planting rules
python evaluation/evaluate_all.py
```
*Writes `evaluation/evaluation_results.json`. See section 8 for what each number measures.*

### Step 6: Pull Ollama Model (Optional for RAG)
```powershell
docker exec -it crc_ollama ollama pull llama3.2:3b
```

### Step 7: Launch Backend API
```powershell
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Step 8: Open Frontend
- **Instant UI**: Open `frontend_static/index.html` in your browser.
- **Next.js UI**: `cd frontend && npm install && npm run dev` (visit http://localhost:3000).

---

## 11. Environment Variables

Configured in `.env`:

```env
POSTGRES_USER=crc_admin
POSTGRES_PASSWORD=<choose-a-database-password>
POSTGRES_DB=chanakya_commons
DATABASE_URL=postgresql://crc_admin:<database-password>@localhost:5434/chanakya_commons

MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=<choose-a-minio-password>
MINIO_ENDPOINT=localhost:9000

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b

# Authentication: configure a stable secret before deployment.
CRC_AUTH_SECRET=replace-with-a-long-random-secret
CRC_CORS_ORIGINS=http://localhost:3000
CRC_DEMO_PASSCODE=<choose-a-demo-passcode>
```

Seeded demo accounts use `member1@chanakyauniversity.edu.in` (or university ID `24CU1000`) and the demo passcode you set in `CRC_DEMO_PASSCODE` before seeding (there is no built-in default). Use a different value for any shared environment, and configure a strong `CRC_AUTH_SECRET` outside local development.

---

## 12. Project Structure

```
Chanakya-Research-Commons/
├── docker-compose.yml              # Multi-container orchestration (PostgreSQL 16, MinIO, Ollama)
├── .env                            # Environment variables (DB URL port 5434)
├── .gitignore                      # Excludes venv, node_modules, cache, model checkpoints
├── README.md                       # Comprehensive course project documentation
│
├── db/
│   └── schema.sql                  # Complete DDL: extensions, OLTP public schema, dw star schema
│
├── data_pipeline/
│   ├── seed_database.py            # Stage 1: OpenAlex fetch, MinIO lake, vector embeddings, synthetic data
│   └── run_dw_elt.py               # Stage 2: MinHash LSH deduplication, NetworkX PageRank, star schema ELT
│
├── backend/
│   └── main.py                     # FastAPI REST API: RRF search, FP-growth, Isolation Forest, RAG, OLAP
│
├── frontend_static/
│   └── index.html                  # Instant zero-build single-file React 18 + Tailwind UI
│
├── frontend/                       # Full-stack Next.js 14 App Router application
│   ├── app/                        # Pages, layouts, and global styles
│   ├── package.json
│   └── tsconfig.json
│
└── evaluation/
    ├── ground_truth.json           # Planted duplicates, spam account IDs, topic spikes
    ├── predicted_duplicates.json   # MinHash LSH predicted duplicate pairs
    ├── evaluate_all.py             # Quantitative benchmark evaluation script
    └── evaluation_results.json     # Final benchmark scores (Precision, Recall, F1, MRR)
```

---

## 13. Changelog

| Date | Milestone | Description |
|---|---|---|
| 2026-11-18 | `e3b16bf` | Project initialized and repository scaffolded |
| 2026-11-18 | `1a8af58` | Infrastructure added: `docker-compose.yml`, `db/schema.sql`, `data_pipeline/seed_database.py` |
| 2026-11-18 | `1f5106a` | Environment variables configured; basic documentation initialized |
| 2026-11-19 | `37ae9ac` | `.gitignore` rewritten; untracked 21,484 `.venv` files; repository pruned |
| 2026-11-19 | `a62c851` | Updated README changelog and repository tracking |
| 2026-11-20 | `57a430c` | Database seeded; `run_dw_elt.py` added for PageRank & Star Schema ELT; `backend/main.py` complete with FastAPI (RRF, FP-Growth, Isolation Forest, RAG, OLAP); `frontend_static/index.html` instant UI added; Next.js app scaffolded; full evaluation benchmark suite implemented and documented. |
| 2026-11-20 | `mining` | Integrated Subgroup-Stratified FP-Growth & FP-Max mining (`dw.vw_paper_topic_baskets`), Ward Agglomerative Researcher Clustering & trait rules (`dw.vw_researcher_profiles`), search expansion hook, and editorial Next.js/React `TopicAssociationsCard`. |
| 2026-11-22 | `frontend-modular` | Implemented modular Next.js 14 App Router frontend from `crc-frontend.zip` (`/`, `/feed`, `/library`, `/assistant`, `/analytics`), member context switching, type-safe API client, optimistic saves context, Gatekeeper live submission tester, and full Isolation Forest anomaly watchlist integration. |
| 2026-11-22 | `production-hardening` | Addressed all 6 architectural recommendations: untracked `.env` (added `.env.example`), eliminated write-on-GET anomaly detection, added ThreadedConnectionPool + `get_db()` context manager, fixed HNSW vector search subquery, added bounded inputs, calibrated PageRank boost, enforced RAG similarity floor, and added missing database indexes. |
| 2026-11-23 | `frontend-redesign` | Full CRC Frontend Redesign: calmed typography and hierarchy, sticky `Navbar` with persistent keyboard-activated (`/`) search, Home discovery page (`/`), threaded discussions (`/feed/[postId]`) with optimistic vote pills and recursive comments, full-page paper reader (`/papers/[paperId]`), PrestigeTier badges, collections integration, hierarchical role-gated views (`student`, `faculty`, `researcher`, `admin`), `AuthContext` with modal sign-in, and removed drawer/instant-switch hacks. |
| 2026-11-23 | `evaluation-integrity` | Comprehensive evaluation and algorithmic hardening: 51 held-out benchmark queries across 6 schools with 1,000 bootstrap CIs, strict temporal holdouts for recommendations with zero test leakage, threshold-free PR-AUC ($0.8100$) and ROC-AUC ($0.9855$) spam evaluation, date-anchored topic spikes, semantic centroid topic clustering, and low-similarity RAG refusal gate ($80\%$ out-of-corpus refusal). |
| 2026-11-24 | `phase-1` | Requirements audit (`REQUIREMENTS_CHECKLIST.md`). Entity resolution merges duplicates across sources (`dedup.py`, `paper_merges`); arXiv ingestion fixed; RSS article feeds; incremental, logged ingestion with a 6-hourly scheduler; "also saved" for every library item; profile editing with publication links. |
| 2026-11-24 | `phase-2` | Website gaps: add by DOI / arXiv / link, private notes, topic follows, live trending topics, admin alert queue with dismiss/confirm and flag/clear, on-demand spike and spam scans, university → school → topic → member drill-down, topics over time, most saved / discussed papers. |
| 2026-11-24 | `phase-3` | Evaluation rebuilt on the deployed code with regenerated ground truth and dev/test splits; shared search / recommendation / spam modules; PageRank weight and spam threshold tuned; co-save + content recommendations; event history backfilled; OpenAlex citation counts. |
| 2026-11-24 | `phase-4` | No credentials in code or Compose (all from `.env`); FastAPI lifespan handler; 21 backend tests that clean up their own accounts; old patch/zip copies of the code removed (Gap Analysis PDF moved to `docs/`). |

## Updating an existing database

One command applies every migration, the six-school mapping, member names, varied comments, votes and the warehouse rebuild:

```bash
python db/update_database.py            # add --update-emails for first.last@chanakyauniversity.edu.in
```

Then restart the backend and the frontend. Analytics now lives only in the admin dashboard (`/admin`), and `/api/analytics/*` requires an admin token.
