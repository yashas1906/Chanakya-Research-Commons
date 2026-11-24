"""
Spam-account detection (F7), shared by every caller so they all score members the same way:

  * data_pipeline/run_dw_elt.py         scheduled scan (raises spam_account alerts)
  * POST /api/analytics/run-spam-job    on-demand scan from the admin dashboard
  * evaluation/evaluate_all.py          PR-AUC / ROC-AUC and the threshold sweep

Model: Isolation Forest (150 trees, fixed seed) over three behavioural features per member:
  log(1 + post_count)                 how much they post
  log(1 + avg_seconds_between_posts)  burstiness; members with fewer than two posts get a neutral 999999
                                      (one post has no gap to measure, and 0 used to look like a bot)
  avg_upvotes                         how the community received their posts
Counts and gaps are log-scaled: on raw seconds a member who posts every few weeks looked as anomalous as
a bot posting every few minutes (PR-AUC 0.56 raw vs 0.81 log-scaled on the planted spam accounts).

The anomaly score is -decision_function (higher = more unusual). SPAM_THRESHOLD was chosen from the
evaluation sweep (evaluation/evaluation_results.json, F7 threshold_sweep) as the best-F1 cut-off.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

SPAM_THRESHOLD = 0.09
FEATURES = ["post_count", "avg_seconds_between_posts", "avg_upvotes"]

MEMBER_FEATURES_SQL = """
    SELECT
        u.user_id::text AS user_id,
        u.full_name,
        u.department,
        COUNT(DISTINCT p.post_id) AS post_count,
        CASE WHEN COUNT(p.post_id) < 2 THEN 999999
             ELSE EXTRACT(EPOCH FROM (MAX(p.created_at) - MIN(p.created_at))) / (COUNT(p.post_id) - 1)
        END AS avg_seconds_between_posts,
        COALESCE(AVG(p.upvote_count), 0) AS avg_upvotes,
        -- An admin cleared this member and they have not posted since: never re-flag automatically.
        (u.spam_cleared_at IS NOT NULL AND COALESCE(MAX(p.created_at) <= u.spam_cleared_at, TRUE)) AS cleared
    FROM users u
    LEFT JOIN posts p ON u.user_id = p.author_id
    GROUP BY u.user_id, u.full_name, u.department, u.spam_cleared_at
"""


def load_member_features(cur) -> pd.DataFrame:
    """Works with plain and RealDict cursors."""
    cur.execute(MEMBER_FEATURES_SQL)
    rows = cur.fetchall()
    columns = [d[0] for d in cur.description]
    df = pd.DataFrame(rows, columns=columns) if rows and not isinstance(rows[0], dict) else pd.DataFrame(rows)
    if df.empty:
        return pd.DataFrame(columns=columns)
    for col in FEATURES:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0).astype(float)
    df["cleared"] = df["cleared"].astype(bool)
    return df


def score_members(df: pd.DataFrame) -> np.ndarray:
    """Anomaly score per member (higher = more unusual). Needs at least 10 members to be meaningful."""
    if len(df) < 10:
        return np.zeros(len(df))
    X = np.column_stack([
        np.log1p(df["post_count"].to_numpy(dtype=float)),
        np.log1p(df["avg_seconds_between_posts"].to_numpy(dtype=float)),
        df["avg_upvotes"].to_numpy(dtype=float),
    ])
    iso = IsolationForest(n_estimators=150, random_state=42)
    iso.fit(X)
    return -iso.decision_function(X)


def members_to_flag(df: pd.DataFrame, scores: np.ndarray, threshold: float = SPAM_THRESHOLD) -> pd.DataFrame:
    """Members at or above the threshold, excluding those an admin has cleared."""
    out = df.assign(anomaly_score=scores)
    return out[(out["anomaly_score"] >= threshold) & (~out["cleared"])].sort_values("anomaly_score", ascending=False)
