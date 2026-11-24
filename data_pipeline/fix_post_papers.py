"""
Re-attach seeded discussion posts to papers that match their topics.

The original seed attached each synthetic "Thoughts on …" post to a random paper, so most of them
discussed a paper outside the post's own topics (e.g. a VLSI lab book tagged "signal processing").
This keeps every post's author, tags, votes and dates (the planted topic spikes depend on the tags)
and only changes which paper it is attached to, its title and body, and its embedding.

Planted spam posts ("URGENT: …") and posts written by real members are never touched.
Idempotent: a post whose tags already overlap its paper's topics is left alone.

    python -m data_pipeline.fix_post_papers           # dry run: report what would change
    python -m data_pipeline.fix_post_papers --apply   # write the changes
"""
from __future__ import annotations

import argparse
import os
import random
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="write the changes (default: dry run)")
    args = parser.parse_args()

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT p.post_id::text AS post_id, p.tags, u.department
        FROM posts p
        JOIN users u ON u.user_id = p.author_id
        JOIN papers pa ON pa.paper_id = p.attached_paper_id
        WHERE u.is_synthetic AND p.title LIKE 'Thoughts on %%'
          AND p.tags IS NOT NULL AND NOT (p.tags && pa.topics)
        ORDER BY p.post_id
        """
    )
    posts = cur.fetchall()
    cur.execute("SELECT paper_id::text AS paper_id, canonical_title, topics FROM papers WHERE abstract IS NOT NULL AND topics IS NOT NULL")
    papers = cur.fetchall()
    print(f"{len(posts)} seeded posts are attached to a paper outside their topics; {len(papers)} candidate papers.")

    updates = []
    unmatched = 0
    for post in posts:
        tags = post["tags"] or []
        candidates = [p for p in papers if set(p["topics"]) & set(tags)]
        if not candidates:
            unmatched += 1
            continue
        # Prefer papers from the author's own school, then pick deterministically per post.
        own_school = [p for p in candidates if post["department"] in p["topics"]]
        rng = random.Random(post["post_id"])
        paper = rng.choice(own_school or candidates)
        topic = next(t for t in tags if t in paper["topics"])
        title = f"Thoughts on {paper['canonical_title'][:75]}"
        body = f"Has anyone tested the approach in '{paper['canonical_title']}' for our {post['department']} work on {topic}?"
        updates.append((post["post_id"], paper["paper_id"], title, body))

    print(f"{len(updates)} can be re-attached to a matching paper; {unmatched} have no paper sharing a topic and stay as they are.")
    for post_id, _, title, _ in updates[:5]:
        print(f"  {post_id[:8]}… -> {title}")

    if not args.apply:
        print("Dry run only. Re-run with --apply to write these changes.")
        return
    if not updates:
        return

    from sentence_transformers import SentenceTransformer  # the same model the backend uses for post embeddings

    model = SentenceTransformer("all-MiniLM-L6-v2")
    vectors = model.encode([f"{title} {body}" for _, _, title, body in updates])
    rows = [
        (post_id, paper_id, title, body, "[" + ",".join(f"{x:.6f}" for x in vec.tolist()) + "]")
        for (post_id, paper_id, title, body), vec in zip(updates, vectors)
    ]
    psycopg2.extras.execute_values(
        cur,
        """
        UPDATE posts AS p
        SET attached_paper_id = v.paper_id::uuid, title = v.title, body = v.body, post_embedding = v.emb::vector
        FROM (VALUES %s) AS v(post_id, paper_id, title, body, emb)
        WHERE p.post_id = v.post_id::uuid
        """,
        rows,
    )
    conn.commit()
    print(f"Updated {cur.rowcount} posts.")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
