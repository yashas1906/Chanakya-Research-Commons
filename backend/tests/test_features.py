"""
Endpoint tests for the F1-F9 features. They run against the seeded development database (see conftest.py);
throwaway accounts are removed after the run. No test calls external services (Crossref, arXiv, Ollama).
"""
from __future__ import annotations

import os

import psycopg2
import pytest

from backend.tests.conftest import new_account

ZERO = "00000000-0000-0000-0000-000000000000"


def _db():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def _library_paper_id() -> str:
    with _db() as conn, conn.cursor() as cur:
        cur.execute("SELECT paper_id::text FROM papers WHERE in_chanakya_library ORDER BY save_count DESC LIMIT 1")
        return cur.fetchone()[0]


# ---------------------------------------------------------------- F1 accounts and profiles

def test_login_wrong_password_is_rejected(client, member):
    assert client.post("/api/auth/login", json={"identifier": member["email"], "passcode": "wrong"}).status_code == 401


def test_profile_edit_links_and_validation(client, member):
    h = member["headers"]
    r = client.patch("/api/users/me", json={
        "bio": "Graph mining for citation networks.",
        "interest_tags": ["graph mining", " Graph  Mining ", "NLP"],
        "profile_url": "example.org/~scholar",
        "publication_links": ["https://doi.org/10.1/x", "https://doi.org/10.1/x", ""],
    }, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["interest_tags"] == ["graph mining", "NLP"]          # cleaned and de-duplicated
    assert body["profile_url"] == "https://example.org/~scholar"     # scheme added
    assert body["publication_links"] == ["https://doi.org/10.1/x"]
    profile = client.get(f"/api/users/{member['user_id']}").json()["user"]
    assert profile["publication_links"] == ["https://doi.org/10.1/x"]
    assert client.patch("/api/users/me", json={"profile_url": "not a url"}, headers=h).status_code == 422
    assert client.patch("/api/users/me", json={"bio": "x"}).status_code == 401


def test_flagged_member_can_still_open_own_profile(client, member, admin_headers):
    assert client.post(f"/api/admin/members/{member['user_id']}/spam", json={"flagged": True}, headers=admin_headers).status_code == 200
    assert client.get(f"/api/users/{member['user_id']}").status_code == 404                        # hidden from the public
    assert client.get(f"/api/users/{member['user_id']}", headers=member["headers"]).status_code == 200  # but not from themselves
    assert client.post(f"/api/admin/members/{member['user_id']}/spam", json={"flagged": False}, headers=admin_headers).status_code == 200
    assert client.get(f"/api/users/{member['user_id']}").status_code == 200


# ---------------------------------------------------------------- F2 posts (Phase 6 flows)

def test_post_with_attached_paper_tops_new_feed_and_paper_page(client, member):
    paper_id = _library_paper_id()
    title = client.get(f"/api/papers/{paper_id}").json()["canonical_title"]
    hits = client.get("/api/papers/suggest", params={"q": title[:12]}).json()
    assert any(h["paper_id"] == paper_id for h in hits)                       # the picker finds it by title

    r = client.post("/api/posts", json={"title": "Phase 6 check", "body": "Attached paper.", "tags": [],
                                        "attached_paper_id": paper_id}, headers=member["headers"])
    assert r.status_code == 200, r.text
    post_id = str(r.json()["post_id"])
    newest = client.get("/api/feed", params={"sort": "new", "limit": 5}, headers=member["headers"]).json()
    assert newest[0]["post_id"] == post_id and str(newest[0]["attached_paper_id"]) == paper_id
    assert any(p["post_id"] == post_id for p in client.get(f"/api/papers/{paper_id}").json()["related_posts"])


@pytest.mark.parametrize("paper_id, status", [("not-a-uuid", 422), (ZERO, 404)])
def test_post_rejects_unknown_attached_paper(client, member, paper_id, status):
    r = client.post("/api/posts", json={"title": "x", "body": "y", "attached_paper_id": paper_id}, headers=member["headers"])
    assert r.status_code == status


def test_flagged_author_sees_own_posts_marked_under_review(client, member, admin_headers):
    post_id = str(client.post("/api/posts", json={"title": "Flag check", "body": "z"}, headers=member["headers"]).json()["post_id"])
    assert client.post(f"/api/admin/members/{member['user_id']}/spam", json={"flagged": True}, headers=admin_headers).status_code == 200
    try:
        mine = client.get("/api/feed", params={"sort": "new", "limit": 100}, headers=member["headers"]).json()
        own = [p for p in mine if p["post_id"] == post_id]
        assert own and own[0]["under_review"] is True                         # the author still sees it, flagged
        public = client.get("/api/feed", params={"sort": "new", "limit": 100}).json()
        assert all(p["post_id"] != post_id for p in public)                   # everyone else does not
    finally:
        client.post(f"/api/admin/members/{member['user_id']}/spam", json={"flagged": False}, headers=admin_headers)


def test_follow_and_unfollow_topic(client, member):
    h = member["headers"]
    assert client.post("/api/topics/bioinformatics/follow", headers=h).status_code == 200
    assert "bioinformatics" in client.get("/api/users/me/follows", headers=h).json()["followed_topics"]
    assert client.delete("/api/topics/bioinformatics/follow", headers=h).status_code == 200
    assert "bioinformatics" not in client.get("/api/users/me/follows", headers=h).json()["followed_topics"]


# ---------------------------------------------------------------- F3 library

def test_notes_survive_resave_and_can_be_cleared(client, member):
    h, pid = member["headers"], _library_paper_id()
    assert client.post("/api/library/save", json={"paper_id": pid}, headers=h).status_code == 200
    assert client.patch(f"/api/library/save/{pid}", json={"private_notes": "read section 3"}, headers=h).json()["private_notes"] == "read section 3"
    client.post("/api/library/save", json={"paper_id": pid, "private_notes": ""}, headers=h)   # re-save must not wipe the note
    assert client.get(f"/api/papers/{pid}", headers=h).json()["private_notes"] == "read section 3"
    assert client.patch(f"/api/library/save/{pid}", json={"private_notes": ""}, headers=h).json()["private_notes"] is None
    assert client.patch(f"/api/library/save/{ZERO}", json={"private_notes": "x"}, headers=h).status_code == 404
    assert client.delete(f"/api/library/save/{pid}", headers=h).status_code == 200


@pytest.mark.parametrize("identifier, status", [
    ("hello world", 422),                          # not an identifier
    ("http://127.0.0.1:8000/api/users", 404),      # private network address is never fetched
    ("http://localhost/secret", 404),
])
def test_save_by_identifier_rejects_bad_input(client, member, identifier, status):
    assert client.post("/api/library/save-by-identifier", json={"identifier": identifier}, headers=member["headers"]).status_code == status


def test_save_by_identifier_finds_existing_doi_without_network(client, member):
    with _db() as conn, conn.cursor() as cur:
        cur.execute("SELECT paper_id::text, doi FROM papers WHERE doi IS NOT NULL LIMIT 1")
        pid, doi = cur.fetchone()
    r = client.post("/api/library/save-by-identifier", json={"identifier": f"https://doi.org/{doi}"}, headers=member["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["created"] is False and r.json()["paper"]["paper_id"] == pid
    client.delete(f"/api/library/save/{pid}", headers=member["headers"])


def test_paper_detail_lists_sources(client):
    with _db() as conn, conn.cursor() as cur:
        cur.execute("""SELECT paper_id::text FROM paper_sources GROUP BY paper_id
                       HAVING COUNT(DISTINCT source_name) > 1 LIMIT 1""")
        row = cur.fetchone()
    if not row:
        pytest.skip("no merged multi-source paper in this database")
    records = client.get(f"/api/papers/{row[0]}").json()["source_records"]
    assert len({r["source_name"] for r in records}) > 1


# ---------------------------------------------------------------- F5 search

def test_search_has_four_panels_and_logs_the_member(client, member):
    r = client.get("/api/search", params={"q": "protein folding"}, headers=member["headers"])
    assert r.status_code == 200
    panels = r.json()["panels"]
    assert set(panels) == {"external_sources", "chanakya_library", "people", "posts"}
    assert panels["external_sources"] or panels["chanakya_library"]
    first = (panels["external_sources"] or panels["chanakya_library"])[0]
    assert "protein" in first["canonical_title"].lower() or any("protein" in t.lower() for t in first["topics"] or [])
    assert {"sources", "item_type", "rrf_score"} <= set(first)
    with _db() as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 FROM activity_events WHERE event_type = 'search' AND user_id = %s::uuid AND search_query = %s",
                    (member["user_id"], "protein folding"))
        assert cur.fetchone()


# ---------------------------------------------------------------- F6 recommendations

def test_recommendations_are_private(client, member, other_member, admin_headers):
    uid = member["user_id"]
    assert client.get(f"/api/recommendations/{uid}").status_code == 401
    assert client.get(f"/api/recommendations/{uid}", headers=other_member["headers"]).status_code == 403
    assert client.get(f"/api/recommendations/{uid}", headers=admin_headers).status_code == 200
    r = client.get(f"/api/recommendations/{uid}", headers=member["headers"])
    assert r.status_code == 200
    papers = r.json()["recommended_papers"]
    assert papers, "a new member still gets content-based (cold start) recommendations"
    assert all(p["reason"] in {"profile", "saved", "co_saved"} for p in papers)


def test_also_saved_always_answers_and_explains(client):
    items = client.get(f"/api/papers/{_library_paper_id()}/also-saved").json()
    assert items
    assert all(i["reason"] in {"association_rule", "co_saved", "similar"} for i in items)


# ---------------------------------------------------------------- F7 trends and moderation

def test_trends_are_public_and_ignore_tiny_topics(client):
    topics = client.get("/api/trends-and-anomalies").json()["trending_topics"]
    assert all(int(t["recent_7d"]) >= 5 for t in topics)


def test_moderation_is_admin_only(client, member, admin_headers):
    h = member["headers"]
    for method, path in [("get", "/api/alerts"), ("post", "/api/analytics/run-spike-scan"), ("post", "/api/analytics/run-spam-job")]:
        assert getattr(client, method)(path).status_code == 401, path
        assert getattr(client, method)(path, headers=h).status_code == 403, path
    assert client.get("/api/alerts", headers=admin_headers).status_code == 200
    assert client.post(f"/api/alerts/{ZERO}/resolve", json={"action": "dismiss"}, headers=admin_headers).status_code == 404


# ---------------------------------------------------------------- F9 analytics

def test_drilldown_university_school_topic_member(client, admin_headers):
    top = client.get("/api/analytics/drilldown", headers=admin_headers).json()
    assert top["level"] == "school" and top["data"]
    school = top["data"][0]["school"]
    mid = client.get("/api/analytics/drilldown", params={"school": school}, headers=admin_headers).json()
    assert mid["level"] == "topic" and mid["data"]
    topic = mid["data"][0]["topic_name"]
    low = client.get("/api/analytics/drilldown", params={"school": school, "topic": topic}, headers=admin_headers).json()
    assert low["level"] == "member" and low["data"] and low["data"][0]["user_id"]


def test_overview_has_topic_trends_and_top_papers(client, admin_headers):
    body = client.get("/api/analytics/overview", headers=admin_headers).json()
    assert {"topic_trends", "top_saved_papers", "top_discussed_papers", "cross_dept_collaboration"} <= set(body)
    assert body["top_saved_papers"]


def test_analytics_rejects_non_admins(client, member):
    for path in ["/api/analytics/overview", "/api/analytics/drilldown"]:
        assert client.get(path).status_code == 401
        assert client.get(path, headers=member["headers"]).status_code == 403


# ---------------------------------------------------------------- F8 assistant

def test_assistant_refuses_out_of_corpus_library_question(client):
    r = client.post("/api/assistant/ask", json={"question": "Best recipe for sourdough bread in Roman camps?", "library_only": True})
    assert r.status_code == 200
    assert r.json()["citations"] == []


def test_new_accounts_are_cleaned_up_later(client):
    """Sanity check for conftest: test accounts use the reserved domain."""
    acct = new_account(client)
    assert acct["email"].endswith("@tests.crc.invalid")
