"""
Simple Python scheduler for the F4 refresh (no cron needed, works the same on Windows and Linux).

Every cycle it runs, in order:
  1. ingest.py        next batch from OpenAlex, arXiv and the RSS feeds (incremental, cursors in ingestion_state)
  2. entity resolution merges any new duplicates (part of ingest.py)
  2b. enrich_citations.py  OpenAlex citation counts and reference edges (scholarly cycles only)
  3. run_dw_elt.py    PageRank, star schema refresh, trend/spike alerts, analytical views

RSS feeds change hourly, scholarly sources slowly, so RSS runs every cycle and the scholarly sources
every --scholarly-every cycles.

Usage (repository root):
    python data_pipeline/scheduler.py --once                  # one full cycle, then exit (use from cron / Task Scheduler)
    python data_pipeline/scheduler.py --interval-hours 6      # keep running, one cycle every 6 hours
    docker compose --profile scheduler up -d scheduler        # same, as a container

Cron equivalent of --interval-hours 6 (Linux):
    0 */6 * * *  cd /path/to/Chanakya-Research-Commons && .venv/bin/python data_pipeline/scheduler.py --once
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _run(args: list[str]) -> bool:
    print(f"[scheduler] $ {' '.join(args)}", flush=True)
    result = subprocess.run([sys.executable, *args], cwd=ROOT)
    if result.returncode != 0:
        print(f"[scheduler] step failed with exit code {result.returncode}", flush=True)
    return result.returncode == 0


def cycle(index: int, scholarly_every: int, per_topic: int) -> None:
    started = datetime.now()
    sources = "openalex,arxiv,rss" if index % scholarly_every == 0 else "rss"
    print(f"[scheduler] cycle {index} started {started:%Y-%m-%d %H:%M} (sources: {sources})", flush=True)
    if _run(["data_pipeline/ingest.py", "--sources", sources, "--per-topic", str(per_topic)]):
        if "openalex" in sources:
            _run(["data_pipeline/enrich_citations.py"])  # global citation counts + new citation edges
        _run(["data_pipeline/run_dw_elt.py"])
    print(f"[scheduler] cycle {index} finished in {datetime.now() - started}", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--once", action="store_true", help="run one cycle and exit")
    ap.add_argument("--interval-hours", type=float, default=6.0, help="hours between cycles (default 6)")
    ap.add_argument("--scholarly-every", type=int, default=4, help="fetch OpenAlex/arXiv every N cycles (default 4 = daily at 6 h)")
    ap.add_argument("--per-topic", type=int, default=10, help="items per topic per scholarly batch")
    args = ap.parse_args()

    if args.once:
        cycle(0, 1, args.per_topic)
        return 0

    index = 0
    while True:
        cycle(index, max(1, args.scholarly_every), args.per_topic)
        index += 1
        next_run = datetime.now() + timedelta(hours=args.interval_hours)
        print(f"[scheduler] next cycle at {next_run:%Y-%m-%d %H:%M}", flush=True)
        time.sleep(args.interval_hours * 3600)


if __name__ == "__main__":
    raise SystemExit(main())
