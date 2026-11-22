# CRC: Architecture and Production Improvement Recommendations

Nov 22, 2026 · @wreck

## Overview

The project is sound for a campus pilot, but six things in the backend should change before real users arrive: a write-on-GET anomaly job, missing authentication, a tracked `.env`, a search query that likely skips the vector index, unbounded inputs, and an empty API contract.

This review is based on `backend/main.py`, `db/schema.sql` and the repository file listing at commit `eea4cda`. The findings in the first two sections come straight from that code. The scale thresholds and feature ideas are judgment calls: I have not run `EXPLAIN` or seen your data volumes, so confirm the performance items against real query plans.

The repository is also behind your brief: it has no `backend/services/` directory and no topic-associations, researcher-archetypes, anomalies or gatekeeper routes. The recommendations below assume those exist in your local backend.

## Fix before real users touch it

These are correctness and security problems, all visible in the committed code.

| Finding | What the code does | Fix |
| --- | --- | --- |
| Anomaly detection writes on GET | `GET /api/trends-and-anomalies` refits an Isolation Forest and runs `UPDATE users SET is_flagged_spam = TRUE` on every call. `contamination=0.09` is hard-coded, so about 9% of users are flagged however clean the data is, and nothing unflags them. | Run it as a scheduled job that writes to `system_alerts` (the table exists, unused). Use score thresholds and a review state (`is_resolved`) instead of a fixed percentage. |
| No authentication | The client sends `user_id` and the server trusts it, so anyone can post, save or act as anyone. `GET /api/users` returns every member's email and university ID publicly. CORS is `*` with credentials on. | University SSO (Google Workspace or Entra), identity derived server-side. Make analytics and the integrity watchlist admin-only, since they name individuals. |
| `.env` tracked in git | `.env` is in the committed file list, and the DB password is also the default in `main.py`. | Remove it from history, rotate the credentials, commit a `.env.example`. |
| Unbounded inputs | `limit` parameters accept any integer (`limit=100000` works). No rate limiting anywhere. | `Query(le=100)` on every limit; per-user rate limits, tighter on the LLM endpoint. |
| Connection handling | Each request opens a new psycopg2 connection: no pool, no `try/finally`. `get_recommendations` raises a 404 before closing its connection, so it leaks. | Use a pool (psycopg\_pool or PgBouncer) and context managers. |
| Department filter is partial | In `/api/analytics/overview` the department filter only applies to the topic breakdown. Monthly trends and the collaboration matrix ignore it. | Apply the filter to all three queries, or label the others as university-wide. |

## Search and retrieval quality

The hybrid search SQL probably cannot use the HNSW index as written, and the RAG path never declines to answer. Confirm the first with `EXPLAIN ANALYZE`.

- **Window function blocks the index.** `ROW_NUMBER() OVER (ORDER BY embedding <=> q)` followed by `LIMIT 40` forces a full scan and sort, and the limit has no ordering of its own. Do `ORDER BY embedding <=> q LIMIT 40` in the subquery, then rank.
- **Filtered ANN.** `WHERE in_chanakya_library = ...` filters after the index scan and can return too few rows. Use pgvector 0.8 `hnsw.iterative_scan`, or partial indexes for the library subset.
- **The PageRank boost depends on corpus size.** `pagerank_score * 10` is added to the fusion score, but PageRank values sum to 1, so they shrink as the corpus grows and the boost's weight shifts silently. Fuse on rank or percentile instead.
- **RAG always answers.** It takes the top 4 chunks even at 0.2 similarity. Add a similarity floor and an "insufficient evidence" response. Add a cross-encoder reranker, diversity (MMR), and a check that every `[n]` in the answer maps to a retrieved chunk.
- **Track quality in CI.** `evaluation/ground_truth.json` already exists; report recall@k and nDCG on every change.
- **Embedding model.** `all-MiniLM-L6-v2` is a general-purpose 384-d model. Try SPECTER2 or BGE/E5 for scholarly text, and store the model name and version per row so re-embedding is a migration, not a rewrite.
- **Unused pieces.** `pg_trgm` is installed but unused (use it for fuzzy author and title matching). `minhash_signature` has no LSH index. `topic_follows` has no API. `search_tsv` is English-only.

## Production efficiency and operations

The biggest efficiency win is moving every heavy computation off the request path and serving precomputed results.

- **Precompute the mining outputs.** `also-saved` builds a dense users-by-papers crosstab and runs FP-Growth on every request, which breaks as the library grows. FP-Max, FP-Growth, clustering and the anomaly model should run as nightly or incremental jobs that write versioned results to tables. The API only reads them.
- **Warehouse.** Make `run_dw_elt.py` incremental with an orchestrator (Dagster, Airflow or dbt). Make `dim_member` slowly-changing so department moves do not rewrite history. Add date-range parameters and materialized views.
- **Caching.** Redis for query embeddings, search results (short TTL) and analytics. A repeated search should not run the embedding model at all.
- **LLM serving.** The `requests.post` to Ollama holds a worker for up to 60 seconds, and one 3B model serializes concurrent users. Stream tokens over SSE, cap concurrency and queue requests. For more headroom, serve through vLLM or llama.cpp server behind an OpenAI-compatible interface so the provider is swappable.
- **Schema.** Manage it with Alembic, not only `schema.sql`. Add indexes on `library_saves(user_id)`, `comments(post_id)` and `posts(created_at)`, a GIN index on `activity_events.topic_tags`, and monthly partitions for `activity_events`. Use the `pgvector` Python adapter instead of string-formatted vectors.
- **Observability and CI.** Structured logs, OpenTelemetry, Prometheus and Sentry; `pg_stat_statements` for slow queries. CI should run lint, pytest against a pgvector testcontainer, the frontend build, Playwright and the retrieval evaluation.
- **Realistic ceiling.** One Postgres with pgvector is fine for roughly 100,000 papers and about 1 million chunks (a judgment, not a measurement). Beyond that, consider halfvec or quantization, read replicas, or a dedicated vector store. Do not do it earlier.

## The highest-value structural change: a real API contract

Every route returns raw database dicts with no Pydantic `response_model`, so the generated OpenAPI schema is empty. That is why the delivered frontend needs tolerant adapters in `lib/normalize.ts`, and why a local backend and the repository can drift apart without anything failing.

1. Add a `response_model` to every route.
2. Split `main.py` into routers and services (the brief already implies `services/mining_service.py` and `services/anomaly_service.py`).
3. Generate the TypeScript types from the OpenAPI spec with `openapi-typescript`.
4. Delete `lib/normalize.ts`, so drift becomes a compile error instead of a runtime surprise.

## Features worth building

The most valuable additions use data and tables the project already has.

- **Real author entities** with ORCID, plus researcher profile pages. Today `authors` is JSONB, so coauthor graphs cannot be computed properly, and the archetype clustering relies on them.
- **Institutional reporting.** Per-school scorecards with CSV and PDF export, useful for accreditation and ranking submissions such as NAAC and NIRF.
- **Weekly digests and saved searches**, built on the existing embeddings: new papers near a member's profile, plus topic spikes.
- **Collections, annotations and citation export** (BibTeX, RIS, Zotero). The `collections` table exists with no API.
- **Full-text ingestion.** PDF upload, then GROBID parsing, chunking and embedding, with Unpaywall for open-access links. RAG over abstracts only caps answer quality.
- **Incremental OpenAlex sync** using `updated_date`, with Crossref and Semantic Scholar to fill gaps and DOIs.
- **Admin console** for the integrity watchlist: review, resolve, and feed false positives back into the model.

## Gaps in the delivered frontend

The Next.js app is verified against a mock API only, and its production readiness has these open items:

- **No data-fetching cache.** React Query or SWR would add request dedupe and stale-while-revalidate.
- **API origin is baked in at build time** through `NEXT_PUBLIC_API_ORIGIN`. A Next route-handler proxy would solve CORS and auth in one place and let the origin change without a rebuild.
- **Guessed endpoints.** The topic-associations, researcher-archetypes, anomalies, gatekeeper, upvote and comment routes use guessed paths and field names until the backend contract exists.
- **Not yet done:** end-to-end tests, an accessibility audit with axe, and list virtualization for long result sets.

## Suggested starting order

Start with the three changes that remove the most risk for the least work.

1. **Fix the hybrid search SQL** so it can use the HNSW index, and verify with `EXPLAIN ANALYZE`.
2. **Add `response_model`s and generate OpenAPI types**, so the frontend and backend cannot drift again.
3. **Move anomaly detection into a scheduled job** that writes to `system_alerts`, ending the write-on-GET behaviour and the fixed 9% flag rate.
4. **Then authentication and the `.env` cleanup**, before any real member data is loaded.

I can draft items 1 to 3 as a patch against `main.py`.
