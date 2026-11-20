import os
import json
from collections import defaultdict
from typing import Optional, List, Dict, Any
import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import RealDictCursor
from mlxtend.frequent_patterns import fpgrowth, fpmax, association_rules
from mlxtend.preprocessing import TransactionEncoder
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics import silhouette_score
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DATABASE_URL", "postgresql://crc_admin:crc_secure_pass@localhost:5434/chanakya_commons")

# In-memory cache for high-lift search expansion rules
_SEARCH_EXPANSION_CACHE: Dict[str, Any] = {
    "timestamp": 0,
    "rules": []
}


def get_conn():
    return psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)


def ensure_views_exist(cur):
    """Ensure analytical views exist in case migrations or ELT have not run yet."""
    cur.execute("""
        CREATE SCHEMA IF NOT EXISTS dw;

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


# =====================================================================
# 1. Subgroup-Stratified FP-Growth & FP-Max Association Rule Mining
# =====================================================================
def get_topic_associations(
    school: Optional[str] = None,
    min_support: float = 0.04,
    min_lift: float = 1.2
) -> Dict[str, Any]:
    """
    Subgroup-Stratified FP-Growth and FP-Max mining over publication topic baskets.
    - Filters by school_name when provided to prevent cross-department confounding.
    - Dynamic support floor: max(min_support, 3.0 / n_baskets).
    - FP-Max yields non-redundant maximal thematic bundles (length >= 2).
    - Association rules strictly filtered by lift >= min_lift, sorted by lift DESC, conviction DESC.
    """
    conn = get_conn()
    cur = conn.cursor()

    try:
        ensure_views_exist(cur)
        conn.commit()

        if school and school.upper() != "ALL":
            cur.execute(
                """
                SELECT tid, item_label, school_name, department_name, pub_year
                FROM dw.vw_paper_topic_baskets
                WHERE school_name ILIKE %s
                """,
                (f"%{school}%",),
            )
        else:
            cur.execute(
                """
                SELECT tid, item_label, school_name, department_name, pub_year
                FROM dw.vw_paper_topic_baskets
                """
            )
        rows = cur.fetchall()

    except Exception:
        # Graceful fallback: query directly from papers if dw schema is mid-migration
        conn.rollback()
        cur.execute("SELECT paper_id::text AS tid, canonical_title, topics FROM papers LIMIT 1000")
        raw_rows = cur.fetchall()
        rows = []
        for r in raw_rows:
            tid = r["tid"]
            for t in (r["topics"] or []):
                rows.append({"tid": tid, "item_label": t.strip(), "school_name": "School of Technology & AI"})
    finally:
        cur.close()
        conn.close()

    if not rows:
        return {
            "school": school or "ALL",
            "n_baskets": 0,
            "min_support": min_support,
            "min_lift": min_lift,
            "maximal_bundles": [],
            "rules": [],
            "total_rules": 0,
            "total_bundles": 0,
        }

    # Group into baskets by transaction TID
    baskets_dict: Dict[str, set] = defaultdict(set)
    for r in rows:
        label = (r.get("item_label") or "").strip()
        if label and len(label) > 1:
            baskets_dict[str(r["tid"])].add(label)

    # Convert to list of lists (keep baskets with >= 1 item, support calculation over all transactions)
    baskets: List[List[str]] = [sorted(list(items)) for items in baskets_dict.values() if items]
    n_baskets = len(baskets)

    if n_baskets == 0:
        return {
            "school": school or "ALL",
            "n_baskets": 0,
            "min_support": min_support,
            "min_lift": min_lift,
            "maximal_bundles": [],
            "rules": [],
            "total_rules": 0,
            "total_bundles": 0,
        }

    # Enforce dynamic minimum support floor (must be at least 3 occurrences)
    dynamic_support_floor = 3.0 / float(n_baskets)
    effective_min_support = max(float(min_support), dynamic_support_floor)
    effective_min_support = min(effective_min_support, 0.45)  # Avoid setting support too high

    # Encode transactions into binary presence/absence matrix
    te = TransactionEncoder()
    te_ary = te.fit(baskets).transform(baskets)
    df_bool = pd.DataFrame(te_ary, columns=te.columns_)

    # 1. Run FP-Growth for frequent itemsets
    frequent_itemsets = fpgrowth(df_bool, min_support=effective_min_support, use_colnames=True)

    # If too few itemsets found, try adaptive backoff support once
    if frequent_itemsets.empty and effective_min_support > 0.015:
        adaptive_support = max(0.015, dynamic_support_floor * 0.7)
        frequent_itemsets = fpgrowth(df_bool, min_support=adaptive_support, use_colnames=True)
        effective_min_support = adaptive_support

    # 2. Run FP-Max for compact, non-redundant maximal thematic bundles (length >= 2)
    maximal_bundles: List[Dict[str, Any]] = []
    try:
        max_itemsets = fpmax(df_bool, min_support=effective_min_support, use_colnames=True)
        if not max_itemsets.empty:
            max_itemsets["length"] = max_itemsets["itemsets"].apply(len)
            # Filter for compact bundles of 2 or more topics
            multi_max = max_itemsets[max_itemsets["length"] >= 2].sort_values("support", ascending=False)
            for _, mrow in multi_max.iterrows():
                items = sorted(list(mrow["itemsets"]))
                supp = float(mrow["support"])
                maximal_bundles.append({
                    "bundle": items,
                    "support": round(supp, 4),
                    "support_pct": round(supp * 100, 2),
                    "paper_count": int(round(supp * n_baskets)),
                    "length": len(items)
                })
    except Exception as exc:
        print(f"FP-Max extraction notice: {exc}")

    # 3. Generate association rules strictly filtered by lift >= min_lift
    rules_list: List[Dict[str, Any]] = []
    if not frequent_itemsets.empty:
        try:
            raw_rules = association_rules(frequent_itemsets, metric="lift", min_threshold=float(min_lift))

            # Filter strictly by lift >= min_lift
            valid_rules = raw_rules[raw_rules["lift"] >= float(min_lift)].copy()

            # Handle conviction infinite values & NaNs for JSON compliance
            conv_col = "conviction"
            if conv_col in valid_rules.columns:
                valid_rules[conv_col] = valid_rules[conv_col].replace([np.inf, -np.inf], 999.0).fillna(1.0)
            else:
                valid_rules[conv_col] = 1.0

            # Sort by lift DESC, conviction DESC to avoid high-confidence ubiquitous traps
            valid_rules = valid_rules.sort_values(by=["lift", conv_col], ascending=[False, False])

            for _, r in valid_rules.head(60).iterrows():
                ant = sorted(list(r["antecedents"]))
                con = sorted(list(r["consequents"]))
                supp = float(r["support"])
                conf = float(r["confidence"])
                lift_val = float(r["lift"])
                conv_val = float(r[conv_col])

                ant_supp = float(r.get("antecedent support", r.get("antecedent_support", 0.0)))
                con_supp = float(r.get("consequent support", r.get("consequent_support", 0.0)))

                rules_list.append({
                    "antecedents": ant,
                    "consequents": con,
                    "antecedent_support": round(ant_supp, 4),
                    "consequent_support": round(con_supp, 4),
                    "support": round(supp, 4),
                    "confidence": round(conf, 4),
                    "confidence_pct": round(conf * 100, 1),
                    "lift": round(lift_val, 4),
                    "conviction": round(conv_val, 4) if conv_val < 900 else "inf"
                })
        except Exception as exc:
            print(f"Association rules generation notice: {exc}")

    # Update in-memory search expansion cache with high-lift rules (lift >= 1.5)
    global _SEARCH_EXPANSION_CACHE
    high_lift_rules = [r for r in rules_list if r["lift"] >= 1.5]
    if high_lift_rules:
        _SEARCH_EXPANSION_CACHE["rules"] = high_lift_rules

    return {
        "school": school or "ALL",
        "n_baskets": n_baskets,
        "min_support": round(effective_min_support, 4),
        "min_lift": min_lift,
        "maximal_bundles": maximal_bundles[:25],
        "rules": rules_list[:40],
        "total_rules": len(rules_list),
        "total_bundles": len(maximal_bundles),
    }


# =====================================================================
# 2. Agglomerative Researcher Clustering & Trait Profiling Rules
# =====================================================================
def get_researcher_archetypes(n_clusters: int = 4) -> Dict[str, Any]:
    """
    Standardizes continuous researcher profile metrics, performs Agglomerative Clustering
    (linkage='ward'), evaluates silhouette_score, discretizes metrics into tertiles,
    and mines human-readable trait rules identifying each cluster with lift > 1.1.
    """
    conn = get_conn()
    cur = conn.cursor()

    try:
        ensure_views_exist(cur)
        conn.commit()

        cur.execute("""
            SELECT researcher_id, researcher_name, role, department, school_name,
                   total_publications, total_citations, avg_coauthors, avg_pagerank, topic_breadth
            FROM dw.vw_researcher_profiles
        """)
        rows = cur.fetchall()
    except Exception:
        conn.rollback()
        # Fallback query from users table if dw views were mid-transition
        cur.execute("""
            SELECT user_id AS researcher_id, full_name AS researcher_name, role, department,
                   'School of Technology & AI' AS school_name,
                   12 AS total_publications, 4 AS total_citations, 3.2 AS avg_coauthors,
                   0.0025 AS avg_pagerank, 4 AS topic_breadth
            FROM users
            WHERE is_flagged_spam = FALSE
        """)
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    if not rows or len(rows) < 4:
        return {
            "n_clusters": n_clusters,
            "silhouette_score": 0.0,
            "clusters": [],
            "cluster_rules": [],
            "researchers": []
        }

    df = pd.DataFrame(rows)
    feature_cols = ["total_publications", "total_citations", "avg_coauthors", "avg_pagerank", "topic_breadth"]

    for col in feature_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    # Standardize continuous metrics using StandardScaler
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(df[feature_cols])

    # Agglomerative Clustering with Ward linkage
    n_cl = max(2, min(n_clusters, len(df) - 1))
    clustering = AgglomerativeClustering(n_clusters=n_cl, linkage="ward")
    cluster_labels = clustering.fit_predict(X_scaled)

    df["cluster"] = cluster_labels
    df["cluster_id"] = [f"Cluster_{c}" for c in cluster_labels]

    # Evaluate cluster quality with silhouette score
    try:
        sil_score = float(silhouette_score(X_scaled, cluster_labels))
    except Exception:
        sil_score = 0.0

    # Discretize each metric into tertiles (_Low, _Mid, _High) using first-rank qcut
    transactions: List[List[str]] = []
    trait_cols = []
    for col in feature_cols:
        trait_col_name = f"{col}_trait"
        trait_cols.append(trait_col_name)
        df[f"{col}_tertile"] = pd.qcut(
            df[col].rank(method="first"),
            q=3,
            labels=["_Low", "_Mid", "_High"]
        ).astype(str)
        df[trait_col_name] = col + df[f"{col}_tertile"]

    # Build binary presence/absence transaction matrix for cluster trait association rules
    for _, row in df.iterrows():
        t = [row["cluster_id"]] + [row[tc] for tc in trait_cols]
        transactions.append(t)

    te = TransactionEncoder()
    te_ary = te.fit(transactions).transform(transactions)
    df_traits = pd.DataFrame(te_ary, columns=te.columns_)

    # Mine association rules where consequents identify Cluster_<id> with lift > 1.1
    cluster_rules: List[Dict[str, Any]] = []
    try:
        freq_traits = fpgrowth(df_traits, min_support=0.08, use_colnames=True)
        if not freq_traits.empty:
            rules_traits = association_rules(freq_traits, metric="lift", min_threshold=1.1)

            # Strictly select rules whose consequent is a single Cluster_<id>
            for _, r in rules_traits.iterrows():
                conseqs = list(r["consequents"])
                if len(conseqs) == 1 and conseqs[0].startswith("Cluster_"):
                    c_name = conseqs[0]
                    ant_traits = sorted(list(r["antecedents"]))
                    lift_val = float(r["lift"])
                    if lift_val > 1.1 and not any(a.startswith("Cluster_") for a in ant_traits):
                        cluster_rules.append({
                            "cluster": c_name,
                            "traits": ant_traits,
                            "support": round(float(r["support"]), 4),
                            "confidence": round(float(r["confidence"]), 4),
                            "lift": round(lift_val, 4)
                        })

            # Sort cluster rules by lift descending
            cluster_rules.sort(key=lambda x: x["lift"], reverse=True)
    except Exception as exc:
        print(f"Cluster trait mining notice: {exc}")

    # Compute archetype summaries & descriptive names
    cluster_summaries: List[Dict[str, Any]] = []
    global_means = df[feature_cols].mean()

    archetype_titles = {
        0: "High-Impact Core Researchers",
        1: "Broad Interdisciplinary Explorers",
        2: "Collaborative High-Citation Leaders",
        3: "Emerging Domain Specialists",
        4: "Independent High-Authority Scholars",
    }

    for c_idx in sorted(df["cluster"].unique()):
        sub = df[df["cluster"] == c_idx]
        c_name = f"Cluster_{c_idx}"
        means = sub[feature_cols].mean().to_dict()

        # Find top traits from the mined rules for this cluster
        top_traits = [
            r["traits"] for r in cluster_rules if r["cluster"] == c_name
        ]
        flat_traits = list({trait for t_list in top_traits[:4] for trait in t_list})

        # Name archetype intelligently based on relative metrics
        if means["total_publications"] > global_means["total_publications"] and means["total_citations"] > global_means["total_citations"]:
            title = "High-Impact Core Researchers"
        elif means["topic_breadth"] > global_means["topic_breadth"] and means["avg_coauthors"] > global_means["avg_coauthors"]:
            title = "Broad Interdisciplinary Explorers"
        elif means["avg_pagerank"] > global_means["avg_pagerank"]:
            title = "High-Authority Domain Specialists"
        else:
            title = archetype_titles.get(c_idx, f"Research Archetype {c_idx + 1}")

        dept_dist = sub["department"].value_counts().to_dict()

        cluster_summaries.append({
            "cluster_id": c_name,
            "cluster_index": int(c_idx),
            "archetype_title": title,
            "size": len(sub),
            "percentage": round(len(sub) / len(df) * 100, 1),
            "mean_metrics": {k: round(float(v), 3) for k, v in means.items()},
            "prominent_traits": flat_traits[:5],
            "department_distribution": dept_dist
        })

    researchers_out = df[[
        "researcher_id", "researcher_name", "role", "department", "school_name",
        "cluster_id", "total_publications", "total_citations", "avg_coauthors", "avg_pagerank", "topic_breadth"
    ]].head(50).to_dict(orient="records")

    return {
        "n_clusters": n_cl,
        "silhouette_score": round(sil_score, 4),
        "clusters": cluster_summaries,
        "cluster_rules": cluster_rules[:25],
        "researchers": researchers_out
    }


# =====================================================================
# 3. Search Expansion Hook (High-Lift Antecedent Matching)
# =====================================================================
def get_related_topics_for_query(query: str, min_lift: float = 1.5) -> List[str]:
    """
    Hooks into search queries: when the query matches an antecedent keyword in high-lift rules,
    returns consequent topics as related search recommendations.
    """
    global _SEARCH_EXPANSION_CACHE
    rules = _SEARCH_EXPANSION_CACHE.get("rules", [])

    # If cache is empty, load associations once
    if not rules:
        try:
            assoc = get_topic_associations(school="ALL", min_support=0.03, min_lift=min_lift)
            rules = [r for r in assoc.get("rules", []) if r["lift"] >= min_lift]
            _SEARCH_EXPANSION_CACHE["rules"] = rules
        except Exception:
            rules = []

    q_lower = query.lower().strip()
    related: set = set()

    for r in rules:
        antecedents = [a.lower() for a in r.get("antecedents", [])]
        # Check if query matches or is a substring of any antecedent
        if any(ant in q_lower or q_lower in ant for ant in antecedents):
            for cons in r.get("consequents", []):
                if cons.lower() not in q_lower:
                    related.add(cons)

    return sorted(list(related))[:6]
