"""One command to bring an existing Chanakya Research Commons database up to date.

    python db/update_database.py                 # uses DATABASE_URL or the default local URL
    python db/update_database.py --update-emails # also make emails first.last@chanakyauniversity.edu.in
    python db/update_database.py --skip-data     # schema/school migrations only (keeps names/comments as-is)

What it does, in order (every step is safe to re-run):
  1. column migrations   (post_upvotes.value, papers.sources/arxiv_id, posts.edited_at, indexes)
  2. six-school migration (db/migrations/003_chanakya_schools.sql)
  3. member names, ~2000 varied comments, ~500 votes, vote totals (data_pipeline/improve_data.py)
  4. analytics warehouse rebuild (data_pipeline/run_dw_elt.py)
  5. a short report so you can see the result (no more "Member 12 (Electronics)")

Restart the backend and the frontend afterwards.
"""
import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

import psycopg2

ROOT = Path(__file__).resolve().parent.parent
from dotenv import load_dotenv
load_dotenv()
DB_URL = os.getenv("DATABASE_URL")
if not DB_URL:
    raise RuntimeError("DATABASE_URL is not set. Copy .env.example to .env and fill it in (see README, Environment Variables).")


def step(title: str) -> None:
    print(f"\n=== {title} ===")


def run_script(*args: str) -> None:
    env = {**os.environ, "DATABASE_URL": DB_URL}
    subprocess.run([sys.executable, *args], cwd=ROOT, env=env, check=True)


def apply_sql_file(path: Path) -> None:
    conn = psycopg2.connect(DB_URL)
    try:
        cur = conn.cursor()
        cur.execute(path.read_text(encoding="utf-8"))
        conn.commit()
        print(f"applied {path.name}")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def report() -> None:
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute("SELECT full_name, role, department FROM users ORDER BY created_at LIMIT 6")
    print("Sample members:")
    for name, role, dept in cur.fetchall():
        print(f"  {name:<28} {role:<10} {dept}")
    cur.execute("SELECT COUNT(*) FROM users WHERE full_name ~ '^Member [0-9]+'")
    leftover = cur.fetchone()[0]
    print(f"Members still named 'Member N': {leftover}")
    cur.execute("SELECT COUNT(*), COUNT(DISTINCT body) FROM comments")
    total, distinct = cur.fetchone()
    print(f"Comments: {total} ({distinct} distinct bodies)")
    cur.execute("SELECT COUNT(*) FROM post_upvotes")
    print(f"Votes in ledger: {cur.fetchone()[0]}")
    cur.execute("SELECT department, COUNT(*) FROM users GROUP BY department ORDER BY department")
    print("Members per school:")
    for dept, n in cur.fetchall():
        print(f"  {n:>3}  {dept}")
    try:
        cur.execute("SELECT department, COUNT(*) FROM dw.dim_member GROUP BY department ORDER BY department")
        print("Warehouse members per school:")
        for dept, n in cur.fetchall():
            print(f"  {n:>3}  {dept}")
    except Exception as exc:  # warehouse not built yet
        conn.rollback()
        print(f"(warehouse check skipped: {exc})")
    conn.close()
    if leftover:
        print("\nWARNING: some members are still named 'Member N' - only the 60 seeded accounts (is_synthetic) are renamed.")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--update-emails", action="store_true")
    ap.add_argument("--skip-data", action="store_true", help="skip names/comments/votes (step 3)")
    ap.add_argument("--skip-warehouse", action="store_true", help="skip the warehouse rebuild (step 4)")
    args = ap.parse_args()

    safe_url = re.sub(r"://[^@]*@", "://***@", DB_URL)
    print(f"Database: {safe_url}")

    step("1/5 Column migrations")
    run_script("db/apply_migrations.py")
    apply_sql_file(ROOT / "db" / "migrations" / "004_post_edits.sql")

    step("2/5 Six-school migration")
    run_script("db/apply_schools_migration.py")

    if args.skip_data:
        step("3/5 Names, comments, votes (skipped)")
    else:
        step("3/5 Names, comments, votes")
        run_script("data_pipeline/improve_data.py", *(["--update-emails"] if args.update_emails else []))

    if args.skip_warehouse:
        step("4/5 Warehouse (skipped)")
    else:
        step("4/5 Analytics warehouse")
        run_script("data_pipeline/run_dw_elt.py")

    step("5/5 Result")
    report()
    print("\nAll done. Restart the backend (uvicorn) and the frontend (npm run dev), then hard-refresh the browser.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
