"""Apply db/migrations/003_chanakya_schools.sql with psycopg2 (no psql needed) and print the result.

    python db/apply_schools_migration.py
"""
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
load_dotenv()

DB_URL = os.getenv("DATABASE_URL")

if not DB_URL:
    raise RuntimeError("DATABASE_URL is not set. Copy .env.example to .env and fill it in (see README, Environment Variables).")

SQL = Path(__file__).with_name("migrations") / "003_chanakya_schools.sql"


def main() -> None:
    conn = psycopg2.connect(DB_URL)
    try:
        cur = conn.cursor()
        cur.execute(SQL.read_text(encoding="utf-8"))
        conn.commit()
        cur.execute("SELECT department, COUNT(*) FROM users GROUP BY department ORDER BY department")
        print("Members per school:")
        for school, n in cur.fetchall():
            print(f"  {n:>3}  {school}")
        cur.execute(
            """
            SELECT s, COUNT(*) FROM papers, LATERAL unnest(topics) AS s
            WHERE s LIKE 'School of %' GROUP BY s ORDER BY s
            """
        )
        print("Papers per school:")
        for school, n in cur.fetchall():
            print(f"  {n:>3}  {school}")
        print("Done. Now run: python data_pipeline/run_dw_elt.py")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
