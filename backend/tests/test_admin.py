"""Admin dashboard: Chanakya holdings, member posts, roles, and post domains."""
from uuid import uuid4

HOLDING = {
    "title": "Admin posted holding for tests",
    "abstract": "A record posted straight into the Chanakya holdings from the dashboard.",
    "authors": ["Test Author", "Second Author"],
    "publication_year": 2025,
    "venue": "Chanakya Test Journal",
    "doi": "",
    "arxiv_id": "",
    "url": "https://example.org/holding",
    "item_type": "article",
    "school": "School of Engineering",
    "topics": ["digital humanities", "metadata"],
}


def test_holdings_are_admin_only(client, member):
    assert client.get("/api/admin/holdings", headers=member["headers"]).status_code == 403
    assert client.post("/api/admin/holdings", json=HOLDING, headers=member["headers"]).status_code == 403


def test_admin_creates_edits_and_deletes_a_holding(client, admin_headers):
    doi = f"10.9999/crc-test-{uuid4().hex[:8]}"
    r = client.post("/api/admin/holdings", json={**HOLDING, "doi": f"https://doi.org/{doi}"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    paper_id = r.json()["paper_id"]
    try:
        page = client.get(f"/api/papers/{paper_id}").json()
        assert page["canonical_title"] == HOLDING["title"] and page["doi"] == doi and page["item_type"] == "article"
        assert page["topics"] == ["digital humanities", "metadata", "School of Engineering"]
        assert any(s["source_name"] == "chanakya" for s in page["source_records"])

        history = client.get("/api/admin/holdings", params={"scope": "posted", "q": doi}, headers=admin_headers).json()
        assert history["total"] == 1 and history["items"][0]["created_by_name"]
        holdings = client.get("/api/library", params={"limit": 1000}).json()
        assert any(str(p["paper_id"]) == paper_id for p in holdings)          # in Library → Chanakya holdings

        # Same DOI again is refused rather than duplicated.
        assert client.post("/api/admin/holdings", json={**HOLDING, "doi": doi}, headers=admin_headers).status_code == 409

        edited = {**HOLDING, "title": "Edited admin holding", "doi": doi, "school": "School of Biosciences", "topics": []}
        assert client.patch(f"/api/admin/holdings/{paper_id}", json=edited, headers=admin_headers).status_code == 200
        page = client.get(f"/api/papers/{paper_id}").json()
        assert page["canonical_title"] == "Edited admin holding" and page["topics"] == ["School of Biosciences"]

        assert client.post("/api/admin/holdings", json={**HOLDING, "school": "Not a school"}, headers=admin_headers).status_code == 422
    finally:
        assert client.delete(f"/api/admin/holdings/{paper_id}", headers=admin_headers).status_code == 200
    assert client.get(f"/api/papers/{paper_id}").status_code == 404
    assert client.delete(f"/api/admin/holdings/{paper_id}", headers=admin_headers).status_code == 404


def test_admin_sees_edits_and_deletes_member_posts(client, member, other_member, admin_headers):
    r = client.post("/api/posts", json={"title": "Member post", "body": "Body.", "tags": ["Chemistry", "not a domain"]}, headers=member["headers"])
    assert r.status_code == 200, r.text
    post_id = str(r.json()["post_id"])

    posts = client.get(f"/api/admin/members/{member['user_id']}/posts", headers=admin_headers).json()
    assert [p["post_id"] for p in posts] == [post_id] and posts[0]["tags"] == ["Chemistry"]   # unknown tags dropped
    assert client.get(f"/api/admin/members/{member['user_id']}/posts", headers=other_member["headers"]).status_code == 403

    # Another member can't edit it; an admin can.
    assert client.patch(f"/api/posts/{post_id}", json={"title": "Hijack"}, headers=other_member["headers"]).status_code == 403
    r = client.patch(f"/api/posts/{post_id}", json={"title": "Moderated", "tags": ["Education"]}, headers=admin_headers)
    assert r.status_code == 200 and r.json()["title"] == "Moderated" and r.json()["tags"] == ["Education"]

    assert client.delete(f"/api/posts/{post_id}", headers=admin_headers).status_code == 200
    assert client.get(f"/api/admin/members/{member['user_id']}/posts", headers=admin_headers).json() == []


def test_admin_changes_roles_but_not_their_own(client, member, admin_headers):
    r = client.patch(f"/api/admin/members/{member['user_id']}/role", json={"role": "faculty"}, headers=admin_headers)
    assert r.status_code == 200 and r.json()["role"] == "faculty"
    assert client.get("/api/auth/me", headers=member["headers"]).json()["role"] == "faculty"
    assert client.patch(f"/api/admin/members/{member['user_id']}/role", json={"role": "king"}, headers=admin_headers).status_code == 422
    assert client.patch(f"/api/admin/members/{member['user_id']}/role", json={"role": "admin"}, headers=member["headers"]).status_code == 403
    me = client.get("/api/auth/me", headers=admin_headers).json()
    assert client.patch(f"/api/admin/members/{me['user_id']}/role", json={"role": "student"}, headers=admin_headers).status_code == 422
