import os
import io
import json
import uuid
import random
from datetime import datetime, timedelta, timezone
import requests
import psycopg2
from psycopg2.extras import execute_values
from minio import Minio
from sentence_transformers import SentenceTransformer
from datasketch import MinHash
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DATABASE_URL", "postgresql://crc_admin:crc_secure_pass@localhost:5432/chanakya_commons")
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ROOT_USER", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin_pass")
RAW_BUCKET = "raw-ingestion"

DEPARTMENTS = {
    "Computer Science & AI": ["large language models", "graph neural networks", "data mining", "computer vision"],
    "Electronics & Communication": ["wireless sensor networks", "VLSI design", "embedded systems", "signal processing"],
    "Biotechnology": ["CRISPR gene editing", "bioinformatics", "protein folding", "synthetic biology"],
    "Management & Commerce": ["supply chain analytics", "fintech adoption", "sustainable finance", "consumer behavior"],
    "School of Law": ["artificial intelligence regulation", "data privacy law", "intellectual property", "cyber law"],
    "Liberal Arts & Humanities": ["digital humanities", "cognitive psychology", "public policy", "media studies"],
}

print("Loading embedding model (all-MiniLM-L6-v2)...")
model = SentenceTransformer("all-MiniLM-L6-v2")


def get_minio_client() -> Minio:
    client = Minio(
        MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=False,
    )
    if not client.bucket_exists(RAW_BUCKET):
        client.make_bucket(RAW_BUCKET)
    return client


def compute_minhash(text: str) -> bytes:
    mh = MinHash(num_perm=128)
    for token in set(text.lower().split()):
        mh.update(token.encode("utf-8"))
    return mh.hashvalues.tobytes()


def reconstruct_abstract(inverted_index: dict) -> str:
    if not inverted_index:
        return ""
    words = {}
    for word, positions in inverted_index.items():
        for pos in positions:
            words[pos] = word
    return " ".join(words[i] for i in sorted(words.keys()))


def fetch_openalex_papers(minio_client: Minio, per_topic: int = 30) -> list[dict]:
    papers = []
    seen_ids = set()
    print("Fetching real papers from OpenAlex API and archiving raw JSON to MinIO...")

    headers = {"User-Agent": "mailto:research-commons@chanakyauniversity.edu.in"}

    for dept, topics in DEPARTMENTS.items():
        for topic in topics:
            url = (
                f"https://api.openalex.org/works"
                f"?search={requests.utils.quote(topic)}"
                f"&filter=has_abstract:true,publication_year:>2021"
                f"&per_page={per_topic}"
            )
            try:
                resp = requests.get(url, headers=headers, timeout=20)
                if resp.status_code != 200:
                    print(f"Warning: OpenAlex returned {resp.status_code} for '{topic}'")
                    continue
                payload = resp.json()
            except Exception as exc:
                print(f"Warning: Failed fetching '{topic}': {exc}")
                continue

            # Save untouched raw batch response to MinIO data lake (F4)
            raw_bytes = json.dumps(payload, indent=2).encode("utf-8")
            batch_key = f"openalex/{topic.replace(' ', '_')}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.json"
            minio_client.put_object(
                RAW_BUCKET,
                batch_key,
                data=io.BytesIO(raw_bytes),
                length=len(raw_bytes),
                content_type="application/json",
            )

            for item in payload.get("results", []):
                oa_id = item.get("id")
                if not oa_id or oa_id in seen_ids:
                    continue
                abstract = reconstruct_abstract(item.get("abstract_inverted_index"))
                title = (item.get("title") or "").strip()
                if len(abstract) < 80 or not title:
                    continue

                seen_ids.add(oa_id)
                authors = [
                    {"name": a["author"]["display_name"]}
                    for a in item.get("authorships", [])[:5]
                    if a.get("author") and a["author"].get("display_name")
                ]
                doi_raw = item.get("doi") or ""
                doi = doi_raw.replace("https://doi.org/", "").strip() or None

                papers.append({
                    "paper_id": str(uuid.uuid4()),
                    "oa_id": oa_id,
                    "doi": doi,
                    "title": title,
                    "abstract": abstract[:2500],
                    "authors": authors,
                    "year": item.get("publication_year") or 2024,
                    "venue": ((item.get("primary_location") or {}).get("source") or {}).get("display_name") or "OpenAlex",
                    "topics": [topic, dept],
                    "referenced_works": item.get("referenced_works", []),
                    "raw_minio_path": f"{RAW_BUCKET}/{batch_key}",
                })

    print(f"Fetched {len(papers)} unique papers with abstracts.")
    return papers


def main():
    minio_client = get_minio_client()
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # 1. Fetch Papers & Plant 30 Near-Duplicates for Ground Truth
    raw_papers = fetch_openalex_papers(minio_client, per_topic=30)
    if not raw_papers:
        raise RuntimeError("No papers fetched from OpenAlex. Check internet connection and retry.")

    ground_truth = {
        "duplicate_pairs": [],
        "spam_user_ids": [],
        "spike_topics": ["graph neural networks", "CRISPR gene editing", "data privacy law"],
    }

    all_papers = list(raw_papers)
    duplicate_candidates = random.sample(raw_papers, min(30, len(raw_papers)))
    for orig in duplicate_candidates:
        dup_id = str(uuid.uuid4())
        mutated_title = orig["title"].replace(":", " -").replace(" and ", " & ") + " (Preprint)"
        all_papers.append({
            **orig,
            "paper_id": dup_id,
            "oa_id": orig["oa_id"] + "_dup",
            "doi": None,
            "title": mutated_title,
        })
        ground_truth["duplicate_pairs"].append({
            "original_id": orig["paper_id"],
            "duplicate_id": dup_id,
            "original_title": orig["title"],
            "duplicate_title": mutated_title,
        })

    print(f"Computing embeddings for {len(all_papers)} total papers (including 30 planted duplicates)...")
    paper_texts = [f"{p['title']}. {p['abstract'][:600]}" for p in all_papers]
    paper_embeddings = model.encode(paper_texts, show_progress_bar=True)

    oa_to_uuid = {p["oa_id"]: p["paper_id"] for p in all_papers}

    paper_rows = []
    source_rows = []
    chunk_rows = []
    seen_dois = set()

    for p, emb in zip(all_papers, paper_embeddings):
        doi_val = p["doi"]
        if doi_val and doi_val in seen_dois:
            doi_val = None
        if doi_val:
            seen_dois.add(doi_val)

        mh_bytes = compute_minhash(p["title"] + " " + p["abstract"][:300])
        emb_list = emb.tolist()

        paper_rows.append((
            p["paper_id"],
            doi_val,
            p["title"],
            p["abstract"],
            json.dumps(p["authors"]),
            p["year"],
            p["venue"],
            p["topics"],
            psycopg2.Binary(mh_bytes),
            emb_list,
        ))
        source_rows.append((
            str(uuid.uuid4()),
            p["paper_id"],
            "openalex",
            p["oa_id"],
            p["oa_id"],
            p["raw_minio_path"],
        ))

        # Split abstract into 2 chunks for F8 Research Assistant citations
        mid = len(p["abstract"]) // 2
        for idx, chunk_txt in enumerate([p["abstract"][:mid], p["abstract"][mid:]]):
            chunk_txt = chunk_txt.strip()
            if chunk_txt:
                chunk_rows.append((str(uuid.uuid4()), p["paper_id"], idx, chunk_txt, emb_list))

    execute_values(
        cur,
        """
        INSERT INTO papers (paper_id, doi, canonical_title, abstract, authors, publication_year, venue, topics, minhash_signature, embedding)
        VALUES %s ON CONFLICT DO NOTHING
        """,
        paper_rows,
    )

    execute_values(
        cur,
        """
        INSERT INTO paper_sources (source_id, paper_id, source_name, external_id, source_url, raw_minio_path)
        VALUES %s ON CONFLICT DO NOTHING
        """,
        source_rows,
    )

    execute_values(
        cur,
        """
        INSERT INTO paper_chunks (chunk_id, paper_id, chunk_index, chunk_text, chunk_embedding)
        VALUES %s
        """,
        chunk_rows,
    )

    # Citation edges within fetched corpus
    citation_rows = []
    for p in all_papers:
        for ref in p["referenced_works"]:
            if ref in oa_to_uuid and oa_to_uuid[ref] != p["paper_id"]:
                citation_rows.append((p["paper_id"], oa_to_uuid[ref]))
    if citation_rows:
        execute_values(
            cur,
            "INSERT INTO paper_citations (citing_paper_id, cited_paper_id) VALUES %s ON CONFLICT DO NOTHING",
            citation_rows,
        )

    # 2. Generate 60 Synthetic Members (55 normal + 5 planted spam accounts)
    print("Generating 60 synthetic Chanakya University members...")
    users = []
    dept_list = list(DEPARTMENTS.keys())
    for i in range(60):
        uid = str(uuid.uuid4())
        is_spam = i >= 55
        dept = dept_list[i % len(dept_list)]
        role = "admin" if i == 0 else ("faculty" if i % 8 == 0 else ("researcher" if i % 5 == 0 else "student"))
        tags = random.sample(DEPARTMENTS[dept], 2)
        bio = f"{role.title()} in {dept} working on {', '.join(tags)} at Chanakya University."
        users.append({
            "user_id": uid,
            "university_id": f"24CU{1000 + i}",
            "full_name": f"Member {i + 1} ({dept.split()[0]})",
            "email": f"member{i + 1}@chanakyauniversity.edu.in",
            "role": role,
            "department": dept,
            "bio": bio,
            "tags": tags,
            "is_spam": is_spam,
        })
        if is_spam:
            ground_truth["spam_user_ids"].append(uid)

    user_bios = [u["bio"] for u in users]
    user_embeddings = model.encode(user_bios)

    execute_values(
        cur,
        """
        INSERT INTO users (user_id, university_id, full_name, email, password_hash, role, department, bio, interest_tags, profile_embedding, is_synthetic)
        VALUES %s
        """,
        [
            (
                u["user_id"],
                u["university_id"],
                u["full_name"],
                u["email"],
                "hashed_demo_pass",
                u["role"],
                u["department"],
                u["bio"],
                u["tags"],
                emb.tolist(),
                True,
            )
            for u, emb in zip(users, user_embeddings)
        ],
    )

    # Follow graph (F1)
    follow_rows = []
    topic_follow_rows = []
    for u in users:
        same_dept = [other["user_id"] for other in users if other["department"] == u["department"] and other["user_id"] != u["user_id"]]
        cross_dept = [other["user_id"] for other in users if other["department"] != u["department"]]
        targets = random.sample(same_dept, min(4, len(same_dept))) + random.sample(cross_dept, min(2, len(cross_dept)))
        for tid in targets:
            follow_rows.append((u["user_id"], tid))
        for tag in u["tags"]:
            topic_follow_rows.append((u["user_id"], tag))

    execute_values(cur, "INSERT INTO user_follows (follower_id, followee_id) VALUES %s ON CONFLICT DO NOTHING", follow_rows)
    execute_values(cur, "INSERT INTO topic_follows (user_id, topic_tag) VALUES %s ON CONFLICT DO NOTHING", topic_follow_rows)

    # 3. Generate Collections, Library Saves, Posts, Comments, and 6-Month Activity Logs
    print("Generating library saves, posts, comments, and 10,000+ interaction events...")
    now = datetime.now(timezone.utc)
    collection_rows = []
    save_rows = []
    event_rows = []

    for u in users:
        col_id = str(uuid.uuid4())
        collection_rows.append((col_id, u["user_id"], f"{u['tags'][0].title()} Core Reading", "Key papers for literature review"))
        dept_papers = [p for p in raw_papers if u["department"] in p["topics"]] or raw_papers
        chosen_saves = random.sample(dept_papers, min(12, len(dept_papers)))
        for p in chosen_saves:
            ts = now - timedelta(days=random.randint(1, 180))
            save_rows.append((
                str(uuid.uuid4()),
                u["user_id"],
                p["paper_id"],
                col_id,
                f"Important baseline for {u['tags'][0]}",
                ts,
            ))
            event_rows.append((u["user_id"], "save_paper", p["paper_id"], None, p["topics"], ts))

    execute_values(cur, "INSERT INTO collections (collection_id, user_id, name, description) VALUES %s", collection_rows)
    execute_values(
        cur,
        """
        INSERT INTO library_saves (save_id, user_id, paper_id, collection_id, private_notes, saved_at)
        VALUES %s ON CONFLICT DO NOTHING
        """,
        save_rows,
    )

    cur.execute("""
        UPDATE papers p
        SET save_count = sub.cnt, in_chanakya_library = TRUE
        FROM (SELECT paper_id, COUNT(*) AS cnt FROM library_saves GROUP BY paper_id) sub
        WHERE p.paper_id = sub.paper_id
    """)

    # 600 posts (120 burst posts from 5 spam accounts + 480 normal research posts)
    post_items = []
    for idx in range(600):
        u = random.choice(users[-5:]) if idx < 120 else random.choice(users[:-5])
        p = random.choice(raw_papers)
        pid = str(uuid.uuid4())
        if u["is_spam"]:
            ts = now - timedelta(minutes=random.randint(1, 120))
            title = f"URGENT: Best assignment & crypto returns link #{idx}"
            body = "Click here now for guaranteed results! Repeated promo link."
        else:
            ts = now - timedelta(days=random.randint(1, 180))
            title = f"Thoughts on {p['title'][:75]}"
            body = f"Has anyone tested the approach in '{p['title']}' for our {u['department']} work on {u['tags'][0]}?"

        post_items.append({
            "post_id": pid,
            "author_id": u["user_id"],
            "paper_id": p["paper_id"],
            "title": title,
            "body": body,
            "tags": u["tags"],
            "upvotes": random.randint(0, 30) if not u["is_spam"] else 0,
            "created_at": ts,
        })
        event_rows.append((u["user_id"], "create_post", pid, None, u["tags"], ts))

    post_embeddings = model.encode([f"{pt['title']} {pt['body']}" for pt in post_items])
    execute_values(
        cur,
        """
        INSERT INTO posts (post_id, author_id, attached_paper_id, title, body, tags, upvote_count, post_embedding, created_at)
        VALUES %s
        """,
        [
            (
                pt["post_id"],
                pt["author_id"],
                pt["paper_id"],
                pt["title"],
                pt["body"],
                pt["tags"],
                pt["upvotes"],
                emb.tolist(),
                pt["created_at"],
            )
            for pt, emb in zip(post_items, post_embeddings)
        ],
    )

    # 2,000 comments
    comment_rows = []
    normal_post_ids = [pt["post_id"] for pt in post_items[120:]]
    for _ in range(2000):
        u = random.choice(users[:-5])
        pid = random.choice(normal_post_ids)
        ts = now - timedelta(days=random.randint(0, 179))
        comment_rows.append((
            str(uuid.uuid4()),
            pid,
            u["user_id"],
            "Great find! We should benchmark this baseline in our next research group sync.",
            ts,
        ))
    execute_values(cur, "INSERT INTO comments (comment_id, post_id, author_id, body, created_at) VALUES %s", comment_rows)

    # 10,500 views & searches (with planted topic spikes in the last 5 days for F7)
    for _ in range(10500):
        u = random.choice(users[:-5])
        is_recent_spike = random.random() < 0.16
        if is_recent_spike:
            ts = now - timedelta(days=random.randint(0, 5))
            topic = random.choice(ground_truth["spike_topics"])
        else:
            ts = now - timedelta(days=random.randint(6, 180))
            topic = random.choice(u["tags"])

        etype = random.choice(["view_paper", "search"])
        target = random.choice(raw_papers)["paper_id"] if etype == "view_paper" else None
        q = topic if etype == "search" else None
        event_rows.append((u["user_id"], etype, target, q, [topic], ts))

    execute_values(
        cur,
        """
        INSERT INTO activity_events (user_id, event_type, target_id, search_query, topic_tags, occurred_at)
        VALUES %s
        """,
        event_rows,
    )

    os.makedirs("evaluation", exist_ok=True)
    with open("evaluation/ground_truth.json", "w", encoding="utf-8") as f:
        json.dump(ground_truth, f, indent=2)

    conn.commit()
    cur.close()
    conn.close()
    print("Database seeded successfully! Ground truth written to evaluation/ground_truth.json.")


if __name__ == "__main__":
    main()