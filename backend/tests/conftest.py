"""
Shared test setup.

The tests run against the development database (they need the seeded corpus for search, recommendations and the
assistant), so every account a test creates uses the reserved domain @tests.crc.invalid. Before and after the test
session those accounts are deleted together with everything they created, and the denormalised counters they may
have touched (paper save counts, post vote totals) are recomputed. Real and seeded members are never touched.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from uuid import uuid4

import psycopg2
import pytest
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT))

TEST_DOMAIN = "tests.crc.invalid"
# Accounts left behind by older versions of test_endpoints.py (before they cleaned up after themselves).
LEGACY_PATTERN = r"^(test|o)_[0-9a-f]{6}@chanakyauniversity\.edu\.in$"
LEGACY_NAMES = ("Test Scholar", "Other Scholar")


def _cleanup() -> int:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute(
        """
        SELECT user_id FROM users
        WHERE email LIKE %s
           OR (email ~ %s AND full_name = ANY(%s) AND NOT is_synthetic)
        """,
        (f"%@{TEST_DOMAIN}", LEGACY_PATTERN, list(LEGACY_NAMES)),
    )
    ids = [r[0] for r in cur.fetchall()]
    if ids:
        cur.execute("DELETE FROM activity_events WHERE user_id = ANY(%s::uuid[])", (ids,))
        cur.execute("DELETE FROM system_alerts WHERE entity_ref = ANY(%s)", ([str(i) for i in ids],))
        cur.execute("DELETE FROM users WHERE user_id = ANY(%s::uuid[])", (ids,))  # posts, saves, follows... cascade
        # Counters that the deleted saves / votes contributed to.
        cur.execute(
            """
            UPDATE papers p SET save_count = s.n, in_chanakya_library = s.n > 0
            FROM (SELECT p2.paper_id, COUNT(ls.save_id) AS n FROM papers p2
                  LEFT JOIN library_saves ls ON ls.paper_id = p2.paper_id GROUP BY p2.paper_id) s
            WHERE s.paper_id = p.paper_id AND (p.save_count <> s.n OR p.in_chanakya_library <> (s.n > 0))
            """
        )
        cur.execute(
            """
            UPDATE posts p SET upvote_count = v.total
            FROM (SELECT p2.post_id, COALESCE(SUM(u.value), 0) AS total FROM posts p2
                  LEFT JOIN post_upvotes u ON u.post_id = p2.post_id GROUP BY p2.post_id) v
            WHERE v.post_id = p.post_id AND p.upvote_count <> v.total
            """
        )
    conn.commit()
    cur.close()
    conn.close()
    return len(ids)


@pytest.fixture(scope="session", autouse=True)
def clean_test_accounts():
    _cleanup()
    yield
    _cleanup()


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient
    from backend.main import app
    return TestClient(app)


def new_account(client, role: str = "researcher", **extra) -> dict:
    """Register a throwaway member; returns {"headers", "user_id", "email", "password"}."""
    email = f"crc-test-{uuid4().hex[:10]}@{TEST_DOMAIN}"
    body = {
        "university_id": f"TST{uuid4().hex[:8]}",
        "full_name": "Test Scholar",
        "email": email,
        "password": "Password123!",
        "role": role,
        "department": "School of Engineering",
        "bio": "Researching intelligent commons.",
        "interest_tags": ["data mining", "graph neural networks"],
        **extra,
    }
    resp = client.post("/api/auth/register", json=body)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    return {"headers": {"Authorization": f"Bearer {data['access_token']}"}, "user_id": data["user"]["user_id"],
            "email": email, "password": body["password"], "university_id": body["university_id"]}


@pytest.fixture
def member(client):
    return new_account(client)


@pytest.fixture
def other_member(client):
    return new_account(client, role="student")


@pytest.fixture(scope="session")
def admin_headers(client):
    """Signed-in seeded admin (seeded accounts share CRC_DEMO_PASSCODE)."""
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("SELECT email FROM users WHERE role = 'admin' AND is_synthetic ORDER BY university_id LIMIT 1")
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        pytest.skip("no seeded admin account")
    resp = client.post("/api/auth/login", json={"identifier": row[0], "passcode": os.environ["CRC_DEMO_PASSCODE"]})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['token']}"}
