import os
import json
import argparse
from datetime import datetime, timedelta, timezone
import numpy as np
import pandas as pd
import networkx as nx
import scipy.stats as stats
import psycopg2
from psycopg2.extras import execute_values
from datasketch import MinHash, MinHashLSH
from sklearn.cluster import AgglomerativeClustering
from sklearn.ensemble import IsolationForest
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL", "postgresql://crc_admin:crc_secure_pass@localhost:5434/chanakya_commons")

embed_model = None


def get_embed_model():
    global embed_model
    if embed_model is None:
        embed_model = SentenceTransformer("all-MiniLM-L6-v2")
    return embed_model


def get_anchor_date(cur, as_of_arg: str = None) -> datetime:
    if as_of_arg:
        try:
            dt = datetime.fromisoformat(as_of_arg)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception:
            pass
    cur.execute("SELECT MAX(occurred_at) FROM public.activity_events")
    row = cur.fetchone()
    if row and row[0]:
        return row[0]
    return datetime.now(timezone.utc)


def run_minhash_deduplication(cur):
    print("1/5 Running MinHash + LSH near-duplicate detection (F4/F5)...")
    cur.execute("SELECT paper_id, canonical_title, minhash_signature FROM papers WHERE minhash_signature IS NOT NULL")
    rows = cur.fetchall()

    lsh = MinHashLSH(threshold=0.65, num_perm=128)
    minhashes = {}

    for paper_id, title, sig_bytes in rows:
        mh = MinHash(num_perm=128)
        mh.hashvalues = np.frombuffer(bytes(sig_bytes), dtype=np.uint32)
        minhashes[str(paper_id)] = mh
        lsh.insert(str(paper_id), mh)

    detected_pairs = set()
    for pid, mh in minhashes.items():
        matches = lsh.query(mh)
        for m in matches:
            if m != pid:
                pair = tuple(sorted([pid, m]))
                detected_pairs.add(pair)

    os.makedirs("evaluation", exist_ok=True)
    with open("evaluation/predicted_duplicates.json", "w", encoding="utf-8") as f:
        json.dump([{"paper_a": a, "paper_b": b} for a, b in detected_pairs], f, indent=2)

    print(f"    -> Detected {len(detected_pairs)} candidate duplicate pairs (saved to evaluation/predicted_duplicates.json).")


def run_citation_pagerank(cur):
    print("2/5 Computing PageRank on paper citation graph via NetworkX & validating calibration (F5)...")
    cur.execute("SELECT paper_id FROM papers")
    all_pids = [str(r[0]) for r in cur.fetchall()]

    cur.execute("SELECT citing_paper_id, cited_paper_id FROM paper_citations")
    edges = [(str(r[0]), str(r[1])) for r in cur.fetchall()]

    G = nx.DiGraph()
    G.add_nodes_from(all_pids)
    G.add_edges_from(edges)

    pr_scores = nx.pagerank(G, alpha=0.85)
    in_degrees = dict(G.in_degree())

    # PageRank validation: compute Spearman rank correlation with in-degree citation count
    pr_vals = [pr_scores[pid] for pid in all_pids]
    deg_vals = [in_degrees[pid] for pid in all_pids]

    if len(set(deg_vals)) > 1:
        corr, p_val = stats.spearmanr(pr_vals, deg_vals)
        print(f"    -> PageRank validation: Spearman rank correlation with citation in-degree = {corr:.4f} (p={p_val:.4e})")
    else:
        print("    -> PageRank validation: Uniform citation distribution across corpus.")

    update_rows = [(float(score), pid) for pid, score in pr_scores.items()]
    execute_values(
        cur,
        "UPDATE papers AS p SET pagerank_score = v.score FROM (VALUES %s) AS v(score, id) WHERE p.paper_id = v.id::uuid",
        update_rows,
    )
    print(f"    -> Updated PageRank scores across {len(all_pids)} nodes and {len(edges)} citation edges.")


def build_star_schema(cur):
    print("3/5 Populating Star Schema dimensions & facts (dw.*) with semantic centroid topic clustering (F9)...")
    cur.execute("TRUNCATE dw.fact_research_activity, dw.fact_dept_collaboration, dw.dim_date, dw.dim_member, dw.dim_topic, dw.dim_paper RESTART IDENTITY CASCADE")

    # 1. dim_date from all activity timestamps
    cur.execute("""
        INSERT INTO dw.dim_date (date_key, full_date, year, quarter, month, month_name, week_of_year, academic_semester)
        SELECT DISTINCT
            TO_CHAR(d, 'YYYYMMDD')::INT AS date_key,
            d::DATE AS full_date,
            EXTRACT(YEAR FROM d)::INT,
            EXTRACT(QUARTER FROM d)::INT,
            EXTRACT(MONTH FROM d)::INT,
            TRIM(TO_CHAR(d, 'Month')),
            EXTRACT(WEEK FROM d)::INT,
            CASE WHEN EXTRACT(MONTH FROM d) BETWEEN 7 AND 12 THEN '2026-27 Odd' ELSE '2025-26 Even' END
        FROM (
            SELECT occurred_at AS d FROM activity_events
            UNION SELECT created_at AS d FROM posts
            UNION SELECT saved_at AS d FROM library_saves
        ) sub
        ON CONFLICT (date_key) DO NOTHING
    """)

    # 2. dim_member
    cur.execute("""
        INSERT INTO dw.dim_member (user_id, full_name, role, department, is_active)
        SELECT user_id, full_name, role, department, NOT is_flagged_spam
        FROM users
    """)

    # 3. dim_paper with PageRank tier
    cur.execute("""
        INSERT INTO dw.dim_paper (paper_id, title, publication_year, primary_source, pagerank_tier)
        SELECT
            paper_id,
            canonical_title,
            publication_year,
            COALESCE(sources->>0, 'openalex'),
            CASE
                WHEN pagerank_score >= (SELECT PERCENTILE_CONT(0.8) WITHIN GROUP (ORDER BY pagerank_score) FROM papers) THEN 'High'
                WHEN pagerank_score >= (SELECT PERCENTILE_CONT(0.4) WITHIN GROUP (ORDER BY pagerank_score) FROM papers) THEN 'Medium'
                ELSE 'Low'
            END
        FROM papers
    """)

    # 4. dim_topic with Semantic Centroid Clustering (Replace character n-gram index hardcoding)
    cur.execute("""
        SELECT DISTINCT UNNEST(topics) AS topic, COUNT(*) as paper_count
        FROM papers
        WHERE topics IS NOT NULL
        GROUP BY 1
    """)
    topic_counts = {r[0]: r[1] for r in cur.fetchall() if r[0]}
    topics = sorted(topic_counts.keys())

    cluster_map = {}
    if len(topics) >= 4:
        # Compute each topic's centroid from its associated papers' 384-d embeddings
        centroids = []
        valid_topics = []
        for t in topics:
            cur.execute("SELECT embedding FROM papers WHERE %s = ANY(topics) AND embedding IS NOT NULL LIMIT 50", (t,))
            emb_rows = cur.fetchall()
            if emb_rows:
                vecs = [np.array(json.loads(r[0]) if isinstance(r[0], str) else r[0], dtype=float) for r in emb_rows]
                centroid = np.mean(vecs, axis=0)
            else:
                centroid = np.array(get_embed_model().encode(t), dtype=float)
            centroids.append(centroid)
            valid_topics.append(t)

        centroids_arr = np.array(centroids)
        # Run Agglomerative Clustering on 384-d semantic centroids with ward linkage
        n_clusters = min(4, len(valid_topics))
        clustering = AgglomerativeClustering(n_clusters=n_clusters, linkage="ward")
        cluster_labels = clustering.fit_predict(centroids_arr)

        # Dynamically name each cluster from its top-3 highest-frequency member topics
        clusters_by_label = {}
        for t, lbl in zip(valid_topics, cluster_labels):
            clusters_by_label.setdefault(int(lbl), []).append(t)

        cluster_names = {}
        for lbl, members in clusters_by_label.items():
            # Sort by paper count descending
            sorted_members = sorted(members, key=lambda m: topic_counts.get(m, 0), reverse=True)
            top_3 = [m.title() for m in sorted_members[:3]]
            cluster_name = f"Cluster {chr(65 + lbl)}: " + " & ".join(top_3)
            cluster_names[lbl] = cluster_name
            for m in members:
                cluster_map[m] = cluster_name
    else:
        for t in topics:
            cluster_map[t] = "General Research Commons"

    execute_values(
        cur,
        "INSERT INTO dw.dim_topic (topic_name, parent_cluster) VALUES %s ON CONFLICT DO NOTHING",
        [(t, cluster_map.get(t, "Interdisciplinary Commons")) for t in topics],
    )
    print(f"    -> Clustered {len(topics)} topics into dynamic semantic centroid clusters.")

    # 5. Populate fact_research_activity with accurate comments_count measure
    cur.execute("""
        INSERT INTO dw.fact_research_activity (date_key, member_key, topic_key, paper_key, saves_count, posts_count, comments_count, upvotes_count, views_count)
        SELECT
            TO_CHAR(e.occurred_at, 'YYYYMMDD')::INT AS date_key,
            dm.member_key,
            dt.topic_key,
            dp.paper_key,
            CASE WHEN e.event_type = 'save_paper' THEN 1 ELSE 0 END,
            CASE WHEN e.event_type = 'create_post' THEN 1 ELSE 0 END,
            CASE WHEN e.event_type = 'add_comment' THEN 1 ELSE 0 END,
            CASE WHEN e.event_type = 'upvote' OR e.event_type = 'vote_post' THEN 1 ELSE 0 END,
            CASE WHEN e.event_type = 'view_paper' THEN 1 ELSE 0 END
        FROM activity_events e
        JOIN dw.dim_member dm ON e.user_id = dm.user_id
        LEFT JOIN dw.dim_topic dt ON dt.topic_name = e.topic_tags[1]
        LEFT JOIN dw.dim_paper dp ON dp.paper_id = e.target_id
    """)

    # 6. Populate fact_dept_collaboration
    cur.execute("""
        INSERT INTO dw.fact_dept_collaboration (date_key, source_department, target_department, interaction_type, interaction_count)
        SELECT
            TO_CHAR(uf.created_at, 'YYYYMMDD')::INT,
            u1.department,
            u2.department,
            'follow',
            COUNT(*)
        FROM user_follows uf
        JOIN users u1 ON uf.follower_id = u1.user_id
        JOIN users u2 ON uf.followee_id = u2.user_id
        GROUP BY 1, 2, 3
    """)

    cur.execute("""
        INSERT INTO dw.fact_dept_collaboration (date_key, source_department, target_department, interaction_type, interaction_count)
        SELECT
            TO_CHAR(c.created_at, 'YYYYMMDD')::INT,
            u_commenter.department,
            u_author.department,
            'comment',
            COUNT(*)
        FROM comments c
        JOIN users u_commenter ON c.author_id = u_commenter.user_id
        JOIN posts p ON c.post_id = p.post_id
        JOIN users u_author ON p.author_id = u_author.user_id
        GROUP BY 1, 2, 3
    """)
    print("    -> Star schema facts and dimensions populated successfully.")


def persist_system_alerts(cur, anchor_dt: datetime):
    print("4/5 Computing and persisting date-anchored topic spikes & Isolation Forest spam alerts to public.system_alerts (F7)...")

    # Clear previously generated automated unresolved alerts to keep alerts fresh
    cur.execute("DELETE FROM public.system_alerts WHERE is_resolved = FALSE AND alert_type IN ('topic_spike', 'spam_account')")

    # A. Date-anchored Topic Spike Alerts (Anchored strictly to anchor_dt)
    cur.execute(
        """
        WITH expanded AS (
            SELECT UNNEST(topic_tags) AS topic, occurred_at
            FROM activity_events
            WHERE topic_tags IS NOT NULL
              AND occurred_at >= %s - INTERVAL '37 days'
              AND occurred_at <= %s
        ),
        window_counts AS (
            SELECT
                topic,
                COUNT(*) FILTER (WHERE occurred_at >= %s - INTERVAL '7 days') AS recent_7d,
                COUNT(*) FILTER (WHERE occurred_at < %s - INTERVAL '7 days') / 4.28 AS baseline_weekly_avg
            FROM expanded
            GROUP BY topic
        )
        SELECT topic, recent_7d, ROUND(baseline_weekly_avg::numeric, 2) AS baseline_weekly_avg,
               ROUND(((recent_7d - baseline_weekly_avg) / GREATEST(baseline_weekly_avg, 1.0))::numeric, 2) AS spike_ratio
        FROM window_counts
        WHERE ((recent_7d - baseline_weekly_avg) / GREATEST(baseline_weekly_avg, 1.0)) >= 1.5
        ORDER BY spike_ratio DESC
        """,
        (anchor_dt, anchor_dt, anchor_dt, anchor_dt),
    )
    spikes = cur.fetchall()

    spike_alert_rows = []
    for topic, rec_7d, base_avg, s_ratio in spikes:
        details = {
            "recent_7d": int(rec_7d),
            "baseline_weekly_avg": float(base_avg),
            "spike_ratio": float(s_ratio),
            "anchor_date": anchor_dt.isoformat(),
        }
        spike_alert_rows.append((
            "topic_spike",
            topic,
            float(s_ratio),
            json.dumps(details),
            anchor_dt,
        ))

    if spike_alert_rows:
        execute_values(
            cur,
            """
            INSERT INTO public.system_alerts (alert_type, entity_ref, severity_score, details, detected_at)
            VALUES %s
            """,
            spike_alert_rows,
        )
    print(f"    -> Persisted {len(spike_alert_rows)} topic spike alerts.")

    # B. Isolation Forest Spam Detection & Flagging
    cur.execute(
        """
        SELECT
            u.user_id::text,
            u.full_name,
            u.department,
            COUNT(DISTINCT p.post_id) AS post_count,
            COALESCE(EXTRACT(EPOCH FROM (MAX(p.created_at) - MIN(p.created_at))) / GREATEST(COUNT(p.post_id), 1), 999999) AS avg_seconds_between_posts,
            COALESCE(AVG(p.upvote_count), 0) AS avg_upvotes
        FROM users u
        LEFT JOIN posts p ON u.user_id = p.author_id
        GROUP BY u.user_id, u.full_name, u.department
        """
    )
    df = pd.DataFrame(cur.fetchall(), columns=["user_id", "full_name", "department", "post_count", "avg_seconds_between_posts", "avg_upvotes"])

    if len(df) >= 20:
        features = df[["post_count", "avg_seconds_between_posts", "avg_upvotes"]].fillna(0)
        iso = IsolationForest(n_estimators=150, random_state=42)
        iso.fit(features)
        # Inverted score: higher is more anomalous
        scores = -iso.decision_function(features)
        df["anomaly_score"] = scores
        # Absolute threshold for anomaly
        flagged = df[df["anomaly_score"] >= 0.15]

        spam_alert_rows = []
        for _, row in flagged.iterrows():
            cur.execute(
                "UPDATE users SET is_flagged_spam = TRUE, spam_score = %s WHERE user_id = %s::uuid",
                (float(row["anomaly_score"]), row["user_id"]),
            )
            details = {
                "full_name": row["full_name"],
                "department": row["department"],
                "post_count": int(row["post_count"]),
                "anomaly_score": round(float(row["anomaly_score"]), 4),
            }
            spam_alert_rows.append((
                "spam_account",
                row["user_id"],
                round(float(row["anomaly_score"]), 4),
                json.dumps(details),
                anchor_dt,
            ))

        if spam_alert_rows:
            execute_values(
                cur,
                """
                INSERT INTO public.system_alerts (alert_type, entity_ref, severity_score, details, detected_at)
                VALUES %s
                """,
                spam_alert_rows,
            )
        print(f"    -> Flagged and persisted {len(spam_alert_rows)} Isolation Forest spam account alerts.")


def create_analytical_views(cur):
    print("5/5 Refreshing analytical views (dw.vw_paper_topic_baskets, dw.vw_researcher_profiles)...")
    cur.execute("""
        CREATE OR REPLACE VIEW dw.dim_researcher AS
        SELECT member_key AS researcher_key, user_id AS researcher_id, full_name, role, department, is_active FROM dw.dim_member;

        CREATE OR REPLACE VIEW dw.dim_keyword AS
        SELECT topic_key AS keyword_key, topic_name AS keyword_name, parent_cluster AS domain_cluster FROM dw.dim_topic;

        CREATE OR REPLACE VIEW dw.fact_publication AS
        SELECT paper_key, paper_id, title, publication_year, primary_source, pagerank_tier FROM dw.dim_paper;

        CREATE OR REPLACE VIEW dw.vw_paper_topic_baskets AS
        WITH paper_topics_exploded AS (
            SELECT 
                p.paper_id::text AS tid,
                p.paper_id,
                dp.paper_key,
                TRIM(t) AS item_label,
                COALESCE(p.publication_year, dp.publication_year, 2024) AS pub_year
            FROM papers p
            LEFT JOIN dw.dim_paper dp ON p.paper_id = dp.paper_id
            CROSS JOIN UNNEST(p.topics) AS t
            WHERE TRIM(t) NOT IN (
                'Computer Science & AI', 'Electronics & Communication', 'Biotechnology',
                'Management & Commerce', 'School of Law', 'Liberal Arts & Humanities'
            )
            UNION
            SELECT 
                p.paper_id::text AS tid,
                p.paper_id,
                dp.paper_key,
                TRIM(dt.topic_name) AS item_label,
                COALESCE(p.publication_year, dp.publication_year, 2024) AS pub_year
            FROM papers p
            JOIN dw.dim_paper dp ON p.paper_id = dp.paper_id
            JOIN dw.fact_research_activity fa ON dp.paper_key = fa.paper_key
            JOIN dw.dim_topic dt ON fa.topic_key = dt.topic_key
            WHERE dt.topic_name IS NOT NULL
        ),
        paper_meta AS (
            SELECT 
                p.paper_id,
                COALESCE(
                    (SELECT t FROM UNNEST(p.topics) t WHERE t IN (
                        'Computer Science & AI', 'Electronics & Communication', 'Biotechnology',
                        'Management & Commerce', 'School of Law', 'Liberal Arts & Humanities'
                    ) LIMIT 1),
                    'Computer Science & AI'
                ) AS department_name
            FROM papers p
        )
        SELECT DISTINCT
            pte.tid,
            pte.paper_key,
            pte.paper_id,
            pte.item_label,
            CASE 
                WHEN pm.department_name IN ('Computer Science & AI', 'Electronics & Communication') 
                    THEN 'School of Technology & AI'
                WHEN pm.department_name = 'Biotechnology' 
                    THEN 'School of Biosciences'
                WHEN pm.department_name = 'Management & Commerce' 
                    THEN 'School of Management & Commerce'
                WHEN pm.department_name = 'School of Law' 
                    THEN 'School of Law'
                WHEN pm.department_name = 'Liberal Arts & Humanities' 
                    THEN 'School of Liberal Arts & Humanities'
                ELSE 'School of Interdisciplinary Studies'
            END AS school_name,
            pm.department_name,
            pte.pub_year
        FROM paper_topics_exploded pte
        JOIN paper_meta pm ON pte.paper_id = pm.paper_id
        WHERE pte.item_label IS NOT NULL AND LENGTH(pte.item_label) > 1;

        CREATE OR REPLACE VIEW dw.vw_researcher_profiles AS
        SELECT 
            u.user_id AS researcher_id,
            u.full_name AS researcher_name,
            u.role,
            u.department,
            CASE 
                WHEN u.department IN ('Computer Science & AI', 'Electronics & Communication') 
                    THEN 'School of Technology & AI'
                WHEN u.department = 'Biotechnology' 
                    THEN 'School of Biosciences'
                WHEN u.department = 'Management & Commerce' 
                    THEN 'School of Management & Commerce'
                WHEN u.department = 'School of Law' 
                    THEN 'School of Law'
                WHEN u.department = 'Liberal Arts & Humanities' 
                    THEN 'School of Liberal Arts & Humanities'
                ELSE 'School of Interdisciplinary Studies'
            END AS school_name,
            COUNT(DISTINCT ls.paper_id)::INT AS total_publications,
            COALESCE(COUNT(DISTINCT pc.citing_paper_id), 0)::INT AS total_citations,
            ROUND(COALESCE(AVG(jsonb_array_length(COALESCE(p.authors, '[]'::jsonb))), 1.0)::NUMERIC, 2)::FLOAT AS avg_coauthors,
            ROUND(COALESCE(AVG(p.pagerank_score), 0.001)::NUMERIC, 5)::FLOAT AS avg_pagerank,
            GREATEST(
                COALESCE(CARDINALITY(u.interest_tags), 0),
                COUNT(DISTINCT fa.topic_key),
                1
            )::INT AS topic_breadth
        FROM users u
        LEFT JOIN library_saves ls ON u.user_id = ls.user_id
        LEFT JOIN papers p ON ls.paper_id = p.paper_id
        LEFT JOIN paper_citations pc ON p.paper_id = pc.cited_paper_id
        LEFT JOIN dw.dim_member dm ON u.user_id = dm.user_id
        LEFT JOIN dw.fact_research_activity fa ON dm.member_key = fa.member_key
        WHERE u.is_flagged_spam = FALSE
        GROUP BY u.user_id, u.full_name, u.role, u.department, u.interest_tags;
    """)
    print("    -> Analytical views refreshed successfully.")


def main():
    parser = argparse.ArgumentParser(description="Run Star Schema ELT, Graph Mining & Alerts for Chanakya Research Commons")
    parser.add_argument("--as-of", type=str, default=None, help="Anchor date (YYYY-MM-DD) for trends and spike detection")
    args = parser.parse_args()

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    anchor_dt = get_anchor_date(cur, args.as_of)
    print(f"[ELT Pipeline] Running with temporal anchor date: {anchor_dt.isoformat()}")

    run_minhash_deduplication(cur)
    run_citation_pagerank(cur)
    build_star_schema(cur)
    persist_system_alerts(cur, anchor_dt)
    create_analytical_views(cur)

    conn.commit()
    cur.close()
    conn.close()
    print("[ELT Pipeline] ELT, Graph Mining & Views pipeline complete!")


if __name__ == "__main__":
    main()
