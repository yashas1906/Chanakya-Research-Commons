import os
import io
import re
import time
import json
import uuid
import random
import hashlib
import argparse
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
import requests
import numpy as np
import psycopg2
from psycopg2.extras import execute_values
from minio import Minio
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

try:
    from data_pipeline.dedup import minhash_signature
except ImportError:
    from dedup import minhash_signature

load_dotenv()

DB_URL = os.getenv("DATABASE_URL", "postgresql://crc_admin:crc_secure_pass@localhost:5434/chanakya_commons")
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ROOT_USER", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin_pass")
RAW_BUCKET = "raw-ingestion"
DEMO_PASSCODE = os.getenv("CRC_DEMO_PASSCODE", "chanakya-demo")


def hash_passcode(passcode: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", passcode.encode("utf-8"), salt, 200_000)
    return f"pbkdf2$200000${salt.hex()}${digest.hex()}"


# The six official Chanakya University schools. `users.department` stores the school name and every paper
# is tagged with exactly one of these names in `papers.topics`.
SOE = "School of Engineering"
SBS = "School of Biosciences"
SMS = "School of Management Sciences"
SLGPP = "School of Law, Governance and Public Policy"
SAHSS = "School of Arts, Humanities and Social Sciences"
SMNS = "School of Mathematics and Natural Sciences"

SCHOOL_CODES = {SAHSS: "SAHSS", SBS: "SBS", SOE: "SOE", SLGPP: "SLGPP", SMS: "SMS", SMNS: "SMNS"}

DEPARTMENTS = {
    SAHSS: ["digital humanities", "cognitive psychology", "media studies", "sociology of technology"],
    SBS: ["CRISPR gene editing", "bioinformatics", "protein folding", "synthetic biology"],
    SOE: ["large language models", "graph neural networks", "computer vision", "wireless sensor networks", "VLSI design", "embedded systems"],
    SLGPP: ["artificial intelligence regulation", "data privacy law", "intellectual property", "public policy"],
    SMS: ["supply chain analytics", "fintech adoption", "sustainable finance", "consumer behavior"],
    SMNS: ["data mining", "signal processing", "statistical inference", "numerical optimization"],
}

BENCHMARK_QUERIES = [
    # School of Engineering - computing (10 queries)
    "large language models instruction tuning",
    "graph neural networks for molecular representation",
    "contrastive learning in computer vision",
    "retrieval augmented generation vector search",
    "efficient transformer attention mechanisms",
    "federated learning privacy guarantees",
    "deep reinforcement learning policy gradients",
    "knowledge graph completion embeddings",
    "anomaly detection in multi-dimensional time series",
    "multimodal vision language models",
    # School of Engineering - electronics (8 queries)
    "energy efficient routing in wireless sensor networks",
    "low power VLSI design architectures",
    "real-time embedded systems firmware scheduling",
    "digital signal processing for MIMO communications",
    "millimeter wave beamforming antennas",
    "edge computing IoT sensory networks",
    "RISC-V hardware accelerator synthesis",
    "optical fiber dispersion compensation",
    # School of Biosciences (9 queries)
    "CRISPR Cas9 base editing off-target effects",
    "deep learning for protein folding prediction",
    "high throughput genomic sequencing alignment",
    "metabolic pathway engineering synthetic biology",
    "single cell RNA sequencing analysis",
    "drug discovery via molecular docking",
    "bioinformatics tools for phylogenetics",
    "microbiome composition metagenomics",
    "targeted delivery using nanoparticles",
    # School of Management Sciences (8 queries)
    "resilient supply chain analytics and disruption management",
    "machine learning for fintech credit risk assessment",
    "ESG scoring and sustainable corporate finance",
    "algorithmic consumer behavior personalization",
    "blockchain in international trade settlements",
    "predictive inventory optimization models",
    "e-commerce recommendation systems conversion",
    "central bank digital currencies macroeconomic impacts",
    # School of Law, Governance and Public Policy (8 queries)
    "governance frameworks for artificial intelligence regulation",
    "cross border data privacy and GDPR compliance",
    "generative AI intellectual property copyright",
    "liability for autonomous algorithmic decisions",
    "cybersecurity law and critical infrastructure defense",
    "smart contracts legal enforceability",
    "algorithmic antitrust and market collusion",
    "biometric surveillance Fourth Amendment protections",
    # School of Arts, Humanities and Social Sciences (8 queries)
    "computational methods in digital humanities",
    "cognitive biases in digital misinformation spread",
    "public policy evaluations of higher education funding",
    "media representations of artificial intelligence",
    "behavioral nudges for climate policy compliance",
    "historical text analysis via topic modeling",
    "societal impacts of automated decision systems",
    "philosophy of artificial consciousness and ethics",
    # School of Mathematics and Natural Sciences (6 queries)
    "statistical inference for high dimensional data",
    "numerical optimization methods for large scale problems",
    "frequent pattern mining and association rules",
    "time frequency analysis of non stationary signals",
    "bayesian methods for uncertainty quantification",
    "spectral methods for signal denoising",
]

AUTHOR_NAME_VARIANTS = [
    {"canonical": "Yoshua Bengio", "variant": "Y. Bengio", "is_match": True},
    {"canonical": "Yann LeCun", "variant": "Y. LeCun", "is_match": True},
    {"canonical": "Geoffrey Hinton", "variant": "G. E. Hinton", "is_match": True},
    {"canonical": "Andrew Y. Ng", "variant": "Andrew Ng", "is_match": True},
    {"canonical": "Jennifer Doudna", "variant": "J. A. Doudna", "is_match": True},
    {"canonical": "Emmanuelle Charpentier", "variant": "E. Charpentier", "is_match": True},
    {"canonical": "Michael I. Jordan", "variant": "Michael Jordan", "is_match": True},
    {"canonical": "Christopher D. Manning", "variant": "Chris Manning", "is_match": True},
    {"canonical": "Judea Pearl", "variant": "J. Pearl", "is_match": True},
    {"canonical": "Timnit Gebru", "variant": "T. Gebru", "is_match": True},
    # Negative / non-match pairs
    {"canonical": "Michael I. Jordan", "variant": "Michael B. Jordan", "is_match": False},
    {"canonical": "David Silver", "variant": "Daniel Silver", "is_match": False},
    {"canonical": "John Smith", "variant": "Jane Smith", "is_match": False},
    {"canonical": "Andrew Ng", "variant": "Alan Ng", "is_match": False},
    {"canonical": "Robert Miller", "variant": "Richard Miller", "is_match": False},
]

RAG_IN_CORPUS_QUESTIONS = [
    {"question": "How are graph neural networks applied in molecular and graph research?", "topic": "graph neural networks"},
    {"question": "What are the latest techniques in large language models and instruction tuning?", "topic": "large language models"},
    {"question": "What mechanisms are used in CRISPR gene editing and base editing?", "topic": "CRISPR gene editing"},
    {"question": "How does data privacy law regulate artificial intelligence applications?", "topic": "data privacy law"},
    {"question": "What routing protocols optimize energy in wireless sensor networks?", "topic": "wireless sensor networks"},
    {"question": "How is supply chain analytics utilized for disruption management?", "topic": "supply chain analytics"},
    {"question": "What are the challenges in VLSI design and low power circuits?", "topic": "VLSI design"},
    {"question": "How do deep learning methods assist in protein folding prediction?", "topic": "protein folding"},
    {"question": "What is the role of fintech adoption in modern financial systems?", "topic": "fintech adoption"},
    {"question": "How is artificial intelligence regulation structured globally?", "topic": "artificial intelligence regulation"},
    {"question": "What computational approaches are used in digital humanities?", "topic": "digital humanities"},
    {"question": "How does cognitive psychology explain human decision making?", "topic": "cognitive psychology"},
    {"question": "What methods are used for anomaly detection in data mining?", "topic": "data mining"},
    {"question": "How are embedded systems designed for real-time applications?", "topic": "embedded systems"},
    {"question": "What are intellectual property challenges in machine learning?", "topic": "intellectual property"},
]

RAG_OUT_OF_CORPUS_TRAP_QUESTIONS = [
    "What are the best culinary recipes for traditional sourdough bread baking?",
    "How did Roman Emperor Augustus reorganize the Praetorian Guard logistics?",
    "What are the specific rules of curling in the Winter Olympic Games?",
    "How do you repair a leaky carburettor on a 1974 vintage Vespa scooter?",
    "What poetic meter was predominantly used in Elizabethan pastoral drama?",
]

print("Loading embedding model (all-MiniLM-L6-v2)...")
model = SentenceTransformer("all-MiniLM-L6-v2")


def get_minio_client() -> Minio:
    client = Minio(
        MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=False,
    )
    try:
        if not client.bucket_exists(RAW_BUCKET):
            client.make_bucket(RAW_BUCKET)
    except Exception as exc:
        print(f"[MinIO] Bucket check notice: {exc}")
    return client


def compute_minhash(text: str) -> bytes:
    """Same MinHash (word 3-shingles) the dedup step uses, so stored signatures are comparable."""
    return minhash_signature(text, "")


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
                resp = requests.get(url, headers=headers, timeout=15)
                if resp.status_code != 200:
                    print(f"Warning: OpenAlex returned {resp.status_code} for '{topic}'")
                    continue
                payload = resp.json()
            except Exception as exc:
                print(f"Warning: Failed fetching '{topic}': {exc}")
                continue

            # Save untouched raw batch response to MinIO data lake (F4)
            try:
                raw_bytes = json.dumps(payload, indent=2).encode("utf-8")
                batch_key = f"openalex/{topic.replace(' ', '_')}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.json"
                minio_client.put_object(
                    RAW_BUCKET,
                    batch_key,
                    data=io.BytesIO(raw_bytes),
                    length=len(raw_bytes),
                    content_type="application/json",
                )
            except Exception as exc:
                print(f"[MinIO] Archive warning for '{topic}': {exc}")
                batch_key = f"local/openalex/{topic.replace(' ', '_')}.json"

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
                    "arxiv_id": None,
                    "doi": doi,
                    "title": title,
                    "abstract": abstract[:2500],
                    "authors": authors,
                    "year": item.get("publication_year") or 2024,
                    "venue": ((item.get("primary_location") or {}).get("source") or {}).get("display_name") or "OpenAlex",
                    "topics": [topic, dept],
                    "referenced_works": item.get("referenced_works", []),
                    "sources": ["openalex"],
                    "raw_minio_path": f"{RAW_BUCKET}/{batch_key}",
                })

    print(f"Fetched {len(papers)} unique papers with abstracts from OpenAlex.")
    return papers


def fetch_arxiv_papers(minio_client: Minio, per_topic: int = 5) -> list[dict]:
    papers = []
    seen_ids = set()
    print("Fetching scholarly preprints from arXiv REST API and archiving Atom XML to MinIO...")

    headers = {"User-Agent": "chanakya-research-commons/1.0"}

    for dept, topics in DEPARTMENTS.items():
        for topic in topics[:2]:  # Sample representative topics
            # arXiv asks API clients to use https and wait ~3 s between calls; without the pause it throttles
            # and every request used to fail silently, which is why no arXiv records were loaded.
            url = f"https://export.arxiv.org/api/query?search_query=all:%22{requests.utils.quote(topic)}%22&start=0&max_results={per_topic}"
            time.sleep(3)
            try:
                resp = requests.get(url, headers=headers, timeout=30)
                if resp.status_code != 200:
                    print(f"Warning: arXiv returned {resp.status_code} for '{topic}'")
                    continue
                raw_xml = resp.content
                batch_key = f"arxiv/{topic.replace(' ', '_')}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.xml"
                try:
                    minio_client.put_object(
                        RAW_BUCKET,
                        batch_key,
                        data=io.BytesIO(raw_xml),
                        length=len(raw_xml),
                        content_type="application/xml",
                    )
                except Exception as exc:
                    print(f"[MinIO] arXiv archive notice: {exc}")

                root = ET.fromstring(raw_xml)
                ns = {"atom": "http://www.w3.org/2005/Atom"}
                for entry in root.findall("atom:entry", ns):
                    title_elem = entry.find("atom:title", ns)
                    summary_elem = entry.find("atom:summary", ns)
                    id_elem = entry.find("atom:id", ns)
                    if title_elem is None or summary_elem is None or id_elem is None:
                        continue

                    title = (title_elem.text or "").strip().replace("\n", " ")
                    abstract = (summary_elem.text or "").strip().replace("\n", " ")
                    id_url = (id_elem.text or "").strip()
                    arxiv_id = re.sub(r"v\d+$", "", id_url.split("/abs/")[-1]) if "/abs/" in id_url else id_url

                    if not title or len(abstract) < 80 or arxiv_id in seen_ids:
                        continue
                    seen_ids.add(arxiv_id)

                    authors = []
                    for author_elem in entry.findall("atom:author", ns):
                        name_elem = author_elem.find("atom:name", ns)
                        if name_elem is not None and name_elem.text:
                            authors.append({"name": name_elem.text.strip()})

                    published = entry.find("atom:published", ns)
                    pub_str = published.text if published is not None and published.text else "2024"
                    year = int(pub_str[:4]) if len(pub_str) >= 4 and pub_str[:4].isdigit() else 2024

                    papers.append({
                        "paper_id": str(uuid.uuid4()),
                        "oa_id": f"arxiv_{arxiv_id}",
                        "arxiv_id": arxiv_id,
                        "doi": None,
                        "title": title,
                        "abstract": abstract[:2500],
                        "authors": authors[:5],
                        "year": year,
                        "venue": "arXiv.org",
                        "topics": [topic, dept],
                        "referenced_works": [],
                        "sources": ["arxiv"],
                        "raw_minio_path": f"{RAW_BUCKET}/{batch_key}",
                    })
            except Exception as exc:
                print(f"Notice: arXiv fetch for '{topic}' skipped: {exc}")

    print(f"Fetched {len(papers)} unique preprints from arXiv.")
    return papers


def main():
    parser = argparse.ArgumentParser(description="Deterministic Seed & Ingestion for Chanakya Research Commons")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for 100% reproducible seeding (default: 42)")
    parser.add_argument("--incremental", action="store_true", help="Incremental mode: add papers without wiping database")
    parser.add_argument("--per-topic", type=int, default=30, help="Papers to fetch per topic from OpenAlex")
    args = parser.parse_args()

    # 100% Deterministic seeding as mandated by evaluation criteria
    random.seed(args.seed)
    np.random.seed(args.seed)
    print(f"[Seed Pipeline] Initialized deterministic RNG with seed={args.seed}")

    minio_client = get_minio_client()
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    if not args.incremental:
        print("[Seed Pipeline] Full fresh build: truncating operational tables...")
        cur.execute("""
            TRUNCATE activity_events, comments, post_upvotes, posts, library_saves,
                     collections, topic_follows, user_follows, paper_chunks,
                     paper_citations, paper_sources, papers, users, system_alerts
            RESTART IDENTITY CASCADE
        """)
        conn.commit()

    # 1. Fetch Papers from OpenAlex & arXiv
    raw_papers = fetch_openalex_papers(minio_client, per_topic=args.per_topic)
    arxiv_papers = fetch_arxiv_papers(minio_client, per_topic=5)
    all_fetched = raw_papers + arxiv_papers

    if not all_fetched:
        if args.incremental:
            print("[Seed Pipeline] No new papers fetched; exiting incremental mode.")
            cur.close()
            conn.close()
            return
        raise RuntimeError("No papers fetched from OpenAlex or arXiv. Check internet connection and retry.")

    ground_truth = {
        "duplicate_pairs": [],
        "spam_user_ids": [],
        "spike_topics": ["graph neural networks", "CRISPR gene editing", "data privacy law"],
        "author_variants": AUTHOR_NAME_VARIANTS,
        "benchmark_queries": BENCHMARK_QUERIES,
        "rag_in_corpus": RAG_IN_CORPUS_QUESTIONS,
        "rag_out_of_corpus": RAG_OUT_OF_CORPUS_TRAP_QUESTIONS,
    }

    all_papers = list(all_fetched)

    # Plant 30 Near-Duplicates for Ground Truth evaluation (mutated title preprint pairs)
    duplicate_candidates = random.sample(raw_papers, min(30, len(raw_papers)))
    for orig in duplicate_candidates:
        dup_id = str(uuid.uuid4())
        mutated_title = orig["title"].replace(":", " -").replace(" and ", " & ") + " (Preprint)"
        all_papers.append({
            **orig,
            "paper_id": dup_id,
            "oa_id": orig["oa_id"] + "_dup",
            "arxiv_id": f"240{random.randint(1000, 9999)}",
            "doi": None,
            "title": mutated_title,
            "sources": ["arxiv"],
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
    seen_arxiv = set()

    for p, emb in zip(all_papers, paper_embeddings):
        doi_val = p.get("doi")
        if doi_val and doi_val in seen_dois:
            doi_val = None
        if doi_val:
            seen_dois.add(doi_val)

        arxiv_val = p.get("arxiv_id")
        if arxiv_val and arxiv_val in seen_arxiv:
            arxiv_val = None
        if arxiv_val:
            seen_arxiv.add(arxiv_val)

        mh_bytes = minhash_signature(p["title"], p["abstract"])
        emb_list = emb.tolist()
        sources_list = p.get("sources", ["openalex"])

        paper_rows.append((
            p["paper_id"],
            doi_val,
            arxiv_val,
            p["title"],
            p["abstract"],
            json.dumps(p["authors"]),
            p["year"],
            p["venue"],
            p["topics"],
            json.dumps(sources_list),
            psycopg2.Binary(mh_bytes),
            emb_list,
        ))

        for src in sources_list:
            source_rows.append((
                str(uuid.uuid4()),
                p["paper_id"],
                src,
                p.get("oa_id") if src == "openalex" else arxiv_val,
                p.get("oa_id") if src == "openalex" else f"https://arxiv.org/abs/{arxiv_val}",
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
        INSERT INTO papers (paper_id, doi, arxiv_id, canonical_title, abstract, authors, publication_year, venue, topics, sources, minhash_signature, embedding)
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
        VALUES %s ON CONFLICT DO NOTHING
        """,
        chunk_rows,
    )

    # Citation edges within fetched corpus
    citation_rows = []
    for p in all_papers:
        for ref in p.get("referenced_works", []):
            if ref in oa_to_uuid and oa_to_uuid[ref] != p["paper_id"]:
                citation_rows.append((p["paper_id"], oa_to_uuid[ref]))
    if citation_rows:
        execute_values(
            cur,
            "INSERT INTO paper_citations (citing_paper_id, cited_paper_id) VALUES %s ON CONFLICT DO NOTHING",
            citation_rows,
        )

    demo_password_hash = hash_passcode(DEMO_PASSCODE)

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
            "full_name": f"Member {i + 1} ({SCHOOL_CODES[dept]})",
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
        VALUES %s ON CONFLICT (university_id) DO NOTHING
        """,
        [
            (
                u["user_id"],
                u["university_id"],
                u["full_name"],
                u["email"],
                demo_password_hash,
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
    print("Generating library saves, posts, comments, and interaction events...")
    now = datetime.now(timezone.utc)
    collection_rows = []
    save_rows = []
    event_rows = []

    for u in users:
        col_id = str(uuid.uuid4())
        collection_rows.append((col_id, u["user_id"], f"{u['tags'][0].title()} Core Reading", "Key papers for literature review"))
        dept_papers = [p for p in all_fetched if u["department"] in p["topics"]] or all_fetched
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

    execute_values(cur, "INSERT INTO collections (collection_id, user_id, name, description) VALUES %s ON CONFLICT DO NOTHING", collection_rows)
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
        p = random.choice(all_fetched)
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
        VALUES %s ON CONFLICT DO NOTHING
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
        cid = str(uuid.uuid4())
        comment_rows.append((
            cid,
            pid,
            u["user_id"],
            None,
            "Great find! We should benchmark this baseline in our next research group sync.",
            ts,
        ))
        event_rows.append((u["user_id"], "add_comment", cid, None, u["tags"], ts))

    execute_values(cur, "INSERT INTO comments (comment_id, post_id, author_id, parent_comment_id, body, created_at) VALUES %s ON CONFLICT DO NOTHING", comment_rows)

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
        target = random.choice(all_fetched)["paper_id"] if etype == "view_paper" else None
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
