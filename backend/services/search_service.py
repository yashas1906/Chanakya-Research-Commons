"""
Hybrid paper ranking for unified search (F5), shared by the API and evaluation/evaluate_all.py so the
evaluated ranking is exactly the deployed one.

score(paper) = 1 / (RRF_K + semantic_rank) + 1 / (RRF_K + keyword_rank) + PAGERANK_WEIGHT * pagerank_percentile

  semantic_rank      position among the CANDIDATES nearest papers by embedding (pgvector HNSW, cosine)
  keyword_rank       position among the CANDIDATES best full-text matches (ts_rank on the GIN-indexed tsvector)
  pagerank_percentile 0..1 rank of the paper's citation-graph PageRank in the corpus

Reciprocal Rank Fusion terms are at most 1/61 ~ 0.016 each, so the PageRank prior must be on the same
scale. The old prior, min(pagerank * 50, 0.15), was up to ten times larger than the relevance signal and
made the full system score below semantic-only search. PAGERANK_WEIGHT is chosen on the development half
of the benchmark queries and reported on the held-out half (see evaluate_all.py, F5 pagerank_weight_sweep).
Result: every positive weight lowered nDCG@10 on the development queries (0.753 at 0 -> 0.730 at 0.001), so the
weight is 0 and PageRank is used only to break ties, for the prestige tier and for featured papers. With 188
internal citation edges the graph is sparse (Spearman 0.41 against OpenAlex global citation counts).
"""
from __future__ import annotations

RRF_K = 60
CANDIDATES = 40
PAGERANK_WEIGHT = 0.0


def hybrid_paper_sql(library_filter: bool, pagerank_weight: float | None = None) -> str:
    """
    SQL for one ranked list of papers. Parameters, in order:
      query_vector, [in_library], query_vector, query_text, query_text, [in_library], limit
    (the [in_library] values are only expected when library_filter is True).
    """
    weight = PAGERANK_WEIGHT if pagerank_weight is None else float(pagerank_weight)
    lib = "AND in_chanakya_library = %s" if library_filter else ""
    return f"""
        WITH semantic_knn AS (
            SELECT paper_id, (embedding <=> %s::vector) AS dist
            FROM papers
            WHERE embedding IS NOT NULL {lib}
            ORDER BY embedding <=> %s::vector
            LIMIT {CANDIDATES}
        ),
        semantic AS (
            SELECT paper_id, ROW_NUMBER() OVER (ORDER BY dist ASC) AS sem_rank FROM semantic_knn
        ),
        keyword_top AS (
            SELECT paper_id, ts_rank(search_tsv, plainto_tsquery('english', %s)) AS kw_score
            FROM papers
            WHERE search_tsv @@ plainto_tsquery('english', %s) {lib}
            ORDER BY kw_score DESC
            LIMIT {CANDIDATES}
        ),
        keyword AS (
            SELECT paper_id, ROW_NUMBER() OVER (ORDER BY kw_score DESC) AS kw_rank FROM keyword_top
        ),
        ranked AS (
            SELECT paper_id, percent_rank() OVER (ORDER BY pagerank_score) AS pagerank_percentile FROM papers
        )
        SELECT p.paper_id, p.doi, p.arxiv_id, p.canonical_title, p.abstract, p.authors, p.publication_year, p.venue, p.topics,
               p.save_count, p.pagerank_score, p.in_chanakya_library, p.item_type, p.url, r.pagerank_percentile,
               COALESCE(ARRAY_AGG(DISTINCT ps.source_name) FILTER (WHERE ps.source_name IS NOT NULL), ARRAY['openalex']) AS sources,
               (COALESCE(1.0 / ({RRF_K} + s.sem_rank), 0) + COALESCE(1.0 / ({RRF_K} + k.kw_rank), 0)
                + {weight} * r.pagerank_percentile) AS rrf_score
        FROM papers p
        LEFT JOIN semantic s ON p.paper_id = s.paper_id
        LEFT JOIN keyword k ON p.paper_id = k.paper_id
        JOIN ranked r ON r.paper_id = p.paper_id
        LEFT JOIN paper_sources ps ON p.paper_id = ps.paper_id
        WHERE (s.paper_id IS NOT NULL OR k.paper_id IS NOT NULL)
        GROUP BY p.paper_id, s.sem_rank, k.kw_rank, r.pagerank_percentile
        ORDER BY rrf_score DESC, r.pagerank_percentile DESC
        LIMIT %s
    """


def hybrid_params(q_vec: str, q: str, limit: int, in_library: bool | None) -> tuple:
    """Parameters matching hybrid_paper_sql(library_filter=in_library is not None)."""
    if in_library is None:
        return (q_vec, q_vec, q, q, limit)
    return (q_vec, in_library, q_vec, q, q, in_library, limit)
