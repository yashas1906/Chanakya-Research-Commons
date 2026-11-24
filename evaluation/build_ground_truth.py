"""
Rebuild evaluation/ground_truth.json from the database and the seed's planting rules.

Why: the original file was written once by seed_database.py, then the data moved on (improve_data.py,
entity resolution merged the planted duplicates, new ingestion). Rebuilding it from first principles keeps
the labels in step with the data without ever reading the detectors' own predictions.

Labels and where they come from
  duplicate_pairs   seed rule: a planted duplicate is an original paper re-titled as
                    title.replace(":", " -").replace(" and ", " & ") + " (Preprint)" with the same abstract.
                    Duplicates already merged are recovered from paper_merges (their titles are logged there);
                    the original is matched by the rule above, never by the detector's choice of canonical.
                    When two papers share the original title, the seed's own record (seed_labels.json) decides;
                    if there is none the pair is marked ambiguous and lists every candidate original.
  spam_user_ids     seed rule: members 24CU1055-24CU1059 (seed indexes 55-59) are the planted spam accounts.
  spike_topics      seed rule: three topics get a 5-day burst ending at the last seeded event (spike_anchor).
  benchmark_queries / rag_in_corpus / rag_out_of_corpus / author_variants
                    static question sets from seed_database.py, carried over unchanged.

Usage (repository root):  python evaluation/build_ground_truth.py
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")
if not DB_URL:
    raise RuntimeError("DATABASE_URL is not set. Copy .env.example to .env and fill it in (see README, Environment Variables).")

HERE = Path(__file__).resolve().parent
GT_PATH = HERE / "ground_truth.json"
SEED_LABELS_PATH = HERE / "seed_labels.json"

SPAM_UNIVERSITY_IDS = [f"24CU{1055 + i}" for i in range(5)]
SPIKE_TOPICS = ["graph neural networks", "CRISPR gene editing", "data privacy law"]
STATIC_KEYS = ["benchmark_queries", "rag_in_corpus", "rag_out_of_corpus", "author_variants"]


def planted_title(original: str) -> str:
    return original.replace(":", " -").replace(" and ", " & ") + " (Preprint)"


def main() -> int:
    previous = json.loads(GT_PATH.read_text(encoding="utf-8")) if GT_PATH.exists() else {}
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Every record that exists or existed: live papers plus merged-away duplicates (title from the merge log).
    cur.execute("SELECT paper_id::text, canonical_title, abstract FROM papers")
    live = {pid: (title, abstract) for pid, title, abstract in cur.fetchall()}
    cur.execute("SELECT duplicate_paper_id::text, canonical_paper_id::text, duplicate_title FROM paper_merges")
    merged = {d: (c, t) for d, c, t in cur.fetchall()}

    def resolve(pid: str) -> str:
        """Follow the merge log to the record that holds this paper today."""
        seen = set()
        while pid in merged and pid not in seen:
            seen.add(pid)
            pid = merged[pid][0]
        return pid

    titles: dict[str, list[str]] = {}
    for pid, (title, _) in live.items():
        titles.setdefault(title, []).append(pid)
    for pid, (_, title) in merged.items():
        titles.setdefault(title, []).append(pid)

    seed_original = {}
    if SEED_LABELS_PATH.exists():
        seed_original = {p["duplicate_id"]: p["original_id"] for p in json.loads(SEED_LABELS_PATH.read_text(encoding="utf-8"))["duplicate_pairs"]}

    duplicate_pairs = []
    candidates = [(pid, title) for pid, (title, _) in live.items()] + [(pid, t) for pid, (_, t) in merged.items()]
    for dup_id, dup_title in candidates:
        if not dup_title.endswith(" (Preprint)"):
            continue
        originals = [pid for title, ids in titles.items() for pid in ids if planted_title(title) == dup_title and pid != dup_id]
        if not originals:
            continue
        if dup_id in seed_original:
            originals, label_source = [seed_original[dup_id]], "seed_record"
        else:
            label_source = "title_rule"
        original_id = originals[0]
        original_live = resolve(original_id)
        duplicate_pairs.append({
            "duplicate_id": dup_id,
            "duplicate_title": dup_title,
            "original_id": original_id,
            # Every paper the duplicate could be a copy of (more than one only when titles collide).
            "original_ids": sorted(set(originals)),
            "ambiguous": len(set(originals)) > 1,
            "label_source": label_source,
            "original_title": live[original_live][0] if original_live in live else None,
            # The record that holds the original today (benchmarks re-inject the duplicate against it).
            "original_live_id": original_live,
            "duplicate_merged": dup_id in merged,
        })

    cur.execute("SELECT user_id::text FROM users WHERE university_id = ANY(%s)", (SPAM_UNIVERSITY_IDS,))
    spam_ids = sorted(r[0] for r in cur.fetchall())

    # The seed's last generated event closes the planted 5-day bursts; view events are only ever seeded.
    cur.execute("SELECT MAX(occurred_at) FROM activity_events WHERE event_type = 'view_paper'")
    spike_anchor = cur.fetchone()[0]
    cur.close()
    conn.close()

    gt = {
        "_generated": {
            "by": "evaluation/build_ground_truth.py",
            "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "note": "Labels come from the seed's planting rules, never from detector output.",
        },
        "duplicate_pairs": sorted(duplicate_pairs, key=lambda p: p["duplicate_title"]),
        "spam_user_ids": spam_ids,
        "spike_topics": SPIKE_TOPICS,
        "spike_anchor": spike_anchor.isoformat() if spike_anchor else None,
        **{k: previous.get(k, []) for k in STATIC_KEYS},
    }
    GT_PATH.write_text(json.dumps(gt, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"ground truth: {len(duplicate_pairs)} planted duplicate pairs ({sum(p['ambiguous'] for p in duplicate_pairs)} ambiguous), {len(spam_ids)} spam accounts, "
          f"spike anchor {gt['spike_anchor']}, {len(gt['benchmark_queries'])} benchmark queries -> {GT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
