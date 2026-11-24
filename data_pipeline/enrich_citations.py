"""
Citation enrichment from OpenAlex (F5 ranking / PageRank).

For every paper with an OpenAlex source it fetches, 50 works per request:
  * cited_by_count     global citation count (an external signal used to validate our PageRank)
  * referenced_works   reference list; edges to papers we also hold are added to paper_citations
Raw responses are archived unchanged in MinIO like every other ingestion step.

Usage (repository root):  python data_pipeline/enrich_citations.py
Then recompute PageRank:   python data_pipeline/run_dw_elt.py   (the scheduler runs both)
"""
from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone

import psycopg2
import requests
from psycopg2.extras import execute_values
from dotenv import load_dotenv

try:
    from data_pipeline.ingest import RawArchive, USER_AGENT
except ImportError:
    from ingest import RawArchive, USER_AGENT

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")
if not DB_URL:
    raise RuntimeError("DATABASE_URL is not set. Copy .env.example to .env and fill it in (see README, Environment Variables).")

BATCH = 50


def main() -> int:
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS cited_by_count INTEGER DEFAULT 0")
    cur.execute(
        """
        SELECT external_id, paper_id::text FROM paper_sources
        WHERE source_name = 'openalex' AND external_id LIKE 'https://openalex.org/W%%'
        """
    )
    oa_to_paper = dict(cur.fetchall())
    # Only well-formed work ids: the seed's planted duplicates carry synthetic ids such as W123_dup,
    # and one invalid id makes OpenAlex reject the whole batch.
    ids = sorted(x for x in oa_to_paper if re.fullmatch(r"https://openalex\.org/W\d+", x))
    archive = RawArchive()
    counts, edges, fetched = [], set(), 0
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")

    for i in range(0, len(ids), BATCH):
        chunk = ids[i:i + BATCH]
        short = "|".join(x.rsplit("/", 1)[-1] for x in chunk)
        url = f"https://api.openalex.org/works?filter=openalex:{short}&per_page={BATCH}&select=id,cited_by_count,referenced_works"
        try:
            resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
        except requests.RequestException as exc:
            print(f"  batch {i // BATCH}: {exc}")
            continue
        if resp.status_code != 200:
            print(f"  batch {i // BATCH}: HTTP {resp.status_code}")
            continue
        archive.put(f"openalex_citations/{stamp}/batch_{i // BATCH:03d}.json", resp.content, "application/json")
        for work in resp.json().get("results", []):
            pid = oa_to_paper.get(work.get("id"))
            if not pid:
                continue
            fetched += 1
            counts.append((int(work.get("cited_by_count") or 0), pid))
            for ref in work.get("referenced_works") or []:
                cited = oa_to_paper.get(ref)
                if cited and cited != pid:
                    edges.add((pid, cited))
        time.sleep(0.2)  # polite pacing

    if counts:
        execute_values(cur, "UPDATE papers AS p SET cited_by_count = v.c FROM (VALUES %s) AS v(c, id) WHERE p.paper_id = v.id::uuid", counts)
    before = 0
    cur.execute("SELECT COUNT(*) FROM paper_citations")
    before = cur.fetchone()[0]
    if edges:
        execute_values(cur, "INSERT INTO paper_citations (citing_paper_id, cited_paper_id) VALUES %s ON CONFLICT DO NOTHING",
                       list(edges), template="(%s::uuid, %s::uuid)")
    cur.execute("SELECT COUNT(*) FROM paper_citations")
    after = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    print(json.dumps({"openalex_works": len(ids), "fetched": fetched, "cited_by_count_updated": len(counts),
                      "internal_edges_seen": len(edges), "citation_edges_before": before, "citation_edges_after": after}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
