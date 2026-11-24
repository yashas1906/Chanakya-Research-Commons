import os
import time
from typing import List, Dict, Any, Optional
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import IsolationForest
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DATABASE_URL")

if not DB_URL:
    raise RuntimeError("DATABASE_URL is not set. Copy .env.example to .env and fill it in (see README, Environment Variables).")


def get_conn():
    return psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)


class CRCAnomalyService:
    """
    Isolation Forest Anomaly Detection Service for Chanakya Research Commons.
    Supports both sub-5ms in-memory live scoring for submission gatekeeping/drift
    and batch multidimensional outlier detection on warehouse views.
    """

    def __init__(self, contamination: float = 0.08, random_state: int = 42):
        self.contamination = contamination
        self.random_state = random_state
        self.scaler = StandardScaler()
        self.model = IsolationForest(
            n_estimators=150,
            contamination=self.contamination,
            random_state=self.random_state,
            n_jobs=-1
        )
        self.is_fitted: bool = False
        self.feature_cols: List[str] = []
        self.baseline_medians: Dict[str, float] = {}
        self.baseline_stds: Dict[str, float] = {}
        self.training_sample_size: int = 0

    def fit(self, df: pd.DataFrame, feature_cols: List[str]) -> bool:
        """
        Fits scaler and Isolation Forest on baseline historical records.
        Only activates live scoring if len(df) >= 20; otherwise logs passively without blocking.
        """
        if df is None or len(df) < 20:
            count = 0 if df is None else len(df)
            print(f"[CRCAnomalyService] Baseline records below threshold ({count} < 20). Deferring active live scoring.")
            self.is_fitted = False
            return False

        self.feature_cols = feature_cols
        X = df[feature_cols].fillna(0.0).astype(float)

        try:
            X_scaled = self.scaler.fit_transform(X)
            self.model.fit(X_scaled)
            self.is_fitted = True
            self.training_sample_size = len(df)

            # Store baseline medians and stds for context
            for col in feature_cols:
                self.baseline_medians[col] = float(df[col].median())
                self.baseline_stds[col] = float(df[col].std()) if df[col].std() > 0 else 1.0

            print(f"[CRCAnomalyService] Successfully fitted Isolation Forest on {len(df)} baseline records across {len(feature_cols)} features.")
            return True
        except Exception as exc:
            print(f"[CRCAnomalyService] Error fitting Isolation Forest: {exc}")
            self.is_fitted = False
            return False

    def score_live_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """
        Scores a single incoming payload in-memory (<5ms) during FastAPI requests.
        Returns:
            {
                "is_anomaly": bool,
                "anomaly_score": float,
                "severity": "HIGH" | "MEDIUM" | "NORMAL",
                "metrics": dict
            }
        Inverts decision_function so higher positive values indicate stronger outliers.
        """
        t0 = time.perf_counter()

        if not self.is_fitted or not self.feature_cols:
            # Fallback heuristic if baseline is not fitted yet
            abs_len = record.get("abstract_length", 500)
            coauthors = record.get("coauthor_count", 2)
            keywords = record.get("keyword_count", 2)
            is_suspicious = abs_len < 50 or abs_len > 10000 or coauthors > 40 or keywords > 25
            elapsed_ms = (time.perf_counter() - t0) * 1000

            return {
                "is_anomaly": is_suspicious,
                "anomaly_score": 0.25 if is_suspicious else 0.0,
                "severity": "HIGH" if is_suspicious else "NORMAL",
                "inference_time_ms": round(elapsed_ms, 2),
                "model_status": "passive_heuristic_mode",
                "metrics": {k: record.get(k, 0.0) for k in ["coauthor_count", "keyword_count", "abstract_length", "reference_count", "submissions_last_24h"] if k in record}
            }

        # Vectorize incoming record matching feature_cols
        row = [float(record.get(col, self.baseline_medians.get(col, 0.0))) for col in self.feature_cols]
        X = np.array([row])

        X_scaled = self.scaler.transform(X)
        pred = int(self.model.predict(X_scaled)[0])  # -1 = anomaly, 1 = normal

        # Invert decision function: raw is negative for anomalies, positive for normal
        raw_score = float(self.model.decision_function(X_scaled)[0])
        inverted_score = -raw_score

        # Severity categorization based on inverted score distribution
        if inverted_score >= 0.18 or (pred == -1 and inverted_score >= 0.14):
            severity = "HIGH"
            is_anomaly = True
        elif inverted_score >= 0.06 or pred == -1:
            severity = "MEDIUM"
            is_anomaly = True
        else:
            severity = "NORMAL"
            is_anomaly = False

        elapsed_ms = (time.perf_counter() - t0) * 1000

        return {
            "is_anomaly": is_anomaly,
            "anomaly_score": round(inverted_score, 4),
            "severity": severity,
            "inference_time_ms": round(elapsed_ms, 2),
            "model_status": "active_isolation_forest",
            "metrics": {col: record.get(col, 0.0) for col in self.feature_cols}
        }

    def detect_batch_anomalies(
        self,
        df: pd.DataFrame,
        feature_cols: List[str],
        id_col: str,
        classify_impact: bool = False
    ) -> Dict[str, Any]:
        """
        Runs batch outlier detection on data warehouse views or publication records.
        When classify_impact=True, compares each outlier's citation/pagerank metrics
        against cohort medians to separate:
          - "HIGH_IMPACT_SPOTLIGHT": positive breakout performers (high citations/PageRank)
          - "INTEGRITY_REVIEW": suspicious behavioral or submission anomalies requiring moderation review.
        """
        if df is None or len(df) < 5:
            return {
                "total_analyzed": 0 if df is None else len(df),
                "total_anomalies": 0,
                "impact_spotlights": [],
                "integrity_alerts": []
            }

        df_work = df.copy()
        for col in feature_cols:
            df_work[col] = pd.to_numeric(df_work[col], errors="coerce").fillna(0.0)

        # Standardize features
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(df_work[feature_cols])

        # Batch Isolation Forest
        iso = IsolationForest(
            n_estimators=150,
            contamination=self.contamination,
            random_state=self.random_state,
            n_jobs=-1
        )
        labels = iso.fit_predict(X_scaled)
        inverted_scores = -iso.decision_function(X_scaled)

        df_work["is_anomaly"] = labels == -1
        df_work["anomaly_score"] = [round(float(s), 4) for s in inverted_scores]

        # Calculate cohort statistics for impact classification
        med_citations = float(df_work["total_citations"].median()) if "total_citations" in df_work.columns else 0.0
        med_pagerank = float(df_work["avg_pagerank"].median()) if "avg_pagerank" in df_work.columns else 0.0
        med_pubs = float(df_work["total_publications"].median()) if "total_publications" in df_work.columns else 0.0

        outliers = df_work[df_work["is_anomaly"] == True].sort_values("anomaly_score", ascending=False)

        impact_spotlights: List[Dict[str, Any]] = []
        integrity_alerts: List[Dict[str, Any]] = []

        for _, row in outliers.iterrows():
            item_id = str(row.get(id_col, ""))
            score = float(row.get("anomaly_score", 0.0))

            item_data = {
                "id": item_id,
                "name": str(row.get("researcher_name", row.get("full_name", row.get("title", item_id)))),
                "department": str(row.get("department", row.get("school_name", "General"))),
                "role": str(row.get("role", "researcher")),
                "anomaly_score": score,
                "severity": "HIGH" if score >= 0.16 else "MEDIUM",
                "metrics": {c: round(float(row.get(c, 0.0)), 3) for c in feature_cols}
            }

            if classify_impact:
                cites = float(row.get("total_citations", 0.0))
                pr = float(row.get("avg_pagerank", 0.0))
                pubs = float(row.get("total_publications", 0.0))

                # Positive breakout criteria: citation or PageRank authority substantially above median
                is_high_impact = (cites > max(med_citations * 1.4, 2.0)) or (pr > max(med_pagerank * 1.3, 0.0015)) or (pubs >= med_pubs * 2.0 and cites >= med_citations)

                if is_high_impact:
                    item_data["classification"] = "HIGH_IMPACT_SPOTLIGHT"
                    item_data["impact_summary"] = (
                        f"Citation authority ({cites:.0f} citations, PageRank {pr:.4f}) "
                        f"exceeds cohort median by {((cites - med_citations) / max(med_citations, 1.0) * 100):.0f}%."
                    )
                    impact_spotlights.append(item_data)
                else:
                    item_data["classification"] = "INTEGRITY_REVIEW"
                    item_data["integrity_reason"] = (
                        f"Statistical outlier with non-standard ratio: low citation yield relative to coauthorship or volume."
                    )
                    integrity_alerts.append(item_data)
            else:
                integrity_alerts.append(item_data)

        # If no spotlight was separated, elevate top high-scoring outlier with positive traits
        if classify_impact and not impact_spotlights and len(integrity_alerts) > 0:
            top_candidate = max(integrity_alerts, key=lambda x: x["metrics"].get("total_citations", 0.0))
            if top_candidate["metrics"].get("total_citations", 0.0) > 0:
                integrity_alerts.remove(top_candidate)
                top_candidate["classification"] = "HIGH_IMPACT_SPOTLIGHT"
                top_candidate["impact_summary"] = "High metric variance showing notable research momentum."
                impact_spotlights.append(top_candidate)

        return {
            "total_analyzed": len(df_work),
            "total_anomalies": len(outliers),
            "impact_spotlights": impact_spotlights,
            "integrity_alerts": integrity_alerts,
            "cohort_medians": {
                "citations": med_citations,
                "pagerank": round(med_pagerank, 5),
                "publications": med_pubs
            }
        }


# Global singleton instances for FastAPI
submission_detector = CRCAnomalyService(contamination=0.08)
query_drift_guard = CRCAnomalyService(contamination=0.05)


def warmup_submission_detector() -> bool:
    """
    Startup warmup helper: extracts publication features from database and fits submission_detector.
    """
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT 
                p.paper_id::text AS paper_id,
                COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(p.authors) = 'array' THEN p.authors ELSE '[]'::jsonb END), 1) AS coauthor_count,
                COALESCE(CARDINALITY(p.topics), 1) AS keyword_count,
                LENGTH(COALESCE(p.abstract, '')) AS abstract_length,
                COALESCE((SELECT COUNT(*) FROM paper_citations WHERE citing_paper_id = p.paper_id), 0) AS reference_count,
                1 AS submissions_last_24h
            FROM papers p
            LIMIT 1000
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        if rows and len(rows) >= 20:
            df = pd.DataFrame(rows)
            feature_cols = ["coauthor_count", "keyword_count", "abstract_length", "reference_count", "submissions_last_24h"]
            return submission_detector.fit(df, feature_cols)
        else:
            print("[CRCAnomalyService] Insufficient publication records for warmup (<20).")
            return False
    except Exception as exc:
        print(f"[CRCAnomalyService] Warmup database connection notice: {exc}")
        return False
