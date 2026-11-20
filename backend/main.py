import os
import json
from typing import Optional
import numpy as np
import pandas as pd
import requests
import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from sklearn.ensemble import IsolationForest
from mlxtend.frequent_patterns import fpgrowth, association_rules
from dotenv import load_dotenv

try:
    from backend.services.mining_service import (
        get_topic_associations,
        get_researcher_archetypes,
        get_related_topics_for_query,
    )
except ImportError:
    from services.mining_service import (
        get_topic_associations,
        get_researcher_archetypes,
        get_related_topics_for_query,
    )

load_dotenv()

DB_URL = os.getenv("DATABASE_URL", "postgresql://crc_admin:crc_secure_pass@localhost:5434/chanakya_commons")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")

app = FastAPI(title="Chanakya Research Commons API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

embed_model = SentenceTransformer("all-MiniLM-L6-v2")


def get_conn():
    return psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)


def vec_literal(text: str) -> str:
    emb = embed_model.encode(text).tolist()
    return "[" + ",".join(f"{x:.6f}" for x in emb) + "]"


# ==========================================
# Pydantic Schemas
# ==========================================
class PostCreate(BaseModel):
    author_id: str
    title: str
    body: str
    tags: list[str] = []
    attached_paper_id: Optional[str] = None


class SavePaperRequest(BaseModel):
    user_id: str
    paper_id: str
    private_notes: Optional[str] = ""


class AskAssistantRequest(BaseModel):
    question: str
    library_only: bool = False


# ==========================================
# F1: Accounts & Profiles
# ==========================================
@app.get("/api/users")
def list_users(department: Optional[str] = None, limit: int = 30):
    conn = get_conn()
    cur = conn.cursor()
    if department:
        cur.execute(
            "SELECT user_id, university_id, full_name, email, role, department, bio, interest_tags, is_flagged_spam FROM users WHERE department = %s LIMIT %s",
            (department, limit),
        )
    else:
        cur.execute(
            "SELECT user_id, university_id, full_name, email, role, department, bio, interest_tags, is_flagged_spam FROM users ORDER BY created_at DESC LIMIT %s",
            (limit,),
        )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows


# ==========================================
# F2: Posts, Feed & Upvotes
# ==========================================
@app.get("/api/feed")
def get_feed(user_id: Optional[str] = None, limit: int = 25):
    conn = get_conn()
    cur = conn.cursor()
    if user_id:
        cur.execute(
            """
            SELECT p.post_id, p.title, p.body, p.tags, p.upvote_count, p.created_at,
                   u.full_name AS author_name, u.department AS author_dept, u.role AS author_role,
                   pa.canonical_title AS attached_paper_title, pa.paper_id AS attached_paper_id,
                   CASE WHEN uf.followee_id IS NOT NULL THEN 2 ELSE 0 END +
                   (1 - (p.post_embedding <=> u_me.profile_embedding)) AS relevance_score
            FROM posts p
            JOIN users u ON p.author_id = u.user_id
            CROSS JOIN (SELECT profile_embedding FROM users WHERE user_id = %s::uuid) u_me
            LEFT JOIN user_follows uf ON uf.follower_id = %s::uuid AND uf.followee_id = p.author_id
            LEFT JOIN papers pa ON p.attached_paper_id = pa.paper_id
            WHERE p.is_flagged_spam = FALSE AND u.is_flagged_spam = FALSE
            ORDER BY relevance_score DESC, p.created_at DESC
            LIMIT %s
            """,
            (user_id, user_id, limit),
        )
    else:
        cur.execute(
            """
            SELECT p.post_id, p.title, p.body, p.tags, p.upvote_count, p.created_at,
                   u.full_name AS author_name, u.department AS author_dept, u.role AS author_role,
                   pa.canonical_title AS attached_paper_title, pa.paper_id AS attached_paper_id
            FROM posts p
            JOIN users u ON p.author_id = u.user_id
            LEFT JOIN papers pa ON p.attached_paper_id = pa.paper_id
            WHERE p.is_flagged_spam = FALSE AND u.is_flagged_spam = FALSE
            ORDER BY p.created_at DESC
            LIMIT %s
            """,
            (limit,),
        )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows


@app.post("/api/posts")
def create_post(payload: PostCreate):
    conn = get_conn()
    cur = conn.cursor()
    q_vec = vec_literal(f"{payload.title} {payload.body}")
    cur.execute(
        """
        INSERT INTO posts (author_id, attached_paper_id, title, body, tags, post_embedding)
        VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s::vector)
        RETURNING post_id, title, created_at
        """,
        (payload.author_id, payload.attached_paper_id, payload.title, payload.body, payload.tags, q_vec),
    )
    post = cur.fetchone()
    cur.execute(
        "INSERT INTO activity_events (user_id, event_type, target_id, topic_tags) VALUES (%s::uuid, 'create_post', %s::uuid, %s)",
        (payload.author_id, post["post_id"], payload.tags),
    )
    conn.commit()
    cur.close()
    conn.close()
    return post


# ==========================================
# F3: Shared Chanakya Library
# ==========================================
@app.get("/api/library")
def get_library(user_id: Optional[str] = None, limit: int = 30):
    conn = get_conn()
    cur = conn.cursor()
    if user_id:
        cur.execute(
            """
            SELECT p.paper_id, p.canonical_title, p.abstract, p.authors, p.publication_year, p.venue, p.topics,
                   p.save_count, p.pagerank_score, ls.private_notes, ls.saved_at
            FROM library_saves ls
            JOIN papers p ON ls.paper_id = p.paper_id
            WHERE ls.user_id = %s::uuid
            ORDER BY ls.saved_at DESC
            LIMIT %s
            """,
            (user_id, limit),
        )
    else:
        cur.execute(
            """
            SELECT paper_id, canonical_title, abstract, authors, publication_year, venue, topics, save_count, pagerank_score
            FROM papers
            WHERE in_chanakya_library = TRUE
            ORDER BY save_count DESC, pagerank_score DESC
            LIMIT %s
            """,
            (limit,),
        )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows


@app.post("/api/library/save")
def save_to_library(req: SavePaperRequest):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO library_saves (user_id, paper_id, private_notes)
        VALUES (%s::uuid, %s::uuid, %s)
        ON CONFLICT (user_id, paper_id) DO UPDATE SET private_notes = EXCLUDED.private_notes
        """,
        (req.user_id, req.paper_id, req.private_notes),
    )
    cur.execute(
        """
        UPDATE papers
        SET save_count = (SELECT COUNT(*) FROM library_saves WHERE paper_id = %s::uuid),
            in_chanakya_library = TRUE
        WHERE paper_id = %s::uuid
        RETURNING paper_id, save_count
        """,
        (req.paper_id, req.paper_id),
    )
    updated = cur.fetchone()
    cur.execute(
        "INSERT INTO activity_events (user_id, event_type, target_id) VALUES (%s::uuid, 'save_paper', %s::uuid)",
        (req.user_id, req.paper_id),
    )
    conn.commit()
    cur.close()
    conn.close()
    return {"status": "saved", "paper": updated}


# ==========================================
# F5: Unified 4-Panel Hybrid Search (RRF + PageRank)
# ==========================================
@app.get("/api/search")
def unified_search(q: str = Query(..., min_length=2), limit: int = 8):
    conn = get_conn()
    cur = conn.cursor()
    q_vec = vec_literal(q)

    # Panel 1 & 2: Hybrid RRF (Keyword ts_rank + Semantic pgvector + PageRank boost)
    paper_sql = """
        WITH semantic AS (
            SELECT paper_id, ROW_NUMBER() OVER (ORDER BY embedding <=> %s::vector) AS sem_rank
            FROM papers
            WHERE in_chanakya_library = %s
            LIMIT 40
        ),
        keyword AS (
            SELECT paper_id, ROW_NUMBER() OVER (ORDER BY ts_rank(search_tsv, plainto_tsquery('english', %s)) DESC) AS kw_rank
            FROM papers
            WHERE in_chanakya_library = %s AND search_tsv @@ plainto_tsquery('english', %s)
            LIMIT 40
        )
        SELECT p.paper_id, p.canonical_title, p.abstract, p.authors, p.publication_year, p.venue, p.topics,
               p.save_count, p.pagerank_score, p.in_chanakya_library,
               ARRAY_AGG(DISTINCT ps.source_name) AS sources,
               (COALESCE(1.0 / (60 + s.sem_rank), 0) + COALESCE(1.0 / (60 + k.kw_rank), 0) + (p.pagerank_score * 10)) AS rrf_score
        FROM papers p
        LEFT JOIN semantic s ON p.paper_id = s.paper_id
        LEFT JOIN keyword k ON p.paper_id = k.paper_id
        LEFT JOIN paper_sources ps ON p.paper_id = ps.paper_id
        WHERE (s.paper_id IS NOT NULL OR k.paper_id IS NOT NULL)
        GROUP BY p.paper_id, s.sem_rank, k.kw_rank
        ORDER BY rrf_score DESC
        LIMIT %s
    """

    cur.execute(paper_sql, (q_vec, False, q, False, q, limit))
    external_papers = cur.fetchall()

    cur.execute(paper_sql, (q_vec, True, q, True, q, limit))
    library_papers = cur.fetchall()

    # Panel 3: University Members working in that area
    cur.execute(
        """
        SELECT user_id, full_name, role, department, bio, interest_tags,
               (1 - (profile_embedding <=> %s::vector)) AS similarity
        FROM users
        WHERE is_flagged_spam = FALSE
        ORDER BY profile_embedding <=> %s::vector
        LIMIT %s
        """,
        (q_vec, q_vec, limit),
    )
    people = cur.fetchall()

    # Panel 4: Related Posts & Discussions
    cur.execute(
        """
        SELECT p.post_id, p.title, p.body, p.tags, p.upvote_count, u.full_name AS author_name, u.department,
               (1 - (p.post_embedding <=> %s::vector)) AS similarity
        FROM posts p
        JOIN users u ON p.author_id = u.user_id
        WHERE p.is_flagged_spam = FALSE AND u.is_flagged_spam = FALSE
        ORDER BY p.post_embedding <=> %s::vector
        LIMIT %s
        """,
        (q_vec, q_vec, limit),
    )
    posts = cur.fetchall()

    cur.execute("INSERT INTO activity_events (event_type, search_query) VALUES ('search', %s)", (q,))
    conn.commit()
    cur.close()
    conn.close()

    # Search Expansion Hook: Match query against antecedents in high-lift rules (lift >= 1.5)
    related_topics = get_related_topics_for_query(q, min_lift=1.5)

    return {
        "query": q,
        "related_topics": related_topics,
        "panels": {
            "external_sources": external_papers,
            "chanakya_library": library_papers,
            "people": people,
            "posts": posts,
        },
    }


# ==========================================
# F6: Recommendations + FP-Growth "Also Saved"
# ==========================================
@app.get("/api/recommendations/{user_id}")
def get_recommendations(user_id: str, limit: int = 6):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT user_id, department, profile_embedding FROM users WHERE user_id = %s::uuid", (user_id,))
    user = cur.fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Recommended papers (excluding already saved)
    cur.execute(
        """
        SELECT p.paper_id, p.canonical_title, p.publication_year, p.venue, p.topics, p.save_count, p.pagerank_score,
               (1 - (p.embedding <=> u.profile_embedding)) AS match_score
        FROM papers p
        CROSS JOIN (SELECT profile_embedding FROM users WHERE user_id = %s::uuid) u
        WHERE p.paper_id NOT IN (SELECT paper_id FROM library_saves WHERE user_id = %s::uuid)
        ORDER BY match_score DESC, p.pagerank_score DESC
        LIMIT %s
        """,
        (user_id, user_id, limit),
    )
    rec_papers = cur.fetchall()

    # Recommended collaborators (excluding already followed)
    cur.execute(
        """
        SELECT other.user_id, other.full_name, other.role, other.department, other.interest_tags,
               (1 - (other.profile_embedding <=> me.profile_embedding)) AS match_score
        FROM users other
        CROSS JOIN (SELECT profile_embedding FROM users WHERE user_id = %s::uuid) me
        WHERE other.user_id != %s::uuid
          AND other.is_flagged_spam = FALSE
          AND other.user_id NOT IN (SELECT followee_id FROM user_follows WHERE follower_id = %s::uuid)
        ORDER BY match_score DESC
        LIMIT %s
        """,
        (user_id, user_id, user_id, limit),
    )
    rec_people = cur.fetchall()

    cur.close()
    conn.close()
    return {"recommended_papers": rec_papers, "recommended_people": rec_people}


@app.get("/api/papers/{paper_id}/also-saved")
def get_also_saved(paper_id: str, limit: int = 5):
    """Association Rule Mining (FP-Growth) on user library baskets."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT user_id, paper_id::text FROM library_saves")
    rows = cur.fetchall()

    if not rows:
        cur.close()
        conn.close()
        return []

    df = pd.DataFrame(rows)
    basket = pd.crosstab(df["user_id"], df["paper_id"]).astype(bool)

    recommendations = []
    if paper_id in basket.columns and len(basket) >= 5:
        freq_items = fpgrowth(basket, min_support=0.04, use_colnames=True)
        if not freq_items.empty:
            rules = association_rules(freq_items, metric="lift", min_threshold=1.1)
            matched = rules[rules["antecedents"].apply(lambda x: paper_id in x)]
            consequent_ids = []
            for _, r in matched.sort_values("confidence", ascending=False).iterrows():
                for cid in r["consequents"]:
                    if cid != paper_id and cid not in consequent_ids:
                        consequent_ids.append(cid)

            if consequent_ids:
                cur.execute(
                    "SELECT paper_id, canonical_title, publication_year, save_count FROM papers WHERE paper_id = ANY(%s::uuid[]) LIMIT %s",
                    (consequent_ids[:limit], limit),
                )
                recommendations = cur.fetchall()

    cur.close()
    conn.close()
    return recommendations


# ==========================================
# F7: Sliding Window Trends & Anomaly Detection
# ==========================================
@app.get("/api/trends-and-anomalies")
def get_trends_and_anomalies():
    conn = get_conn()
    cur = conn.cursor()

    # 1. Sliding window topic spike detection (Last 7 days vs previous 30-day daily average)
    cur.execute(
        """
        WITH expanded AS (
            SELECT UNNEST(topic_tags) AS topic, occurred_at
            FROM activity_events
            WHERE topic_tags IS NOT NULL AND occurred_at >= NOW() - INTERVAL '37 days'
        ),
        window_counts AS (
            SELECT
                topic,
                COUNT(*) FILTER (WHERE occurred_at >= NOW() - INTERVAL '7 days') AS recent_7d,
                COUNT(*) FILTER (WHERE occurred_at < NOW() - INTERVAL '7 days') / 4.28 AS baseline_weekly_avg
            FROM expanded
            GROUP BY topic
        )
        SELECT topic, recent_7d, ROUND(baseline_weekly_avg::numeric, 2) AS baseline_weekly_avg,
               ROUND(((recent_7d - baseline_weekly_avg) / GREATEST(baseline_weekly_avg, 1.0))::numeric, 2) AS spike_ratio
        FROM window_counts
        ORDER BY spike_ratio DESC
        LIMIT 10
        """
    )
    trending_topics = cur.fetchall()

    # 2. Isolation Forest Spam/Anomaly Detection on user behavior features
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
    user_stats = pd.DataFrame(cur.fetchall())

    flagged_accounts = []
    if len(user_stats) >= 10:
        features = user_stats[["post_count", "avg_seconds_between_posts", "avg_upvotes"]].fillna(0)
        iso = IsolationForest(contamination=0.09, random_state=42)
        user_stats["anomaly_label"] = iso.fit_predict(features)
        user_stats["anomaly_score"] = -iso.decision_function(features)

        anomalies = user_stats[user_stats["anomaly_label"] == -1].sort_values("anomaly_score", ascending=False)
        for _, row in anomalies.iterrows():
            cur.execute(
                "UPDATE users SET is_flagged_spam = TRUE, spam_score = %s WHERE user_id = %s::uuid",
                (float(row["anomaly_score"]), row["user_id"]),
            )
            flagged_accounts.append({
                "user_id": row["user_id"],
                "full_name": row["full_name"],
                "department": row["department"],
                "post_count": int(row["post_count"]),
                "anomaly_score": round(float(row["anomaly_score"]), 3),
            })
        conn.commit()

    cur.close()
    conn.close()
    return {"trending_topics": trending_topics, "flagged_spam_accounts": flagged_accounts}


# ==========================================
# F8: Grounded Research Assistant (RAG + Ollama)
# ==========================================
@app.post("/api/assistant/ask")
def ask_research_assistant(req: AskAssistantRequest):
    conn = get_conn()
    cur = conn.cursor()
    q_vec = vec_literal(req.question)

    filter_clause = "WHERE p.in_chanakya_library = TRUE" if req.library_only else ""
    cur.execute(
        f"""
        SELECT pc.chunk_id, pc.chunk_text, p.paper_id, p.canonical_title, p.publication_year,
               (1 - (pc.chunk_embedding <=> %s::vector)) AS similarity
        FROM paper_chunks pc
        JOIN papers p ON pc.paper_id = p.paper_id
        {filter_clause}
        ORDER BY pc.chunk_embedding <=> %s::vector
        LIMIT 4
        """,
        (q_vec, q_vec),
    )
    passages = cur.fetchall()
    cur.close()
    conn.close()

    if not passages:
        return {"answer": "No relevant passages found in the corpus.", "citations": []}

    context_blocks = []
    for idx, psg in enumerate(passages, start=1):
        context_blocks.append(f"[{idx}] {psg['canonical_title']} ({psg['publication_year']}): {psg['chunk_text']}")

    prompt = (
        "You are the Chanakya Research Commons Assistant. Answer the user's research question using ONLY the retrieved passages below. "
        "Cite sources inline using [1], [2], etc. If the passages do not contain the answer, state that clearly.\n\n"
        f"Retrieved Passages:\n" + "\n\n".join(context_blocks) + f"\n\nQuestion: {req.question}\nAnswer:"
    )

    try:
        resp = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
            timeout=60,
        )
        answer_text = resp.json().get("response", "Model returned an empty response.") if resp.status_code == 200 else f"Ollama error: {resp.status_code}"
    except Exception as exc:
        answer_text = f"Local LLM unavailable ({exc}). Showing top retrieved passages below."

    return {
        "question": req.question,
        "answer": answer_text,
        "citations": [
            {
                "ref_index": idx,
                "paper_id": str(psg["paper_id"]),
                "title": psg["canonical_title"],
                "year": psg["publication_year"],
                "passage": psg["chunk_text"],
                "similarity": round(float(psg["similarity"]), 3),
            }
            for idx, psg in enumerate(passages, start=1)
        ],
    }


# ==========================================
# F9: Institutional Analytics Dashboard (Star Schema)
# ==========================================
@app.get("/api/analytics/overview")
def analytics_overview(department: Optional[str] = None):
    conn = get_conn()
    cur = conn.cursor()

    # 1. Research activity by department & topic cluster
    dept_filter = "WHERE dm.department = %s" if department else ""
    params = (department,) if department else ()

    cur.execute(
        f"""
        SELECT dm.department, dt.parent_cluster, dt.topic_name,
               SUM(f.saves_count) AS total_saves,
               SUM(f.posts_count) AS total_posts,
               SUM(f.views_count) AS total_views
        FROM dw.fact_research_activity f
        JOIN dw.dim_member dm ON f.member_key = dm.member_key
        LEFT JOIN dw.dim_topic dt ON f.topic_key = dt.topic_key
        {dept_filter}
        GROUP BY dm.department, dt.parent_cluster, dt.topic_name
        ORDER BY total_saves DESC, total_views DESC
        LIMIT 25
        """,
        params,
    )
    topic_breakdown = cur.fetchall()

    # 2. Cross-department collaboration matrix
    cur.execute(
        """
        SELECT source_department, target_department, SUM(interaction_count) AS interactions
        FROM dw.fact_dept_collaboration
        GROUP BY source_department, target_department
        ORDER BY interactions DESC
        LIMIT 20
        """
    )
    collaboration = cur.fetchall()

    # 3. Monthly engagement trend
    cur.execute(
        """
        SELECT dd.year, dd.month, dd.month_name,
               SUM(f.saves_count) AS saves,
               SUM(f.posts_count) AS posts,
               SUM(f.views_count) AS views
        FROM dw.fact_research_activity f
        JOIN dw.dim_date dd ON f.date_key = dd.date_key
        GROUP BY dd.year, dd.month, dd.month_name
        ORDER BY dd.year, dd.month
        """
    )
    monthly_trends = cur.fetchall()

    cur.close()
    conn.close()
    return {
        "topic_breakdown": topic_breakdown,
        "cross_dept_collaboration": collaboration,
        "monthly_trends": monthly_trends,
    }


# ==========================================
# F9.2: Association Rule Mining & Researcher Archetypes
# ==========================================
@app.get("/api/analytics/topic-associations")
def topic_associations(
    school: Optional[str] = Query(None, description="Filter by school name (e.g. 'School of Technology & AI' or 'ALL')"),
    min_support: float = Query(0.04, ge=0.001, le=1.0, description="Minimum support threshold"),
    min_lift: float = Query(1.2, ge=0.1, description="Minimum lift threshold"),
):
    """
    Subgroup-Stratified FP-Growth & FP-Max mining over publication topic baskets.
    Extracts maximal thematic bundles (FP-Max) and high-lift association rules.
    """
    return get_topic_associations(school=school, min_support=min_support, min_lift=min_lift)


@app.get("/api/analytics/researcher-archetypes")
def researcher_archetypes(
    n_clusters: int = Query(4, ge=2, le=10, description="Number of researcher archetype clusters"),
):
    """
    Agglomerative Researcher Clustering (Ward linkage) on continuous metrics,
    evaluated with silhouette score and profiled with discretized trait association rules (FP-Growth).
    """
    return get_researcher_archetypes(n_clusters=n_clusters)
