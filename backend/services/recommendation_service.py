"""
Paper recommendations for a member (F6): collaborative + content hybrid.

  content(p) = PROFILE_SHARE * cos(p, profile) + (1 - PROFILE_SHARE) * cos(p, centroid of saved papers)
               (members with no saves: content = cos(p, profile), the cold-start case)
  cf(p)      = log(1 + sum over other members m of |saves(m) & my saves| * [m saved p])   (item co-saves)
  score(p)   = CF_WEIGHT * z(cf) + CONTENT_WEIGHT * z(content)

z() standardises each signal over the candidate papers (those the member has not saved), so the two signals
are on one scale; a signal with no spread (e.g. cf for a new member) contributes nothing. The weights were
chosen on a development half of members in a temporal holdout and checked on the other half
(evaluate_all.py, F6). The same constants drive the evaluation, so the reported numbers are this formula.
"""
from __future__ import annotations

PROFILE_SHARE = 0.7
CF_WEIGHT = 1.0
CONTENT_WEIGHT = 0.5

RECOMMEND_PAPERS_SQL = f"""
    WITH me AS (SELECT profile_embedding AS prof FROM users WHERE user_id = %(uid)s::uuid),
    mine AS (SELECT paper_id FROM library_saves WHERE user_id = %(uid)s::uuid),
    taste AS (
        SELECT AVG(p.embedding) AS centroid
        FROM library_saves ls JOIN papers p ON p.paper_id = ls.paper_id
        WHERE ls.user_id = %(uid)s::uuid AND p.embedding IS NOT NULL
    ),
    overlap AS (   -- other members, weighted by how many of my papers they also saved
        SELECT ls.user_id, COUNT(*) AS ov
        FROM library_saves ls
        WHERE ls.paper_id IN (SELECT paper_id FROM mine) AND ls.user_id <> %(uid)s::uuid
        GROUP BY ls.user_id
    ),
    co AS (
        SELECT ls.paper_id, SUM(o.ov) AS co
        FROM library_saves ls JOIN overlap o ON o.user_id = ls.user_id
        GROUP BY ls.paper_id
    ),
    ranked AS (SELECT paper_id, percent_rank() OVER (ORDER BY pagerank_score) AS pagerank_percentile FROM papers),
    scored AS (
        SELECT p.paper_id, p.canonical_title, p.publication_year, p.venue, p.topics, p.save_count, p.pagerank_score,
               p.item_type, r.pagerank_percentile,
               1 - (p.embedding <=> me.prof) AS profile_sim,
               CASE WHEN t.centroid IS NULL THEN NULL ELSE 1 - (p.embedding <=> t.centroid) END AS saved_sim,
               COALESCE(c.co, 0) AS co_saves
        FROM papers p
        CROSS JOIN me CROSS JOIN taste t
        JOIN ranked r ON r.paper_id = p.paper_id
        LEFT JOIN co c ON c.paper_id = p.paper_id
        WHERE p.embedding IS NOT NULL AND p.paper_id NOT IN (SELECT paper_id FROM mine)
    ),
    signals AS (
        SELECT *,
               CASE WHEN saved_sim IS NULL THEN profile_sim
                    ELSE {PROFILE_SHARE} * profile_sim + {1 - PROFILE_SHARE} * saved_sim END AS content,
               LN(1 + co_saves) AS cf
        FROM scored
    )
    SELECT paper_id, canonical_title, publication_year, venue, topics, save_count, pagerank_score, item_type,
           pagerank_percentile, co_saves::int AS co_saves, content AS match_score,
           {CF_WEIGHT} * COALESCE((cf - AVG(cf) OVER ()) / NULLIF(STDDEV_POP(cf) OVER (), 0), 0)
             + {CONTENT_WEIGHT} * COALESCE((content - AVG(content) OVER ()) / NULLIF(STDDEV_POP(content) OVER (), 0), 0) AS score,
           CASE WHEN co_saves > 0 THEN 'co_saved'
                WHEN saved_sim IS NOT NULL AND saved_sim > profile_sim THEN 'saved'
                ELSE 'profile' END AS reason
    FROM signals
    ORDER BY score DESC, pagerank_percentile DESC
    LIMIT %(limit)s
"""
