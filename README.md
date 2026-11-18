# Chanakya Research Commons (CRC)

> **DMW (Data Mining & Warehousing) Course Project** — Sem 5, Chanakya University  
> A full-stack academic research platform that combines an operational PostgreSQL database, a star-schema data warehouse, vector/full-text search, and a MinIO-backed raw data lake — seeded entirely with real papers from the OpenAlex API.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture at a Glance](#2-architecture-at-a-glance)
3. [Core Concepts & Features](#3-core-concepts--features)
4. [Database Design](#4-database-design)
5. [Data Pipeline — How the Database is Set Up](#5-data-pipeline--how-the-database-is-set-up)
6. [Infrastructure Setup (Docker)](#6-infrastructure-setup-docker)
7. [Quick Start](#7-quick-start)
8. [Environment Variables](#8-environment-variables)
9. [Project Structure](#9-project-structure)

---

## 1. Project Overview

Chanakya Research Commons is a research-community platform for Chanakya University members (students, faculty, researchers, admins) across six departments. It allows users to:

- Discover and save academic papers
- Discuss papers via posts and threaded comments
- Follow researchers and research topics
- Run semantic (vector) and full-text search over a live paper corpus
- Analyze community research trends via a star-schema data warehouse

The project exercises key DMW concepts: **data ingestion from external APIs**, **schema design** (OLTP + OLAP), **vector indexing**, **MinHash-based duplicate detection**, **spam detection**, and **trend anomaly tracking**.

---

## 2. Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenAlex Public API                       │
│          (real research papers, free & open)                 │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTP fetch (per topic/dept)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│          seed_database.py  (Python data pipeline)           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────┐  │
│  │ OpenAlex Fetch  │  │ Embedding Model │  │  MinHash   │  │
│  │  (requests)     │  │ all-MiniLM-L6-v2│  │ (128-perm) │  │
│  └────────┬────────┘  └────────┬────────┘  └─────┬──────┘  │
└───────────┼────────────────────┼─────────────────┼─────────┘
            │                    │                  │
     raw JSON archived     384-dim vectors     minhash_signature
            │                    │                  │
            ▼                    ▼                  ▼
┌──────────────────┐    ┌────────────────────────────────────┐
│  MinIO (S3-like) │    │   PostgreSQL 16 + pgvector          │
│  raw-ingestion/  │    │                                    │
│  openalex/*.json │    │   public schema  (OLTP)            │
│                  │    │   dw schema      (OLAP / Star)     │
└──────────────────┘    └────────────────────────────────────┘
                                      │
                              Ollama (llama3.2:3b)
                              Local LLM for RAG /
                              Research Assistant
```

---

## 3. Core Concepts & Features

| Feature | DMW Concept Demonstrated |
|---|---|
| **F1 — Social Graph** | Relational modeling, foreign keys, self-referencing tables |
| **F2 — Posts & Discussions** | Full-text search with `tsvector` + GIN index |
| **F3 — Shared Paper Library** | Many-to-many via junction tables, save counts |
| **F4 — Raw Data Lake** | External API ingestion → MinIO (S3-compatible object store) |
| **F5 — Citation Graph** | Graph-structured data, PageRank scoring |
| **F6 — Personal Collections** | Nested relational hierarchy, user-scoped access |
| **F7 — Trend Anomaly Detection** | Time-series events table, planted topic spikes |
| **F8 — Semantic Search / RAG** | Vector embeddings with `pgvector`, HNSW index, paper chunking |
| **F9 — Data Warehouse** | Star schema (`dw` schema) with fact & dimension tables |
| **Duplicate Detection** | MinHash (128-perm, Jaccard similarity) with 30 planted near-duplicates |
| **Spam Detection** | Planted spam accounts + burst-posting pattern for ground-truth evaluation |

---

## 4. Database Design

The database (`chanakya_commons`) lives in PostgreSQL 16 with the `pgvector` extension and contains **two schemas**:

### 4.1 `public` — Operational / OLTP Schema

```
users ──────────────────────────────────────────┐
  │  user_follows (follower ↔ followee)          │
  │  topic_follows (user ↔ topic_tag)            │
  │                                              │
  ├──→ library_saves ──→ papers ←── paper_sources│
  │       │                │                    │
  │   collections      paper_citations           │
  │                    paper_chunks (for RAG)    │
  │                                              │
  ├──→ posts ──→ comments                        │
  │       └──→ post_upvotes                      │
  │                                              │
  └──→ activity_events                           │
        system_alerts ───────────────────────────┘
```

**Key tables:**

| Table | Purpose |
|---|---|
| `users` | Members with role, department, `profile_embedding VECTOR(384)`, spam/synthetic flags |
| `user_follows` | Social follow graph (many-to-many, self-referencing) |
| `topic_follows` | Topic subscriptions per user |
| `papers` | Canonical paper records; `embedding VECTOR(384)`, `search_tsv TSVECTOR` (auto-generated), `minhash_signature BYTEA` |
| `paper_sources` | Provenance — which external source (OpenAlex, ArXiv, etc.) and MinIO path |
| `paper_citations` | Citation edges between papers |
| `paper_chunks` | Abstract split into 2 chunks per paper, each with its own `chunk_embedding` for RAG |
| `collections` | User-created reading lists |
| `library_saves` | Saves a paper into a collection with private notes |
| `posts` | Discussion posts; `post_embedding VECTOR(384)`, `search_tsv TSVECTOR` |
| `comments` | Threaded comments on posts (self-referencing `parent_comment_id`) |
| `post_upvotes` | Upvote junction table |
| `activity_events` | Append-only event log (`save_paper`, `view_paper`, `search`, `create_post`) |
| `system_alerts` | Anomaly/spam alerts with severity score |

**Indexes:**

```sql
-- Vector similarity search (Hierarchical Navigable Small World)
CREATE INDEX idx_papers_embedding ON papers USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_chunks_embedding ON paper_chunks USING hnsw (chunk_embedding vector_cosine_ops);
CREATE INDEX idx_users_embedding  ON users  USING hnsw (profile_embedding vector_cosine_ops);
CREATE INDEX idx_posts_embedding  ON posts  USING hnsw (post_embedding vector_cosine_ops);

-- Full-text search
CREATE INDEX idx_papers_tsv ON papers USING GIN (search_tsv);
CREATE INDEX idx_posts_tsv  ON posts  USING GIN (search_tsv);

-- Time-series event log
CREATE INDEX idx_events_time ON activity_events (occurred_at DESC);
```

### 4.2 `dw` — Data Warehouse / OLAP Schema (Star Schema)

```
         dim_date
             │
dim_member ──┤
             ├──→ fact_research_activity
dim_topic  ──┤
             │
dim_paper  ──┘

dim_date ──→ fact_dept_collaboration
```

| Table | Type | Description |
|---|---|---|
| `dw.dim_date` | Dimension | Calendar breakdown: year, quarter, month, week, academic semester |
| `dw.dim_member` | Dimension | Slowly-changing user snapshot (role, department) |
| `dw.dim_topic` | Dimension | Research topics with parent cluster |
| `dw.dim_paper` | Dimension | Paper snapshot with PageRank tier |
| `dw.fact_research_activity` | Fact | Saves, posts, comments, upvotes, views — per member × topic × paper × date |
| `dw.fact_dept_collaboration` | Fact | Cross-department interaction counts — for collaboration network analysis |

---

## 5. Data Pipeline — How the Database is Set Up

Everything is handled by **`data_pipeline/seed_database.py`**.  
Run it once after `docker compose up -d` to fully populate the database.

### Step-by-step flow

```
1. Connect to MinIO & PostgreSQL
        │
2. Fetch real papers from OpenAlex API
   • 6 departments × 4 topics = 24 API calls
   • 30 papers per topic → ~720 unique papers (deduplicated)
   • Raw JSON responses archived to MinIO: raw-ingestion/openalex/<topic>_<date>.json
        │
3. Plant 30 near-duplicate papers
   • Titles mutated (": " → " -", " and " → " &", append " (Preprint)")
   • No DOI on duplicates → MinHash will detect them
   • Ground truth saved to evaluation/ground_truth.json
        │
4. Compute sentence embeddings (all-MiniLM-L6-v2, 384 dims)
   • For all papers (title + first 600 chars of abstract)
   • For user bios
   • For posts (title + body)
        │
5. Compute MinHash signatures (128 permutations, Jaccard similarity)
   • Per paper: tokens from title + first 300 chars of abstract
   • Stored as BYTEA in papers.minhash_signature
        │
6. Insert into PostgreSQL
   ├─ papers (with embedding + minhash_signature)
   ├─ paper_sources (OpenAlex ID + MinIO path provenance)
   ├─ paper_chunks (2 chunks per abstract, each with chunk_embedding for RAG)
   └─ paper_citations (intra-corpus citation edges from referenced_works)
        │
7. Generate 60 synthetic Chanakya University members
   • 55 normal members (students, faculty, researchers, 1 admin)
   • 5 planted spam accounts (indices 55-59)
   • Members distributed across 6 departments
   • Profile embeddings computed from bios
        │
8. Build social graph
   • Each user follows ~4 same-dept + ~2 cross-dept colleagues
   • Each user subscribes to 2 research topic tags
        │
9. Generate activity data
   ├─ 60 collections (1 per user)
   ├─ ~720 library saves (12 dept-relevant papers per user)
   ├─ 600 posts:
   │    • 120 burst-spam posts from the 5 spam accounts (created within 2 hours)
   │    • 480 legitimate research discussion posts
   ├─ 2,000 comments on legitimate posts
   └─ 10,500 view + search events
        • 16% are recent spikes (last 5 days) on 3 planted "trending" topics:
          ["graph neural networks", "CRISPR gene editing", "data privacy law"]
        │
10. Write evaluation/ground_truth.json
    {
      "duplicate_pairs": [...],   ← 30 paper pairs for MinHash eval
      "spam_user_ids": [...],     ← 5 UUIDs for spam detection eval
      "spike_topics": [...]       ← 3 topics for trend anomaly eval
    }
```

### Key libraries used

| Library | Purpose |
|---|---|
| `sentence-transformers` | Generate 384-dim embeddings (`all-MiniLM-L6-v2`) |
| `datasketch` | MinHash with 128 permutations for near-duplicate detection |
| `psycopg2` | PostgreSQL client; `execute_values` for bulk inserts |
| `minio` | S3-compatible Python client for raw data lake |
| `requests` | HTTP calls to OpenAlex API |
| `python-dotenv` | Load credentials from `.env` |

---

## 6. Infrastructure Setup (Docker)

Three services are defined in `docker-compose.yml`:

| Service | Image | Port | Role |
|---|---|---|---|
| `crc_postgres` | `pgvector/pgvector:pg16` | `5432` | Primary database; schema auto-applied on first run |
| `crc_minio` | `minio/minio:latest` | `9000` (API) `9001` (Console) | Raw data lake / object store |
| `crc_ollama` | `ollama/ollama:latest` | `11434` | Local LLM server for Research Assistant (RAG) |

**Schema auto-initialization:** `db/schema.sql` is mounted to `/docker-entrypoint-initdb.d/01_schema.sql` — PostgreSQL runs it automatically on the very first container start.

**Persistent volumes:** `pg_data`, `minio_data`, `ollama_data` — data survives container restarts.

---

## 7. Quick Start

```powershell
# 1. Clone & enter the project directory
cd "Chanakya-Research-Commons"

# 2. Start all infrastructure services
docker compose up -d

# 3. Verify containers are running
docker compose ps

# 4. Set up Python environment
python -m venv .venv
.venv\Scripts\Activate.ps1

# 5. Install dependencies
pip install psycopg2-binary minio sentence-transformers datasketch requests python-dotenv

# 6. Seed the database (fetches real papers, generates synthetic users & events)
cd data_pipeline
python seed_database.py

# 7. Verify data was inserted
docker exec -it crc_postgres psql -U crc_admin -d chanakya_commons -c "SELECT COUNT(*) FROM papers;"
```

> [!NOTE]
> `seed_database.py` downloads the `all-MiniLM-L6-v2` model (~90 MB) on first run and makes ~24 HTTP requests to `api.openalex.org`. Ensure you have internet access when running it.

> [!TIP]
> MinIO console is available at **http://localhost:9001** (login: `minioadmin` / `minioadmin_pass`).  
> Inspect raw ingested JSON under the `raw-ingestion` bucket → `openalex/` prefix.

---

## 8. Environment Variables

Configured in `.env` (never commit real secrets):

```env
POSTGRES_USER=crc_admin
POSTGRES_PASSWORD=crc_secure_pass
POSTGRES_DB=chanakya_commons
DATABASE_URL=postgresql://crc_admin:crc_secure_pass@localhost:5432/chanakya_commons

MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin_pass
MINIO_ENDPOINT=localhost:9000

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
```

---

## 9. Project Structure

```
Chanakya-Research-Commons/
├── docker-compose.yml          # Infrastructure: Postgres, MinIO, Ollama
├── .env                        # Environment variables (not committed)
├── .gitignore
├── README.md
│
├── db/
│   └── schema.sql              # Full DDL — both public (OLTP) and dw (OLAP) schemas
│
├── data_pipeline/
│   └── seed_database.py        # End-to-end data pipeline script
│
├── evaluation/
│   └── ground_truth.json       # Generated after seeding — duplicate pairs, spam IDs, spike topics
│
├── backend/                    # (API layer — WIP)
├── frontend/                   # (UI layer — WIP)
└── docs/                       # (Additional documentation — WIP)
```

---

## 10. Changelog

| Date | Commit | What Changed |
|---|---|---|
| 2026-11-18 | `e3b16bf` | Initial commit — project scaffolded |
| 2026-11-18 | `1a8af58` | Setup: Docker Compose, schema.sql, seed_database.py added |
| 2026-11-18 | `1f5106a` | `.env` configured, README initialized |
| 2026-11-18 | *(today)* | README fully rewritten — architecture, DB design, pipeline walkthrough, quick start |
| 2026-11-19 | `chore` | `.gitignore` written from scratch; `.venv` (21,484 files) removed from git index; repo cleaned to 5 tracked source files |

> [!NOTE]
> This changelog is kept up to date automatically as the project progresses.

## 9. Project Structure

```
Chanakya-Research-Commons/
├── docker-compose.yml          # Infrastructure: Postgres, MinIO, Ollama
├── .env                        # Environment variables (not committed)
├── .gitignore
├── README.md
│
├── db/
│   └── schema.sql              # Full DDL — both public (OLTP) and dw (OLAP) schemas
│
├── data_pipeline/
│   └── seed_database.py        # End-to-end data pipeline script
│
├── evaluation/
│   └── ground_truth.json       # Generated after seeding — duplicate pairs, spam IDs, spike topics
│
├── backend/                    # (API layer — WIP)
├── frontend/                   # (UI layer — WIP)
└── docs/                       # (Additional documentation — WIP)
```
