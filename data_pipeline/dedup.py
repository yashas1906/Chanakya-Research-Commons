"""
Near-duplicate detection and entity resolution for papers (F4 / F5).

Pipeline
  1. Candidates   MinHash (128 permutations) over word 3-shingles of title + abstract, bucketed with
                  LSH (Jaccard threshold 0.5) so we never compare all pairs.
  2. Verification a candidate pair is a duplicate only if
                    - estimated shingle Jaccard   >= MIN_JACCARD
                    - title word Jaccard          >= MIN_TITLE_JACCARD  ("(Preprint)" etc. ignored)
                    - embedding cosine similarity >= MIN_COSINE
                  or the two records share a DOI / arXiv id.
  3. Resolution   verified pairs are grouped with union-find; each group keeps one canonical record
                  (has a DOI > most saves > longest abstract > oldest row). Everything that pointed at a
                  duplicate - sources, saves, notes, posts, citations, events - is moved to the canonical
                  record, the sources lists are unioned, and the merge is logged in paper_merges.

The same paper found in several sources therefore appears once in search, with all its sources.

Usage (repository root):
    python data_pipeline/dedup.py --dry-run    # report what would be merged, change nothing
    python data_pipeline/dedup.py              # merge, then run run_dw_elt.py to refresh the warehouse
"""
from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path

import numpy as np
import psycopg2
from datasketch import MinHash, MinHashLSH
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DATABASE_URL")

if not DB_URL:
    raise RuntimeError("DATABASE_URL is not set. Copy .env.example to .env and fill it in (see README, Environment Variables).")

NUM_PERM = 128
LSH_THRESHOLD = 0.5
MIN_JACCARD = 0.5
MIN_TITLE_JACCARD = 0.4
MIN_COSINE = 0.93
METHOD = "minhash_lsh+title+embedding"
PREDICTIONS_FILE = Path(__file__).resolve().parent.parent / "evaluation" / "predicted_duplicates.json"

_WORD = re.compile(r"[a-z0-9]+")
_NOISE = {"preprint", "the", "a", "an", "of", "and", "in", "on", "for", "to"}


def _words(text: str) -> list[str]:
    return _WORD.findall((text or "").lower())


def shingles(text: str, k: int = 3) -> set[str]:
    words = _words(text)
    if len(words) < k:
        return {" ".join(words)} if words else set()
    return {" ".join(words[i:i + k]) for i in range(len(words) - k + 1)}


def minhash_for(title: str, abstract: str) -> MinHash:
    mh = MinHash(num_perm=NUM_PERM)
    for sh in shingles(f"{title} {abstract or ''}"):
        mh.update(sh.encode("utf-8"))
    return mh


def minhash_signature(title: str, abstract: str) -> bytes:
    """Bytes stored in papers.minhash_signature (shared with the seed and ingestion scripts)."""
    return minhash_for(title, abstract).hashvalues.tobytes()


def title_jaccard(a: str, b: str) -> float:
    ta = {w for w in _words(a) if w not in _NOISE}
    tb = {w for w in _words(b) if w not in _NOISE}
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def _parse_vec(text) -> np.ndarray | None:
    if text is None:
        return None
    v = np.asarray(json.loads(text) if isinstance(text, str) else text, dtype=np.float32)
    n = np.linalg.norm(v)
    return v / n if n else None


def find_duplicate_pairs(records: list[dict]) -> list[dict]:
    """
    Verified duplicate pairs among in-memory records. Each record: {"id", "title", "abstract", "emb"
    (unit-normalised vector or None), "doi", "arxiv"}. Pure function: used by find_duplicates() on the
    database and by evaluation/evaluate_all.py on a benchmark corpus.
    """
    meta, hashes = {}, {}
    lsh = MinHashLSH(threshold=LSH_THRESHOLD, num_perm=NUM_PERM)
    for r in records:
        pid = r["id"]
        hashes[pid] = minhash_for(r["title"], r.get("abstract") or "")
        meta[pid] = {"title": r["title"], "emb": r.get("emb"), "doi": (r.get("doi") or "").lower() or None, "arxiv": r.get("arxiv")}
        lsh.insert(pid, hashes[pid])

    pairs: dict[tuple[str, str], dict] = {}

    # Exact identifier matches are duplicates regardless of text.
    by_id: dict[str, list[str]] = {}
    for pid, m in meta.items():
        for key in (f"doi:{m['doi']}" if m["doi"] else None, f"arxiv:{m['arxiv']}" if m["arxiv"] else None):
            if key:
                by_id.setdefault(key, []).append(pid)
    for ids in by_id.values():
        for other in ids[1:]:
            a, b = sorted((ids[0], other))
            pairs[(a, b)] = {"paper_a": a, "paper_b": b, "jaccard": 1.0, "title_jaccard": 1.0, "cosine": 1.0, "reason": "identifier"}

    for pid, mh in hashes.items():
        for other in lsh.query(mh):
            if other == pid:
                continue
            a, b = sorted((pid, other))
            if (a, b) in pairs:
                continue
            jac = float(hashes[a].jaccard(hashes[b]))
            tj = title_jaccard(meta[a]["title"], meta[b]["title"])
            ea, eb = meta[a]["emb"], meta[b]["emb"]
            cos = float(ea @ eb) if ea is not None and eb is not None else 0.0
            if jac >= MIN_JACCARD and tj >= MIN_TITLE_JACCARD and cos >= MIN_COSINE:
                pairs[(a, b)] = {
                    "paper_a": a, "paper_b": b,
                    "jaccard": round(jac, 4), "title_jaccard": round(tj, 4), "cosine": round(cos, 4),
                    "reason": "near_duplicate",
                }
    return list(pairs.values())


def find_duplicates(cur) -> list[dict]:
    """Verified duplicate pairs among the papers in the database. Read-only."""
    cur.execute(
        """
        SELECT paper_id::text, canonical_title, coalesce(abstract, ''), embedding::text, doi, arxiv_id
        FROM papers
        """
    )
    records = [
        {"id": pid, "title": title, "abstract": abstract, "emb": _parse_vec(emb), "doi": doi, "arxiv": arxiv_id}
        for pid, title, abstract, emb, doi, arxiv_id in cur.fetchall()
    ]
    return find_duplicate_pairs(records)


def _groups(pairs: list[dict]) -> list[set[str]]:
    parent: dict[str, str] = {}

    def find(x: str) -> str:
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for p in pairs:
        ra, rb = find(p["paper_a"]), find(p["paper_b"])
        if ra != rb:
            parent[rb] = ra
    groups: dict[str, set[str]] = {}
    for node in parent:
        groups.setdefault(find(node), set()).add(node)
    return [g for g in groups.values() if len(g) > 1]


def _pick_canonical(cur, ids: set[str]) -> str:
    cur.execute(
        """
        SELECT paper_id::text
        FROM papers
        WHERE paper_id::text = ANY(%s)
        ORDER BY (doi IS NOT NULL) DESC, save_count DESC, length(coalesce(abstract, '')) DESC, created_at ASC, paper_id
        LIMIT 1
        """,
        (list(ids),),
    )
    return cur.fetchone()[0]


def _merge_one(cur, dup: str, canon: str, score: dict | None) -> None:
    # Identifiers: free the duplicate's unique DOI / arXiv id, then copy them onto the canonical row if it lacks one.
    cur.execute("SELECT doi, arxiv_id, canonical_title FROM papers WHERE paper_id = %s::uuid", (dup,))
    dup_doi, dup_arxiv, dup_title = cur.fetchone()
    cur.execute("UPDATE papers SET doi = NULL, arxiv_id = NULL WHERE paper_id = %s::uuid", (dup,))
    cur.execute(
        """
        UPDATE papers SET doi = COALESCE(doi, %s), arxiv_id = COALESCE(arxiv_id, %s)
        WHERE paper_id = %s::uuid
        """,
        (dup_doi, dup_arxiv, canon),
    )

    # Provenance: every source record now belongs to the canonical paper.
    cur.execute("UPDATE paper_sources SET paper_id = %s::uuid WHERE paper_id = %s::uuid", (canon, dup))

    # Saves: move them; if a member saved both, keep one row and append the duplicate's note.
    cur.execute(
        """
        UPDATE library_saves keep
        SET private_notes = NULLIF(concat_ws(E'\\n', NULLIF(keep.private_notes, ''), NULLIF(d.private_notes, '')), ''),
            collection_id = COALESCE(keep.collection_id, d.collection_id)
        FROM library_saves d
        WHERE keep.paper_id = %s::uuid AND d.paper_id = %s::uuid AND keep.user_id = d.user_id
          AND coalesce(d.private_notes, '') <> coalesce(keep.private_notes, '')
        """,
        (canon, dup),
    )
    cur.execute(
        """
        UPDATE library_saves d SET paper_id = %s::uuid
        WHERE d.paper_id = %s::uuid
          AND NOT EXISTS (SELECT 1 FROM library_saves k WHERE k.user_id = d.user_id AND k.paper_id = %s::uuid)
        """,
        (canon, dup, canon),
    )
    cur.execute("DELETE FROM library_saves WHERE paper_id = %s::uuid", (dup,))

    # Posts, events, citations.
    cur.execute("UPDATE posts SET attached_paper_id = %s::uuid WHERE attached_paper_id = %s::uuid", (canon, dup))
    cur.execute("UPDATE activity_events SET target_id = %s::uuid WHERE target_id = %s::uuid", (canon, dup))
    cur.execute(
        """
        INSERT INTO paper_citations (citing_paper_id, cited_paper_id)
        SELECT CASE WHEN citing_paper_id = %(d)s::uuid THEN %(c)s::uuid ELSE citing_paper_id END,
               CASE WHEN cited_paper_id  = %(d)s::uuid THEN %(c)s::uuid ELSE cited_paper_id END
        FROM paper_citations
        WHERE (citing_paper_id = %(d)s::uuid OR cited_paper_id = %(d)s::uuid)
          AND NOT (citing_paper_id = %(d)s::uuid AND cited_paper_id = %(c)s::uuid)
          AND NOT (citing_paper_id = %(c)s::uuid AND cited_paper_id = %(d)s::uuid)
        ON CONFLICT DO NOTHING
        """,
        {"d": dup, "c": canon},
    )

    # Union the sources / topics lists and refresh library counters on the canonical row.
    cur.execute(
        """
        UPDATE papers c SET
            sources = (
                SELECT to_jsonb(array_agg(DISTINCT s ORDER BY s)) FROM (
                    SELECT jsonb_array_elements_text(coalesce(c.sources, '[]'::jsonb)) AS s
                    UNION SELECT jsonb_array_elements_text(coalesce(d.sources, '[]'::jsonb))
                    UNION SELECT source_name FROM paper_sources WHERE paper_id = c.paper_id
                ) u
            ),
            topics = ARRAY(SELECT DISTINCT t FROM unnest(coalesce(c.topics, '{}') || coalesce(d.topics, '{}')) t),
            url = COALESCE(c.url, d.url)
        FROM papers d
        WHERE c.paper_id = %s::uuid AND d.paper_id = %s::uuid
        """,
        (canon, dup),
    )
    cur.execute(
        """
        UPDATE papers SET
            save_count = (SELECT COUNT(*) FROM library_saves WHERE paper_id = %s::uuid),
            in_chanakya_library = EXISTS (SELECT 1 FROM library_saves WHERE paper_id = %s::uuid) OR created_by IS NOT NULL
        WHERE paper_id = %s::uuid
        """,
        (canon, canon, canon),
    )

    # Earlier merges that pointed at this duplicate now point at the new canonical record.
    cur.execute("UPDATE paper_merges SET canonical_paper_id = %s::uuid WHERE canonical_paper_id = %s::uuid", (canon, dup))
    cur.execute(
        """
        INSERT INTO paper_merges (duplicate_paper_id, canonical_paper_id, duplicate_title, minhash_jaccard, embedding_cosine, method)
        VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s)
        ON CONFLICT (duplicate_paper_id) DO NOTHING
        """,
        (dup, canon, dup_title, (score or {}).get("jaccard"), (score or {}).get("cosine"), METHOD),
    )
    cur.execute("DELETE FROM papers WHERE paper_id = %s::uuid", (dup,))  # chunks and old edges cascade


def resolve_duplicates(cur, dry_run: bool = False, write_predictions: bool = True) -> dict:
    """Detect, verify and (unless dry_run) merge duplicates. Caller commits."""
    pairs = find_duplicates(cur)
    if write_predictions:
        # Predictions = pairs found now + pairs already merged on earlier runs (their duplicate rows are gone),
        # so the evaluation always scores everything the system has ever detected.
        cur.execute(
            """
            SELECT duplicate_paper_id::text, canonical_paper_id::text, minhash_jaccard, embedding_cosine
            FROM paper_merges
            """
        )
        merged_before = [
            {"paper_a": d, "paper_b": c, "jaccard": j, "cosine": cos, "reason": "merged"}
            for d, c, j, cos in cur.fetchall()
        ]
        PREDICTIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
        PREDICTIONS_FILE.write_text(json.dumps(merged_before + pairs, indent=2), encoding="utf-8")

    score_of = {(p["paper_a"], p["paper_b"]): p for p in pairs}
    groups = _groups(pairs)
    merged = 0
    plan = []
    for group in groups:
        canon = _pick_canonical(cur, group)
        for dup in sorted(group - {canon}):
            score = score_of.get(tuple(sorted((dup, canon))))
            plan.append({"duplicate": dup, "canonical": canon})
            if not dry_run:
                _merge_one(cur, dup, canon, score)
                merged += 1
    return {"pairs": len(pairs), "groups": len(groups), "merged": merged, "plan": plan}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="report duplicates without changing the database")
    args = ap.parse_args()

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    result = resolve_duplicates(cur, dry_run=args.dry_run)
    if args.dry_run:
        conn.rollback()
        print(f"[dedup] dry run: {result['pairs']} verified pairs in {result['groups']} groups; "
              f"{len(result['plan'])} records would be merged. Predictions written to {PREDICTIONS_FILE}.")
    else:
        conn.commit()
        print(f"[dedup] merged {result['merged']} duplicate records into {result['groups']} canonical papers "
              f"({result['pairs']} verified pairs). Run data_pipeline/run_dw_elt.py to refresh the warehouse.")
    cur.close()
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
