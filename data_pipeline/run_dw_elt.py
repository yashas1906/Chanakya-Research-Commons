import os
import json
import numpy as np
import pandas as pd
import networkx as nx
import psycopg2
from psycopg2.extras import execute_values
from datasketch import MinHash, MinHashLSH
from sklearn.cluster import AgglomerativeClustering
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL", "postgresql://crc_admin:crc_secure_pass@localhost:5434/chanakya_commons")


def run_minhash_deduplication(cur):
    print("1/4 Running MinHash + LSH near-duplicate detection (F4/F5)...")
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
    print("2/4 Computing PageRank on paper citation graph via NetworkX (F5)...")
    cur.execute("SELECT paper_id FROM papers")
    all_pids = [str(r[0]) for r in cur.fetchall()]

    cur.execute("SELECT citing_paper_id, cited_paper_id FROM paper_citations")
    edges = [(str(r[0]), str(r[1])) for r in cur.fetchall()]

    G = nx.DiGraph()
    G.add_nodes_from(all_pids)
    G.add_edges_from(edges)

    pr_scores = nx.pagerank(G, alpha=0.85)
    update_rows = [(float(score), pid) for pid, score in pr_scores.items()]

    execute_values(
        cur,
        "UPDATE papers AS p SET pagerank_score = v.score FROM (VALUES %s) AS v(score, id) WHERE p.paper_id = v.id::uuid",
        update_rows,
    )
    print(f"    -> Updated PageRank scores across {len(all_pids)} nodes and {len(edges)} citation edges.")


def build_star_schema(cur):
    print("3/4 Populating Star Schema dimensions & facts (dw.*) for F9 Analytics...")
    cur.execute("TRUNCATE dw.fact_research_activity, dw.fact_dept_collaboration, dw.dim_date, dw.dim_member, dw.dim_topic, dw.dim_paper RESTART IDENTITY CASCADE")

    # dim_date from all activity timestamps
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

    # dim_member
    cur.execute("""
        INSERT INTO dw.dim_member (user_id, full_name, role, department, is_active)
        SELECT user_id, full_name, role, department, NOT is_flagged_spam
        FROM users
    """)

    # dim_paper with PageRank tier
    cur.execute("""
        INSERT INTO dw.dim_paper (paper_id, title, publication_year, primary_source, pagerank_tier)
        SELECT
            paper_id,
            canonical_title,
            publication_year,
            'openalex',
            CASE
                WHEN pagerank_score >= (SELECT PERCENTILE_CONT(0.8) WITHIN GROUP (ORDER BY pagerank_score) FROM papers) THEN 'High'
                WHEN pagerank_score >= (SELECT PERCENTILE_CONT(0.4) WITHIN GROUP (ORDER BY pagerank_score) FROM papers) THEN 'Medium'
                ELSE 'Low'
            END
        FROM papers
    """)

    # dim_topic with hierarchical clustering (AgglomerativeClustering on topic embeddings)
    cur.execute("SELECT DISTINCT UNNEST(topics) FROM papers WHERE topics IS NOT NULL")
    topics = sorted([r[0] for r in cur.fetchall() if r[0]])

    cluster_map = {}
    if len(topics) >= 4:
        # Group topics into 4 broad research clusters using TF-IDF / character n-grams + AgglomerativeClustering
        from sklearn.feature_extraction.text import TfidfVectorizer
        vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 4)).fit_transform(topics).toarray()
        labels = AgglomerativeClustering(n_clusters=4).fit_predict(vec)
        cluster_names = {
            0: "Cluster A: Intelligent Systems & Computing",
            1: "Cluster B: Life Sciences & Bio-Engineering",
            2: "Cluster C: Policy, Governance & Society",
            3: "Cluster D: Applied Analytics & Hardware",
        }
        for t, lbl in zip(topics, labels):
            cluster_map[t] = cluster_names[int(lbl)]
    else:
        for t in topics:
            cluster_map[t] = "General Research"

    execute_values(
        cur,
        "INSERT INTO dw.dim_topic (topic_name, parent_cluster) VALUES %s ON CONFLICT DO NOTHING",
        [(t, cluster_map[t]) for t in topics],
    )

    # Populate fact_research_activity from activity_events
    cur.execute("""
        INSERT INTO dw.fact_research_activity (date_key, member_key, topic_key, paper_key, saves_count, posts_count, comments_count, upvotes_count, views_count)
        SELECT
            TO_CHAR(e.occurred_at, 'YYYYMMDD')::INT AS date_key,
            dm.member_key,
            dt.topic_key,
            dp.paper_key,
            CASE WHEN e.event_type = 'save_paper' THEN 1 ELSE 0 END,
            CASE WHEN e.event_type = 'create_post' THEN 1 ELSE 0 END,
            0,
            CASE WHEN e.event_type = 'upvote' THEN 1 ELSE 0 END,
            CASE WHEN e.event_type = 'view_paper' THEN 1 ELSE 0 END
        FROM activity_events e
        JOIN dw.dim_member dm ON e.user_id = dm.user_id
        LEFT JOIN dw.dim_topic dt ON dt.topic_name = e.topic_tags[1]
        LEFT JOIN dw.dim_paper dp ON dp.paper_id = e.target_id
    """)

    # Populate fact_dept_collaboration (follows + cross-dept comments)
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
    print("    -> Star schema tables populated successfully.")


def create_analytical_views(cur):
    print("4/5 Creating and refreshing analytical views (dw.vw_paper_topic_baskets, dw.vw_researcher_profiles)...")
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
    print("    -> Analytical views created successfully.")


def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    run_minhash_deduplication(cur)
    run_citation_pagerank(cur)
    build_star_schema(cur)
    create_analytical_views(cur)
    conn.commit()
    cur.close()
    conn.close()
    print("5/5 ELT, Graph Mining & Views pipeline complete!")


if __name__ == "__main__":
    main()
