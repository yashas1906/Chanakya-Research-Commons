"""
Incremental external-content ingestion (F4). Safe to run repeatedly, e.g. from data_pipeline/scheduler.py.

Sources
  openalex  paper metadata + abstracts, one page per topic per run (OpenAlex cursor pagination)
  arxiv     preprints, one page per topic per run (start offset), 3 s between calls as arXiv asks
  rss       articles from the curated feeds in data_pipeline/feeds.json (conditional GET with ETag /
            Last-Modified, so unchanged feeds cost one cheap request)

How it avoids reprocessing everything
  * ingestion_state keeps a cursor per source/topic/feed, so each run fetches the NEXT batch only.
  * items whose external id (or DOI / arXiv id) is already stored are skipped before any embedding work.
  * every raw response is archived unchanged in MinIO (raw-ingestion bucket) before it is parsed.
  * each run is logged in ingestion_runs (fetched / inserted / skipped counts).
  * afterwards the dedup step merges new records that duplicate existing ones (e.g. the arXiv version
    of an OpenAlex paper), so one paper keeps several sources.

Usage (repository root):
    python data_pipeline/ingest.py                         # all sources, default batch sizes
    python data_pipeline/ingest.py --sources rss           # articles only
    python data_pipeline/ingest.py --sources openalex,arxiv --per-topic 10 --max-topics 6
Then refresh the warehouse:  python data_pipeline/run_dw_elt.py   (the scheduler does both)
"""
from __future__ import annotations

import argparse
import hashlib
import html
import io
import json
import os
import re
import time
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

import psycopg2
import requests
from psycopg2.extras import Json, execute_values
from dotenv import load_dotenv

try:
    from data_pipeline.dedup import minhash_signature, resolve_duplicates
except ImportError:
    from dedup import minhash_signature, resolve_duplicates

load_dotenv()

DB_URL = os.getenv("DATABASE_URL", "postgresql://crc_admin:crc_secure_pass@localhost:5434/chanakya_commons")
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ROOT_USER", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin_pass")
RAW_BUCKET = "raw-ingestion"
FEEDS_FILE = Path(__file__).with_name("feeds.json")
USER_AGENT = "chanakya-research-commons-ingest/1.0"

# Same topic catalogue the seed corpus was built from (school -> research topics).
SCHOOL_TOPICS = {
    "School of Arts, Humanities and Social Sciences": ["digital humanities", "cognitive psychology", "media studies", "sociology of technology"],
    "School of Biosciences": ["CRISPR gene editing", "bioinformatics", "protein folding", "synthetic biology"],
    "School of Engineering": ["large language models", "graph neural networks", "computer vision", "wireless sensor networks", "VLSI design", "embedded systems"],
    "School of Law, Governance and Public Policy": ["artificial intelligence regulation", "data privacy law", "intellectual property", "public policy"],
    "School of Management Sciences": ["supply chain analytics", "fintech adoption", "sustainable finance", "consumer behavior"],
    "School of Mathematics and Natural Sciences": ["data mining", "signal processing", "statistical inference", "numerical optimization"],
}

_model = None


def get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


# --------------------------------------------------------------------------- storage helpers

class RawArchive:
    """Writes raw responses to MinIO unchanged. Falls back to a local folder if MinIO is down."""

    def __init__(self):
        self.client = None
        try:
            from minio import Minio
            client = Minio(MINIO_ENDPOINT, access_key=MINIO_ACCESS_KEY, secret_key=MINIO_SECRET_KEY, secure=False)
            if not client.bucket_exists(RAW_BUCKET):
                client.make_bucket(RAW_BUCKET)
            self.client = client
        except Exception as exc:
            print(f"[archive] MinIO unavailable ({exc}); raw files go to ./raw-ingestion instead.")

    def put(self, key: str, data: bytes, content_type: str) -> str:
        if self.client is not None:
            try:
                self.client.put_object(RAW_BUCKET, key, io.BytesIO(data), len(data), content_type=content_type)
                return f"{RAW_BUCKET}/{key}"
            except Exception as exc:
                print(f"[archive] MinIO write failed for {key}: {exc}")
        local = Path(RAW_BUCKET) / key
        local.parent.mkdir(parents=True, exist_ok=True)
        local.write_bytes(data)
        return f"local/{RAW_BUCKET}/{key}"


def get_state(cur, source: str, key: str) -> dict:
    cur.execute(
        "SELECT cursor_value, etag, last_modified FROM ingestion_state WHERE source_name = %s AND state_key = %s",
        (source, key),
    )
    row = cur.fetchone()
    return {"cursor": row[0], "etag": row[1], "last_modified": row[2]} if row else {"cursor": None, "etag": None, "last_modified": None}


def set_state(cur, source: str, key: str, cursor=None, etag=None, last_modified=None) -> None:
    cur.execute(
        """
        INSERT INTO ingestion_state (source_name, state_key, cursor_value, etag, last_modified, updated_at)
        VALUES (%s, %s, %s, %s, %s, NOW())
        ON CONFLICT (source_name, state_key) DO UPDATE
          SET cursor_value = EXCLUDED.cursor_value, etag = EXCLUDED.etag,
              last_modified = EXCLUDED.last_modified, updated_at = NOW()
        """,
        (source, key, cursor, etag, last_modified),
    )


def start_run(cur, source: str) -> int:
    cur.execute("INSERT INTO ingestion_runs (source_name) VALUES (%s) RETURNING run_id", (source,))
    return cur.fetchone()[0]


def finish_run(cur, run_id: int, fetched: int, inserted: int, skipped: int, status: str, details: dict) -> None:
    cur.execute(
        """
        UPDATE ingestion_runs
        SET finished_at = NOW(), fetched_count = %s, inserted_count = %s, skipped_count = %s, status = %s, details = %s
        WHERE run_id = %s
        """,
        (fetched, inserted, skipped, status, Json(details), run_id),
    )


class Known:
    """Identifiers already stored, so duplicates are skipped before any expensive work."""

    def __init__(self, cur):
        cur.execute("SELECT source_name, external_id FROM paper_sources WHERE external_id IS NOT NULL")
        self.external = {(s, e) for s, e in cur.fetchall()}
        cur.execute("SELECT lower(doi) FROM papers WHERE doi IS NOT NULL")
        self.dois = {r[0] for r in cur.fetchall()}
        cur.execute("SELECT arxiv_id FROM papers WHERE arxiv_id IS NOT NULL")
        self.arxiv = {r[0] for r in cur.fetchall()}
        cur.execute("SELECT external_id, paper_id::text FROM paper_sources WHERE source_name = 'openalex'")
        self.openalex_to_paper = dict(cur.fetchall())

    def seen(self, item: dict) -> bool:
        if (item["source"], item["external_id"]) in self.external:
            return True
        if item.get("doi") and item["doi"].lower() in self.dois:
            return True
        return bool(item.get("arxiv_id") and item["arxiv_id"] in self.arxiv)

    def add(self, item: dict) -> None:
        self.external.add((item["source"], item["external_id"]))
        if item.get("doi"):
            self.dois.add(item["doi"].lower())
        if item.get("arxiv_id"):
            self.arxiv.add(item["arxiv_id"])


def insert_items(cur, items: list[dict], known: Known) -> int:
    """Embed and insert new items (papers or articles) with provenance, chunks and citation edges."""
    if not items:
        return 0
    model = get_model()
    vectors = model.encode([f"{it['title']}. {it['abstract'][:600]}" for it in items], batch_size=32, show_progress_bar=False)

    paper_rows, source_rows, chunk_rows, citation_rows = [], [], [], []
    for it, vec in zip(items, vectors):
        pid = str(uuid.uuid4())
        it["paper_id"] = pid
        emb = vec.tolist()
        paper_rows.append((
            pid, it.get("doi"), it.get("arxiv_id"), it["title"][:2000], it["abstract"], Json(it["authors"]),
            it.get("year"), (it.get("venue") or "")[:200], it["topics"], Json([it["source"]]),
            psycopg2.Binary(minhash_signature(it["title"], it["abstract"])), emb, it.get("item_type", "paper"), it.get("url"),
        ))
        source_rows.append((pid, it["source"], it["external_id"], it["source_url"], it["raw_path"]))
        text = it["abstract"]
        mid = len(text) // 2
        for idx, chunk in enumerate([text[:mid], text[mid:]] if len(text) > 400 else [text]):
            if chunk.strip():
                chunk_rows.append((pid, idx, chunk.strip(), emb))
        if it["source"] == "openalex":
            known.openalex_to_paper[it["external_id"]] = pid

    execute_values(
        cur,
        """
        INSERT INTO papers (paper_id, doi, arxiv_id, canonical_title, abstract, authors, publication_year, venue,
                            topics, sources, minhash_signature, embedding, item_type, url)
        VALUES %s
        """,
        paper_rows,
        template="(%s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::vector, %s, %s)",
    )
    execute_values(
        cur,
        "INSERT INTO paper_sources (paper_id, source_name, external_id, source_url, raw_minio_path) VALUES %s ON CONFLICT DO NOTHING",
        source_rows,
        template="(%s::uuid, %s, %s, %s, %s)",
    )
    execute_values(
        cur,
        "INSERT INTO paper_chunks (paper_id, chunk_index, chunk_text, chunk_embedding) VALUES %s",
        chunk_rows,
        template="(%s::uuid, %s, %s, %s::vector)",
    )
    # Citation edges to papers we already hold (OpenAlex gives referenced_works).
    for it in items:
        for ref in it.get("referenced_works", []):
            cited = known.openalex_to_paper.get(ref)
            if cited and cited != it["paper_id"]:
                citation_rows.append((it["paper_id"], cited))
    if citation_rows:
        execute_values(
            cur,
            "INSERT INTO paper_citations (citing_paper_id, cited_paper_id) VALUES %s ON CONFLICT DO NOTHING",
            citation_rows,
            template="(%s::uuid, %s::uuid)",
        )
    for it in items:
        known.add(it)
    return len(items)


# --------------------------------------------------------------------------- sources

def _clean(text: str) -> str:
    text = html.unescape(re.sub(r"<[^>]+>", " ", text or ""))
    return re.sub(r"\s+", " ", text).strip()


def _abstract_from_index(inverted: dict | None) -> str:
    if not inverted:
        return ""
    words = {}
    for word, positions in inverted.items():
        for pos in positions:
            words[pos] = word
    return " ".join(words[i] for i in sorted(words))


def fetch_openalex(cur, archive: RawArchive, known: Known, topics: list[tuple[str, str]], per_topic: int) -> dict:
    fetched, new_items = 0, []
    for school, topic in topics:
        state = get_state(cur, "openalex", topic)
        cursor = state["cursor"] or "*"
        if cursor == "done":
            continue
        url = (
            "https://api.openalex.org/works"
            f"?search={requests.utils.quote(topic)}&filter=has_abstract:true,publication_year:>2021"
            f"&per_page={per_topic}&cursor={requests.utils.quote(cursor)}"
        )
        try:
            resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
        except requests.RequestException as exc:
            print(f"  [openalex] {topic}: {exc}")
            continue
        if resp.status_code != 200:
            print(f"  [openalex] {topic}: HTTP {resp.status_code}")
            continue
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        raw_path = archive.put(f"openalex/{topic.replace(' ', '_')}/{stamp}.json", resp.content, "application/json")
        payload = resp.json()
        results = payload.get("results", [])
        fetched += len(results)
        for work in results:
            abstract = _abstract_from_index(work.get("abstract_inverted_index"))
            title = (work.get("title") or "").strip()
            if len(abstract) < 80 or not title or not work.get("id"):
                continue
            doi = (work.get("doi") or "").replace("https://doi.org/", "").strip() or None
            item = {
                "source": "openalex",
                "external_id": work["id"],
                "source_url": work["id"],
                "raw_path": raw_path,
                "doi": doi,
                "title": title,
                "abstract": abstract[:2500],
                "authors": [{"name": a["author"]["display_name"]} for a in work.get("authorships", [])[:5]
                            if a.get("author") and a["author"].get("display_name")],
                "year": work.get("publication_year"),
                "venue": ((work.get("primary_location") or {}).get("source") or {}).get("display_name") or "OpenAlex",
                "topics": [topic, school],
                "referenced_works": work.get("referenced_works", []),
            }
            if not known.seen(item):
                known.add(item)
                new_items.append(item)
        next_cursor = (payload.get("meta") or {}).get("next_cursor")
        set_state(cur, "openalex", topic, cursor=next_cursor or "done")
    return {"fetched": fetched, "items": new_items}


def fetch_arxiv(cur, archive: RawArchive, known: Known, topics: list[tuple[str, str]], per_topic: int) -> dict:
    ns = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}
    fetched, new_items = 0, []
    for school, topic in topics:
        state = get_state(cur, "arxiv", topic)
        start = int(state["cursor"] or 0)
        url = (
            "https://export.arxiv.org/api/query"
            f"?search_query=all:%22{requests.utils.quote(topic)}%22&start={start}&max_results={per_topic}"
            "&sortBy=relevance&sortOrder=descending"
        )
        time.sleep(3)  # arXiv API etiquette
        try:
            resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
        except requests.RequestException as exc:
            print(f"  [arxiv] {topic}: {exc}")
            continue
        if resp.status_code != 200:
            print(f"  [arxiv] {topic}: HTTP {resp.status_code}")
            continue
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        raw_path = archive.put(f"arxiv/{topic.replace(' ', '_')}/{stamp}.xml", resp.content, "application/atom+xml")
        try:
            root = ET.fromstring(resp.content)
        except ET.ParseError as exc:
            print(f"  [arxiv] {topic}: bad XML ({exc})")
            continue
        entries = root.findall("atom:entry", ns)
        fetched += len(entries)
        for entry in entries:
            id_url = (entry.findtext("atom:id", "", ns) or "").strip()
            if "/abs/" not in id_url:
                continue
            arxiv_id = re.sub(r"v\d+$", "", id_url.split("/abs/")[-1])
            title = _clean(entry.findtext("atom:title", "", ns))
            abstract = _clean(entry.findtext("atom:summary", "", ns))
            if not title or len(abstract) < 80:
                continue
            published = entry.findtext("atom:published", "", ns) or ""
            doi = (entry.findtext("arxiv:doi", "", ns) or "").strip() or None
            item = {
                "source": "arxiv",
                "external_id": arxiv_id,
                "source_url": f"https://arxiv.org/abs/{arxiv_id}",
                "raw_path": raw_path,
                "doi": doi,
                "arxiv_id": arxiv_id,
                "title": title,
                "abstract": abstract[:2500],
                "authors": [{"name": _clean(a.findtext("atom:name", "", ns))} for a in entry.findall("atom:author", ns)][:5],
                "year": int(published[:4]) if published[:4].isdigit() else None,
                "venue": "arXiv.org",
                "topics": [topic, school],
            }
            if not known.seen(item):
                known.add(item)
                new_items.append(item)
        set_state(cur, "arxiv", topic, cursor=str(start + per_topic))
    return {"fetched": fetched, "items": new_items}


def _parse_date(text: str | None) -> int | None:
    if not text:
        return None
    try:
        return parsedate_to_datetime(text).year
    except (TypeError, ValueError):
        pass
    m = re.match(r"(\d{4})-\d{2}-\d{2}", text.strip())
    return int(m.group(1)) if m else None


def _parse_feed(content: bytes) -> list[dict]:
    """Minimal RSS 2.0 / Atom parser (no extra dependency)."""
    root = ET.fromstring(content)
    entries = []
    atom = "{http://www.w3.org/2005/Atom}"
    dc = "{http://purl.org/dc/elements/1.1/}"
    content_ns = "{http://purl.org/rss/1.0/modules/content/}"
    if root.tag == f"{atom}feed":
        for e in root.findall(f"{atom}entry"):
            link = ""
            for l in e.findall(f"{atom}link"):
                if l.get("rel", "alternate") == "alternate":
                    link = l.get("href", "")
                    break
            entries.append({
                "id": (e.findtext(f"{atom}id") or link).strip(),
                "link": link.strip(),
                "title": _clean(e.findtext(f"{atom}title")),
                "summary": _clean(e.findtext(f"{atom}summary") or e.findtext(f"{atom}content")),
                "author": _clean(e.findtext(f"{atom}author/{atom}name")),
                "date": e.findtext(f"{atom}published") or e.findtext(f"{atom}updated"),
            })
    else:
        for item in root.iter("item"):
            link = (item.findtext("link") or "").strip()
            entries.append({
                "id": (item.findtext("guid") or link).strip(),
                "link": link,
                "title": _clean(item.findtext("title")),
                "summary": _clean(item.findtext("description") or item.findtext(f"{content_ns}encoded")),
                "author": _clean(item.findtext(f"{dc}creator") or item.findtext("author")),
                "date": item.findtext("pubDate") or item.findtext(f"{dc}date"),
            })
    return entries


def fetch_rss(cur, archive: RawArchive, known: Known, max_per_feed: int) -> dict:
    feeds = json.loads(FEEDS_FILE.read_text(encoding="utf-8"))["feeds"]
    fetched, new_items, unchanged = 0, [], 0
    for feed in feeds:
        state = get_state(cur, "rss", feed["url"])
        headers = {"User-Agent": USER_AGENT}
        if state["etag"]:
            headers["If-None-Match"] = state["etag"]
        if state["last_modified"]:
            headers["If-Modified-Since"] = state["last_modified"]
        try:
            resp = requests.get(feed["url"], headers=headers, timeout=30)
        except requests.RequestException as exc:
            print(f"  [rss] {feed['name']}: {exc}")
            continue
        if resp.status_code == 304:
            unchanged += 1
            continue
        if resp.status_code != 200:
            print(f"  [rss] {feed['name']}: HTTP {resp.status_code}")
            continue
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        slug = re.sub(r"[^a-z0-9]+", "_", feed["name"].lower()).strip("_")
        raw_path = archive.put(f"rss/{slug}/{stamp}.xml", resp.content, "application/xml")
        try:
            entries = _parse_feed(resp.content)
        except ET.ParseError as exc:
            print(f"  [rss] {feed['name']}: bad XML ({exc})")
            continue
        fetched += len(entries)
        for e in entries[:max_per_feed]:
            if not e["title"] or not e["link"]:
                continue
            summary = e["summary"] or e["title"]
            if len(summary) < 40:
                continue
            item = {
                "source": "rss",
                # paper_sources.external_id is VARCHAR(150); a hash of the guid/link fits and stays stable.
                "external_id": "rss:" + hashlib.sha1((e["id"] or e["link"]).encode("utf-8")).hexdigest(),
                "source_url": e["link"],
                "raw_path": raw_path,
                "title": e["title"],
                "abstract": summary[:2500],
                "authors": [{"name": e["author"] or feed["name"]}],
                "year": _parse_date(e["date"]) or datetime.now(timezone.utc).year,
                "venue": feed["name"],
                "topics": [feed["topic"], feed["school"]],
                "item_type": "article",
                "url": e["link"],
            }
            if not known.seen(item):
                known.add(item)
                new_items.append(item)
        set_state(cur, "rss", feed["url"], etag=resp.headers.get("ETag"), last_modified=resp.headers.get("Last-Modified"))
    return {"fetched": fetched, "items": new_items, "unchanged_feeds": unchanged}


# --------------------------------------------------------------------------- orchestration

def run(sources: list[str], per_topic: int, max_topics: int | None, max_per_feed: int, dedup: bool = True) -> dict:
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    archive = RawArchive()
    known = Known(cur)
    topics = [(school, t) for school, ts in SCHOOL_TOPICS.items() for t in ts]
    if max_topics:
        topics = topics[:max_topics]
    summary = {}
    fetchers = {
        "openalex": lambda: fetch_openalex(cur, archive, known, topics, per_topic),
        "arxiv": lambda: fetch_arxiv(cur, archive, known, topics, per_topic),
        "rss": lambda: fetch_rss(cur, archive, known, max_per_feed),
    }
    for source in sources:
        run_id = start_run(cur, source)
        conn.commit()
        print(f"[ingest] {source}: fetching next batch ...")
        try:
            result = fetchers[source]()
            inserted = insert_items(cur, result["items"], known)
            skipped = result["fetched"] - inserted
            details = {k: v for k, v in result.items() if k not in ("items", "fetched")}
            finish_run(cur, run_id, result["fetched"], inserted, skipped, "ok", details)
            conn.commit()
            summary[source] = {"fetched": result["fetched"], "inserted": inserted, "skipped": skipped, **details}
            print(f"[ingest] {source}: fetched {result['fetched']}, inserted {inserted}, skipped {skipped}")
        except Exception as exc:  # one failing source must not block the others
            conn.rollback()
            finish_run(cur, run_id, 0, 0, 0, "failed", {"error": str(exc)[:500]})
            conn.commit()
            summary[source] = {"error": str(exc)}
            print(f"[ingest] {source}: FAILED - {exc}")

    if dedup:
        result = resolve_duplicates(cur)
        conn.commit()
        summary["dedup"] = {"pairs": result["pairs"], "merged": result["merged"]}
        print(f"[ingest] entity resolution: merged {result['merged']} new duplicates")
    cur.close()
    conn.close()
    return summary


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sources", default="openalex,arxiv,rss", help="comma-separated: openalex, arxiv, rss")
    ap.add_argument("--per-topic", type=int, default=10, help="items per topic per run (OpenAlex / arXiv)")
    ap.add_argument("--max-topics", type=int, default=None, help="only the first N topics (quick runs)")
    ap.add_argument("--max-per-feed", type=int, default=15, help="newest N entries per RSS feed")
    ap.add_argument("--no-dedup", action="store_true", help="skip the entity-resolution step")
    args = ap.parse_args()
    sources = [s.strip() for s in args.sources.split(",") if s.strip()]
    unknown = set(sources) - {"openalex", "arxiv", "rss"}
    if unknown:
        ap.error(f"unknown source(s): {', '.join(sorted(unknown))}")
    summary = run(sources, args.per_topic, args.max_topics, args.max_per_feed, dedup=not args.no_dedup)
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
