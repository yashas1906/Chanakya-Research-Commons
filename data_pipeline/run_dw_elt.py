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


def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    run_minhash_deduplication(cur)
    run_citation_pagerank(cur)
    build_star_schema(cur)
    conn.commit()
    cur.close()
    conn.close()
    print("4/4 ELT & Graph Mining pipeline complete!")


if __name__ == "__main__":
    main()
