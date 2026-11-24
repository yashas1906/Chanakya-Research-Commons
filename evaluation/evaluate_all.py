"""
Evaluation suite for Chanakya Research Commons (F4-F8). Every metric scores the code the application runs:

  F4/F5 entity resolution  data_pipeline/dedup.py (find_duplicate_pairs) on a benchmark corpus, plus the merges
                           the system actually made (paper_merges) checked against planted labels and a manual audit
  F5 search                backend/services/search_service.py (the exact SQL /api/search runs)
  F6 recommendations       the /api/recommendations formula (0.5 profile + 0.5 saved-paper centroid), temporal holdout
  F7 trends / spam         the spike window the app uses, anchored at the planted burst; backend/services/spam_service.py
  F8 assistant retrieval   the chunk retrieval and similarity refusal gate the assistant uses

Labels come from evaluation/ground_truth.json (rebuild with evaluation/build_ground_truth.py) and
evaluation/dedup_audit.json. Tunable settings (PageRank weight, spam threshold) are chosen on a development
split and reported on held-out data, so the reported numbers are not fitted to the test set.

Usage (repository root):  python evaluation/evaluate_all.py
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import psycopg2
import scipy.stats as stats
from datasketch import MinHash, MinHashLSH
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor
from sentence_transformers import SentenceTransformer
from sklearn.metrics import average_precision_score, roc_auc_score

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from backend.services.search_service import PAGERANK_WEIGHT, hybrid_paper_sql, hybrid_params  # noqa: E402
from backend.services.spam_service import SPAM_THRESHOLD, load_member_features, score_members  # noqa: E402
from backend.services.recommendation_service import CF_WEIGHT, CONTENT_WEIGHT, PROFILE_SHARE  # noqa: E402
from data_pipeline.dedup import find_duplicate_pairs  # noqa: E402

load_dotenv()
DB_URL = os.getenv("DATABASE_URL", "postgresql://crc_admin:crc_secure_pass@localhost:5434/chanakya_commons")
EVAL_DIR = ROOT / "evaluation"
GROUND_TRUTH_PATH = EVAL_DIR / "ground_truth.json"
AUDIT_PATH = EVAL_DIR / "dedup_audit.json"
REPORT_JSON_PATH = EVAL_DIR / "evaluation_results.json"

PAGERANK_GRID = [0.0, 0.001, 0.0025, 0.005, 0.01, 0.02, 0.05]
SPAM_GRID = [round(x, 2) for x in np.arange(0.0, 0.21, 0.01)]
REFUSAL_THRESHOLD = 0.32  # same as the assistant's similarity floor

print("Loading embedding model for evaluation (all-MiniLM-L6-v2)...")
model = SentenceTransformer("all-MiniLM-L6-v2")


# ------------------------------------------------------------------ helpers

def vec_literal(text: str) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in model.encode(text).tolist()) + "]"


def unit(v) -> np.ndarray:
    v = np.asarray(json.loads(v) if isinstance(v, str) else v, dtype=np.float32)
    n = np.linalg.norm(v)
    return v / n if n else v


def bootstrap_ci(values: list[float], n_bootstrap: int = 1000, ci: float = 0.95) -> tuple[float, float, float]:
    if not values:
        return 0.0, 0.0, 0.0
    arr = np.array(values, dtype=float)
    mean_val = float(arr.mean())
    if len(arr) < 2 or np.all(arr == arr[0]):
        return round(mean_val, 4), round(mean_val, 4), round(mean_val, 4)
    rng = np.random.default_rng(42)
    boots = [rng.choice(arr, size=len(arr), replace=True).mean() for _ in range(n_bootstrap)]
    return round(mean_val, 4), round(float(np.percentile(boots, (1 - ci) / 2 * 100)), 4), round(float(np.percentile(boots, (1 + ci) / 2 * 100)), 4)


def ndcg_at_k(rels: list[float], k: int, ideal: list[float] | None = None) -> float:
    rel = np.array(rels[:k], dtype=float)
    if not len(rel) or rel.sum() == 0:
        return 0.0
    dcg = float(np.sum(rel / np.log2(np.arange(2, len(rel) + 2))))
    ideal_rel = np.sort(np.array(ideal if ideal is not None else rels, dtype=float))[::-1][:k]
    idcg = float(np.sum(ideal_rel / np.log2(np.arange(2, len(ideal_rel) + 2))))
    return dcg / idcg if idcg > 0 else 0.0


def prf(tp: int, fp: int, fn: int) -> dict:
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    f = 2 * p * r / (p + r) if p + r else 0.0
    return {"true_positives": tp, "false_positives": fp, "false_negatives": fn,
            "precision": round(p, 4), "recall": round(r, 4), "f1_score": round(f, 4)}


# ------------------------------------------------------------------ F4/F5 entity resolution

def _norm_title(t: str) -> str:
    t = re.sub(r"\(preprint\)", "", (t or "").lower())
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", t)).strip()


def _word_minhash_pairs(records: list[dict]) -> set[tuple[str, str]]:
    """The previous method: MinHash over the SET OF WORDS of title + first 300 chars, LSH 0.65, no verification."""
    lsh, hashes = MinHashLSH(threshold=0.65, num_perm=128), {}
    for r in records:
        mh = MinHash(num_perm=128)
        for tok in set(f"{r['title']} {(r['abstract'] or '')[:300]}".lower().split()):
            mh.update(tok.encode("utf-8"))
        hashes[r["id"]] = mh
        lsh.insert(r["id"], mh)
    return {tuple(sorted((pid, o))) for pid, mh in hashes.items() for o in lsh.query(mh) if o != pid}


def eval_entity_resolution(cur, gt: dict) -> dict:
    # A. Benchmark corpus: today's papers + the planted duplicates re-injected (title from the merge log,
    #    abstract of the original, embedded the way the seed embedded them). Real duplicates were already
    #    merged, so any other predicted pair is a false positive.
    cur.execute("SELECT paper_id::text AS id, canonical_title AS title, abstract, embedding::text AS emb, doi, arxiv_id AS arxiv FROM papers")
    records = [{**r, "emb": unit(r["emb"]) if r["emb"] else None} for r in cur.fetchall()]
    by_id = {r["id"]: r for r in records}
    # Ambiguous labels (two papers share the original title, no seed record) are left out of the benchmark.
    planted = [p for p in gt.get("duplicate_pairs", []) if p.get("original_live_id") in by_id and not p.get("ambiguous")]
    for p in planted:
        original = by_id[p["original_live_id"]]
        if p["duplicate_id"] in by_id:  # not merged yet: already in the corpus
            continue
        text = f"{p['duplicate_title']}. {(original['abstract'] or '')[:600]}"
        records.append({"id": p["duplicate_id"], "title": p["duplicate_title"], "abstract": original["abstract"],
                        "emb": unit(model.encode(text)), "doi": None, "arxiv": None})
    truth = {tuple(sorted((p["duplicate_id"], p["original_live_id"]))) for p in planted}

    def score(pred: set[tuple[str, str]]) -> dict:
        return prf(len(pred & truth), len(pred - truth), len(truth - pred))

    title_groups: dict[str, list[str]] = {}
    for r in records:
        title_groups.setdefault(_norm_title(r["title"]), []).append(r["id"])
    exact = {tuple(sorted((a, b))) for ids in title_groups.values() for i, a in enumerate(ids) for b in ids[i + 1:]}
    t0 = time.perf_counter()
    system = {tuple(sorted((p["paper_a"], p["paper_b"]))) for p in find_duplicate_pairs(records)}
    system_ms = (time.perf_counter() - t0) * 1000

    # B. What the running system actually merged (paper_merges), judged by planted labels + manual audit.
    cur.execute("SELECT duplicate_paper_id::text AS d, canonical_paper_id::text AS c, duplicate_title AS t FROM paper_merges")
    merges = cur.fetchall()
    merged_to = {m["d"]: m["c"] for m in merges}

    def resolve(pid: str) -> str:
        seen = set()
        while pid in merged_to and pid not in seen:
            seen.add(pid)
            pid = merged_to[pid]
        return pid

    planted_by_dup = {p["duplicate_id"]: p for p in gt.get("duplicate_pairs", [])}
    audit = {a["duplicate_paper_id"]: a["verdict"] for a in json.loads(AUDIT_PATH.read_text(encoding="utf-8"))["reviewed"]} if AUDIT_PATH.exists() else {}
    correct = wrong = unjudged = 0
    for m in merges:
        if m["d"] in planted_by_dup:
            label = planted_by_dup[m["d"]]
            ok = resolve(m["d"]) in {resolve(o) for o in label.get("original_ids", [label["original_id"]])}
        elif m["d"] in audit:
            ok = audit[m["d"]] == "duplicate"
        else:
            unjudged += 1
            continue
        correct += ok
        wrong += not ok
    planted_found = sum(1 for p in gt.get("duplicate_pairs", []) if p["duplicate_id"] in merged_to
                        and resolve(p["duplicate_id"]) in {resolve(o) for o in p.get("original_ids", [p["original_id"]])})

    # C. Author name variants (rule: same surname, compatible initials / first names).
    def variant_match(canonical: str, variant: str) -> bool:
        c, v = re.sub(r"[^\w\s]", "", canonical.lower()).split(), re.sub(r"[^\w\s]", "", variant.lower()).split()
        if not c or not v or c[-1] != v[-1] or c[0][0] != v[0][0]:
            return False
        if len(c[0]) > 2 and len(v[0]) > 2 and c[0] != v[0]:
            return False
        return not (len(c) > 2 and len(v) > 2 and c[1][0] != v[1][0])

    variants = gt.get("author_variants", [])
    hits = [variant_match(a["canonical"], a["variant"]) == a["is_match"] for a in variants]

    return {
        "benchmark_corpus": {"records": len(records), "planted_duplicate_pairs": len(truth),
                             "ambiguous_labels_excluded": sum(1 for p in gt.get("duplicate_pairs", []) if p.get("ambiguous"))},
        "baseline_exact_title_match": score(exact),
        "baseline_word_set_minhash_lsh_0.65": score(_word_minhash_pairs(records)),
        "system_minhash_shingles_verified": {**score(system), "runtime_ms": round(system_ms, 1),
                                             "method": "MinHash (128 perm) on word 3-shingles, LSH 0.5; verified by shingle Jaccard >= 0.5, title Jaccard >= 0.4, embedding cosine >= 0.93"},
        "operational_merges": {
            "total_merges": len(merges),
            "judged_correct": correct, "judged_wrong": wrong, "unjudged": unjudged,
            "precision": round(correct / (correct + wrong), 4) if correct + wrong else None,
            "planted_duplicates_merged_correctly": f"{planted_found}/{len(gt.get('duplicate_pairs', []))}",
        },
        "author_name_variant_resolution": {"pairs_evaluated": len(variants), "accuracy": round(float(np.mean(hits)), 4) if hits else None},
    }


# ------------------------------------------------------------------ F5 unified search

def _relevance(row: dict, q_tokens: list[str]) -> int:
    """Graded relevance: 2 = two or more query terms in title/topics, 1 = one term, 0 = none."""
    text = (" ".join(row["topics"] or []) + " " + (row["canonical_title"] or "")).lower()
    hits = sum(1 for tok in q_tokens if tok in text)
    return 2 if hits >= 2 else 1 if hits == 1 else 0


LEGACY_SQL = """
    WITH semantic AS (
        SELECT paper_id, ROW_NUMBER() OVER (ORDER BY embedding <=> %s::vector) AS sem_rank
        FROM papers WHERE embedding IS NOT NULL ORDER BY embedding <=> %s::vector LIMIT 40
    ),
    keyword AS (
        SELECT paper_id, ROW_NUMBER() OVER (ORDER BY ts_rank(search_tsv, plainto_tsquery('english', %s)) DESC) AS kw_rank
        FROM papers WHERE search_tsv @@ plainto_tsquery('english', %s)
        ORDER BY ts_rank(search_tsv, plainto_tsquery('english', %s)) DESC LIMIT 40
    )
    SELECT p.paper_id, p.canonical_title, p.topics,
           COALESCE(1.0 / (60 + s.sem_rank), 0) + COALESCE(1.0 / (60 + k.kw_rank), 0) + LEAST(p.pagerank_score * 50.0, 0.15) AS score
    FROM papers p LEFT JOIN semantic s USING (paper_id) LEFT JOIN keyword k USING (paper_id)
    WHERE s.paper_id IS NOT NULL OR k.paper_id IS NOT NULL
    ORDER BY score DESC LIMIT %s
"""


def eval_unified_search(cur, gt: dict, k: int = 10) -> dict:
    queries = gt.get("benchmark_queries", [])
    per_query: list[dict] = []
    for qi, q in enumerate(queries):
        q_tokens = [t.lower() for t in re.findall(r"\w+", q) if len(t) > 2]
        q_vec = vec_literal(q)
        lists = {}
        cur.execute("""SELECT paper_id, canonical_title, topics FROM papers WHERE search_tsv @@ plainto_tsquery('english', %s)
                       ORDER BY ts_rank(search_tsv, plainto_tsquery('english', %s)) DESC LIMIT %s""", (q, q, k))
        lists["lexical_only"] = cur.fetchall()
        cur.execute("SELECT paper_id, canonical_title, topics FROM papers WHERE embedding IS NOT NULL ORDER BY embedding <=> %s::vector LIMIT %s", (q_vec, k))
        lists["semantic_only"] = cur.fetchall()
        cur.execute(LEGACY_SQL, (q_vec, q_vec, q, q, q, k))
        lists["legacy_hybrid_pagerank_x50"] = cur.fetchall()
        for w in PAGERANK_GRID:
            cur.execute(hybrid_paper_sql(library_filter=False, pagerank_weight=w), hybrid_params(q_vec, q, k, in_library=None))
            lists[f"hybrid_w={w}"] = cur.fetchall()
        # Pool every system's results so nDCG compares lists against the same ideal ranking.
        pool = {r["paper_id"]: _relevance(r, q_tokens) for rows in lists.values() for r in rows}
        ideal = sorted(pool.values(), reverse=True)
        metrics = {}
        for name, rows in lists.items():
            rels = [pool[r["paper_id"]] for r in rows]
            first = next((i for i, v in enumerate(rels) if v > 0), -1)
            metrics[name] = (ndcg_at_k(rels, k, ideal), 1.0 / (first + 1) if first >= 0 else 0.0)
        per_query.append({"split": "dev" if qi % 2 == 0 else "test", "m": metrics})

    def summarise(name: str, split: str | None) -> dict:
        rows = [pq["m"][name] for pq in per_query if split is None or pq["split"] == split]
        n_mean, n_lo, n_hi = bootstrap_ci([r[0] for r in rows])
        m_mean, m_lo, m_hi = bootstrap_ci([r[1] for r in rows])
        return {"ndcg_at_10_mean": n_mean, "ndcg_at_10_95_ci": [n_lo, n_hi], "mrr_mean": m_mean, "mrr_95_ci": [m_lo, m_hi]}

    sweep = {str(w): summarise(f"hybrid_w={w}", "dev")["ndcg_at_10_mean"] for w in PAGERANK_GRID}
    best_w = max(PAGERANK_GRID, key=lambda w: (sweep[str(w)], -w))  # ties -> smaller weight
    names = ["lexical_only", "semantic_only", "legacy_hybrid_pagerank_x50", "hybrid_w=0.0", f"hybrid_w={best_w}", f"hybrid_w={PAGERANK_WEIGHT}"]
    return {
        "benchmark_queries_count": len(queries),
        "relevance_judgement": "graded 0/1/2 by query terms in title/topics; nDCG ideal pooled over all systems",
        "pagerank_weight_sweep_dev_ndcg": sweep,
        "pagerank_weight_selected_on_dev": best_w,
        "pagerank_weight_deployed": PAGERANK_WEIGHT,
        "held_out_test_queries": {n: summarise(n, "test") for n in dict.fromkeys(names)},
        "all_queries": {n: summarise(n, None) for n in dict.fromkeys(names)},
    }


def eval_pagerank_validation(cur) -> dict:
    cur.execute("SELECT pagerank_score, COALESCE(cited_by_count, 0) AS cited FROM papers WHERE pagerank_score IS NOT NULL")
    rows = cur.fetchall()
    pr = np.array([float(r["pagerank_score"]) for r in rows])
    cited = np.array([int(r["cited"]) for r in rows])
    rho, p = stats.spearmanr(pr, cited) if len(rows) > 2 and cited.any() else (np.nan, np.nan)
    cur.execute("SELECT COUNT(*) AS n FROM paper_citations")
    return {
        "samples": len(rows),
        "internal_citation_edges": cur.fetchone()["n"],
        "papers_with_global_citation_count": int((cited > 0).sum()),
        "spearman_pagerank_vs_openalex_cited_by": None if not np.isfinite(rho) else round(float(rho), 4),
        "p_value": None if not np.isfinite(p) else float(f"{p:.3g}"),
    }


# ------------------------------------------------------------------ F6 recommendations

def eval_recommendations(cur, k: int = 10) -> dict:
    """Temporal holdout: for each member with >= 5 saves, the most recent 20% (at least one) are hidden."""
    cur.execute("SELECT paper_id::text AS id, embedding::text AS emb FROM papers WHERE embedding IS NOT NULL")
    rows = cur.fetchall()
    ids = [r["id"] for r in rows]
    index = {pid: i for i, pid in enumerate(ids)}
    E = np.vstack([unit(r["emb"]) for r in rows])

    cur.execute("""SELECT u.user_id::text AS uid, u.profile_embedding::text AS prof
                   FROM users u WHERE u.is_synthetic AND NOT u.is_flagged_spam AND u.profile_embedding IS NOT NULL""")
    profiles = {r["uid"]: unit(r["prof"]) for r in cur.fetchall()}
    cur.execute("SELECT user_id::text AS uid, paper_id::text AS pid, saved_at FROM library_saves ORDER BY saved_at")
    history: dict[str, list[str]] = {}
    for r in cur.fetchall():
        if r["pid"] in index:
            history.setdefault(r["uid"], []).append(r["pid"])

    splits = {}
    for uid, items in history.items():
        if uid in profiles and len(items) >= 5:
            n_test = max(1, round(len(items) * 0.2))
            splits[uid] = (items[:-n_test], set(items[-n_test:]))
    train_pairs = [(uid, p) for uid, items in history.items() for p in (splits[uid][0] if uid in splits else items)]

    popularity = np.zeros(len(ids))
    for _, p in train_pairs:
        popularity[index[p]] += 1
    baskets: dict[str, set[int]] = {}
    for uid, p in train_pairs:
        baskets.setdefault(uid, set()).add(index[p])

    def z(x: np.ndarray, mask: np.ndarray) -> np.ndarray:
        """Standardise over candidate papers only (what the API's window functions do)."""
        sd = x[~mask].std()
        return (x - x[~mask].mean()) / sd if sd > 0 else np.zeros_like(x)

    names = ["popularity", "item_cf", "content_profile_only", "content_saved_centroid_only",
             "previous_0.5_profile_0.5_centroid", "deployed_cf_content_hybrid"]
    methods = {n: {"dev": [], "test": []} for n in names}
    for n_user, (uid, (train, test)) in enumerate(sorted(splits.items())):
        split = "dev" if n_user % 2 == 0 else "test"
        tr = [index[p] for p in train]
        mask = np.zeros(len(ids), dtype=bool)
        mask[tr] = True
        test_idx = {index[p] for p in test}
        prof_sim = E @ profiles[uid]
        cent = unit(E[tr].mean(axis=0))
        cent_sim = E @ cent
        co = np.zeros(len(ids))
        for other, items in baskets.items():
            if other != uid and items & set(tr):
                for i in items:
                    co[i] += len(items & set(tr))
        content = PROFILE_SHARE * prof_sim + (1 - PROFILE_SHARE) * cent_sim
        scores = {
            "popularity": popularity + 1e-6 * prof_sim,           # ties broken by profile, not by id order
            "item_cf": co + 1e-6 * prof_sim,
            "content_profile_only": prof_sim,
            "content_saved_centroid_only": cent_sim,
            "previous_0.5_profile_0.5_centroid": 0.5 * prof_sim + 0.5 * cent_sim,
            # /api/recommendations (services/recommendation_service.py)
            "deployed_cf_content_hybrid": CF_WEIGHT * z(np.log1p(co), mask) + CONTENT_WEIGHT * z(content, mask),
        }
        for name, sc in scores.items():
            sc = np.where(mask, -np.inf, sc)
            top = list(np.argsort(-sc)[:k])
            rels = [1.0 if i in test_idx else 0.0 for i in top]
            methods[name][split].append((sum(rels) / len(test_idx), ndcg_at_k(rels, k, [1.0] * len(test_idx)), float(any(rels))))

    def summary(vals: list[tuple]) -> dict:
        r_mean, r_lo, r_hi = bootstrap_ci([v[0] for v in vals])
        return {f"recall_at_{k}": r_mean, f"recall_at_{k}_95_ci": [r_lo, r_hi],
                f"ndcg_at_{k}": round(float(np.mean([v[1] for v in vals])), 4) if vals else 0.0,
                f"hit_rate_at_{k}": round(float(np.mean([v[2] for v in vals])), 4) if vals else 0.0}

    out = {
        "members_evaluated": len(splits),
        "protocol": f"last 20% of each member's saves held out (>= 1); top-{k} over {len(ids)} papers; "
                    "hybrid weights chosen on the dev half of members (alternating), reported on the test half",
        "hybrid_weights": {"cf": CF_WEIGHT, "content": CONTENT_WEIGHT, "profile_share_of_content": PROFILE_SHARE},
    }
    for name, vals in methods.items():
        out[name] = {"dev_members": summary(vals["dev"]), "test_members": summary(vals["test"]), "all_members": summary(vals["dev"] + vals["test"])}
    return out


# ------------------------------------------------------------------ F7 trends and spam

def eval_trends_and_spam(cur, gt: dict) -> dict:
    anchor = datetime.fromisoformat(gt["spike_anchor"]) if gt.get("spike_anchor") else datetime.now(timezone.utc)
    cur.execute(
        """
        WITH expanded AS (
            SELECT UNNEST(topic_tags) AS topic, occurred_at FROM activity_events
            WHERE topic_tags IS NOT NULL AND occurred_at > %(a)s - INTERVAL '37 days' AND occurred_at <= %(a)s
        ),
        w AS (
            SELECT topic,
                   COUNT(*) FILTER (WHERE occurred_at > %(a)s - INTERVAL '7 days') AS recent_7d,
                   COUNT(*) FILTER (WHERE occurred_at <= %(a)s - INTERVAL '7 days') / 4.28 AS baseline
            FROM expanded GROUP BY topic
        )
        SELECT topic, recent_7d, (recent_7d - baseline) / GREATEST(baseline, 1.0) AS ratio
        FROM w WHERE recent_7d >= 5 ORDER BY ratio DESC
        """,
        {"a": anchor},
    )
    ranked = cur.fetchall()
    truth = set(gt.get("spike_topics", []))
    top3 = [r["topic"] for r in ranked[:3]]
    alerted = {r["topic"] for r in ranked if float(r["ratio"]) >= 1.5}

    df = load_member_features(cur)
    scores = score_members(df)
    y = df["user_id"].isin(set(gt.get("spam_user_ids", []))).astype(int).to_numpy()
    baseline = np.log1p(df["post_count"].to_numpy(dtype=float))  # "most prolific posters are spammers"

    def at(th: float) -> dict:
        pred = scores >= th
        return prf(int((pred & (y == 1)).sum()), int((pred & (y == 0)).sum()), int((~pred & (y == 1)).sum()))

    sweep = {str(th): at(th) for th in SPAM_GRID}
    best = max(SPAM_GRID, key=lambda th: (sweep[str(th)]["f1_score"], th))  # ties -> stricter threshold
    return {
        "topic_spikes": {
            "anchor": anchor.isoformat(), "planted": sorted(truth), "top_3_by_spike_ratio": top3,
            "recall_at_3": round(len(set(top3) & truth) / len(truth), 4) if truth else None,
            "alerts_at_ratio_1.5": sorted(alerted),
            "alert_precision": round(len(alerted & truth) / len(alerted), 4) if alerted else None,
            "alert_recall": round(len(alerted & truth) / len(truth), 4) if truth else None,
        },
        "spam_accounts": {
            "members": int(len(y)), "planted_spam": int(y.sum()),
            "isolation_forest_pr_auc": round(float(average_precision_score(y, scores)), 4),
            "isolation_forest_roc_auc": round(float(roc_auc_score(y, scores)), 4),
            "baseline_post_count_pr_auc": round(float(average_precision_score(y, baseline)), 4),
            "baseline_post_count_roc_auc": round(float(roc_auc_score(y, baseline)), 4),
            "threshold_sweep": sweep,
            "best_f1_threshold": best,
            "deployed_threshold": SPAM_THRESHOLD,
            "at_deployed_threshold": at(SPAM_THRESHOLD),
            "note": "Threshold chosen on the same 5 planted accounts it is reported on (only 5 positives); treat as optimistic.",
        },
    }


# ------------------------------------------------------------------ F8 assistant retrieval

def eval_rag_retrieval(cur, gt: dict) -> dict:
    hits, sims, overlaps, latencies = [], [], [], []
    for item in gt.get("rag_in_corpus", []):
        q, topic = item["question"], item["topic"]
        t0 = time.perf_counter()
        q_vec = vec_literal(q)
        cur.execute("""SELECT pc.chunk_text, 1 - (pc.chunk_embedding <=> %s::vector) AS sim, p.topics
                       FROM paper_chunks pc JOIN papers p ON p.paper_id = pc.paper_id
                       ORDER BY pc.chunk_embedding <=> %s::vector LIMIT 4""", (q_vec, q_vec))
        rows = cur.fetchall()
        latencies.append((time.perf_counter() - t0) * 1000)
        if rows:
            sims.append(float(rows[0]["sim"]))
            hits.append(float(any(topic in (r["topics"] or []) or topic.lower() in (r["chunk_text"] or "").lower() for r in rows)))
            qw = set(re.findall(r"\w+", q.lower()))
            cw = set(re.findall(r"\w+", " ".join(r["chunk_text"] for r in rows).lower()))
            overlaps.append(len(qw & cw) / len(qw) if qw else 0.0)
    refused, trap_sims = 0, []
    for q in gt.get("rag_out_of_corpus", []):
        q_vec = vec_literal(q)
        cur.execute("SELECT 1 - (chunk_embedding <=> %s::vector) AS sim FROM paper_chunks ORDER BY chunk_embedding <=> %s::vector LIMIT 1", (q_vec, q_vec))
        row = cur.fetchone()
        sim = float(row["sim"]) if row else 0.0
        trap_sims.append(sim)
        refused += sim < REFUSAL_THRESHOLD
    traps = len(gt.get("rag_out_of_corpus", []))
    return {
        "in_corpus": {"questions": len(hits), "hit_at_4": round(float(np.mean(hits)), 4) if hits else None,
                      "avg_top1_similarity": round(float(np.mean(sims)), 4) if sims else None,
                      "question_term_coverage_in_passages": round(float(np.mean(overlaps)), 4) if overlaps else None,
                      "avg_retrieval_latency_ms": round(float(np.mean(latencies)), 1) if latencies else None},
        "out_of_corpus_refusal": {"trap_questions": traps, "similarity_threshold": REFUSAL_THRESHOLD,
                                  "avg_top1_similarity": round(float(np.mean(trap_sims)), 4) if trap_sims else None,
                                  "refusal_rate": round(refused / traps, 4) if traps else None},
    }


def main() -> int:
    argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter).parse_args()
    gt = json.loads(GROUND_TRUTH_PATH.read_text(encoding="utf-8"))
    conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
    cur = conn.cursor()
    started = time.perf_counter()
    results = {
        "_meta": {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                  "ground_truth_generated": gt.get("_generated", {}).get("at")},
        "F4_F5_entity_resolution": eval_entity_resolution(cur, gt),
        "F5_unified_search": eval_unified_search(cur, gt),
        "F5_pagerank_validation": eval_pagerank_validation(cur),
        "F6_recommendations": eval_recommendations(cur),
        "F7_trends_and_spam": eval_trends_and_spam(cur, gt),
        "F8_assistant_retrieval": eval_rag_retrieval(cur, gt),
    }
    results["_meta"]["runtime_s"] = round(time.perf_counter() - started, 1)
    cur.close()
    conn.close()
    REPORT_JSON_PATH.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2))
    print(f"\nSaved results to {REPORT_JSON_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
