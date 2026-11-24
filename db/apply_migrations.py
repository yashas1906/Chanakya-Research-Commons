"""
Apply every SQL migration in db/migrations/ in filename order.

Each migration is written to be safe to run more than once, so this can be re-run after pulling
new code:  python db/apply_migrations.py
"""
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DATABASE_URL", "postgresql://crc_admin:crc_secure_pass@localhost:5434/chanakya_commons")
MIGRATIONS = Path(__file__).with_name("migrations")


def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    # Columns older databases may be missing (kept from the original runner).
    cur.execute("ALTER TABLE post_upvotes ADD COLUMN IF NOT EXISTS value SMALLINT NOT NULL DEFAULT 1;")
    cur.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS sources JSONB DEFAULT '[\"openalex\"]'::jsonb;")
    cur.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS arxiv_id VARCHAR(50);")
    cur.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS cited_by_count INTEGER DEFAULT 0;")
    conn.commit()
    for path in sorted(MIGRATIONS.glob("*.sql")):
        print(f"Applying {path.name} ...")
        cur.execute(path.read_text(encoding="utf-8"))
        conn.commit()
    cur.close()
    conn.close()
    print("Migrations applied successfully!")


if __name__ == "__main__":
    main()
