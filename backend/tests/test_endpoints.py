import os
import sys
from uuid import uuid4
from fastapi.testclient import TestClient
from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, os.path.abspath("backend"))

from main import app

client = TestClient(app)

def test_full_pipeline():
    print("Testing Auth Registration...")
    reg_id = f"24CU{uuid4().hex[:4]}"
    reg_email = f"test_{uuid4().hex[:6]}@chanakyauniversity.edu.in"
    reg_resp = client.post("/api/auth/register", json={
        "university_id": reg_id,
        "full_name": "Test Scholar",
        "email": reg_email,
        "password": "Password123!",
        "role": "researcher",
        "department": "School of Engineering",
        "bio": "Researching intelligent commons.",
        "interest_tags": ["data mining", "graph neural networks"]
    })
    assert reg_resp.status_code == 200, f"Register failed: {reg_resp.text}"
    auth_data = reg_resp.json()
    token = auth_data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("    -> Registration & JWT generation passed!")

    print("Testing Auth Login...")
    login_resp = client.post("/api/auth/login", json={
        "identifier": reg_email,
        "passcode": "Password123!"
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    print("    -> Login passed!")

    print("Testing /api/auth/me...")
    me_resp = client.get("/api/auth/me", headers=headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["university_id"] == reg_id
    print("    -> /api/auth/me passed!")

    print("Testing admin endpoints reject non-admins...")
    assert client.get("/api/admin/overview").status_code == 401
    assert client.get("/api/admin/overview", headers=headers).status_code == 403
    assert client.get("/api/admin/members", headers=headers).status_code == 403
    print("    -> /api/admin/* is admin-only!")

    print("Testing Topic Follow...")
    tf_resp = client.post("/api/topics/graph%20neural%20networks/follow", headers=headers)
    assert tf_resp.status_code == 200
    assert tf_resp.json()["status"] == "following"
    print("    -> Follow topic passed!")

    print("Testing /api/users/me/follows...")
    follows_resp = client.get("/api/users/me/follows", headers=headers)
    assert follows_resp.status_code == 200
    assert "graph neural networks" in follows_resp.json()["followed_topics"]
    print("    -> /api/users/me/follows passed!")

    print("Testing analytics is admin-only...")
    for path in ("/api/analytics/overview", "/api/analytics/drilldown", "/api/analytics/topic-associations", "/api/analytics/researcher-archetypes", "/api/analytics/anomalies"):
        assert client.get(path).status_code == 401, path
        assert client.get(path, headers=headers).status_code == 403, path
    print("    -> /api/analytics/* rejects anonymous and non-admin users!")

    print("Testing post create / vote / edit / delete...")
    created = client.post("/api/posts", json={"title": "Draft title", "body": "Draft body", "tags": ["testing"]}, headers=headers)
    assert created.status_code == 200, created.text
    post_id = created.json()["post_id"]
    up = client.post(f"/api/posts/{post_id}/vote", json={"value": 1}, headers=headers).json()
    assert up["upvote_count"] == 1 and up["my_vote"] == 1
    flip = client.post(f"/api/posts/{post_id}/vote", json={"value": -1}, headers=headers).json()
    assert flip["upvote_count"] == -1 and flip["my_vote"] == -1
    clear = client.post(f"/api/posts/{post_id}/vote", json={"value": 0}, headers=headers).json()
    assert clear["upvote_count"] == 0 and clear["my_vote"] == 0
    assert client.get(f"/api/posts/{post_id}").json().get("edited_at") is None
    edited = client.patch(f"/api/posts/{post_id}", json={"title": "Final title", "body": "Final body"}, headers=headers)
    assert edited.status_code == 200 and edited.json()["edited_at"], edited.text
    assert client.get(f"/api/posts/{post_id}").json()["edited_at"]
    other = client.post("/api/auth/register", json={
        "university_id": f"24CU{uuid4().hex[:4]}", "full_name": "Other Scholar", "email": f"o_{uuid4().hex[:6]}@chanakyauniversity.edu.in",
        "password": "Password123!", "role": "student", "department": "School of Engineering"}).json()
    other_headers = {"Authorization": f"Bearer {other['access_token']}"}
    assert client.patch(f"/api/posts/{post_id}", json={"title": "Hijack"}, headers=other_headers).status_code == 403
    assert client.delete(f"/api/posts/{post_id}", headers=other_headers).status_code == 403
    assert client.delete(f"/api/posts/{post_id}", headers=headers).status_code == 200
    assert client.get(f"/api/posts/{post_id}").status_code == 404
    print("    -> vote deltas, author-only edit (with edited_at) and delete passed!")

    print("Testing collections create / rename / list / delete...")
    col = client.post("/api/collections", json={"name": "Reading list", "description": "to read"}, headers=headers)
    assert col.status_code == 200, col.text
    cid = col.json()["collection_id"]
    assert client.patch(f"/api/collections/{cid}", json={"name": "Renamed"}, headers=headers).json()["name"] == "Renamed"
    assert client.patch(f"/api/collections/{cid}", json={"name": "Nope"}, headers=other_headers).status_code == 404
    mine = client.get(f"/api/users/{me_resp.json()['user_id']}/collections").json()
    assert any(c["collection_id"] == cid and c["name"] == "Renamed" for c in mine)
    assert client.get(f"/api/collections/{cid}/papers").json()["papers"] == []
    assert client.delete(f"/api/collections/{cid}", headers=other_headers).status_code == 404
    assert client.delete(f"/api/collections/{cid}", headers=headers).status_code == 200
    assert client.get(f"/api/collections/{cid}/papers").status_code == 404
    print("    -> collection CRUD passed!")

    print("Testing Grounded Assistant Refusal Gate (Trap Query)...")
    ask_resp = client.post("/api/assistant/ask", json={
        "question": "What is the secret recipe for traditional sourdough bread in Roman military camps?",
        # Library-only keeps the strict refusal; without it the assistant answers open questions from general knowledge.
        "library_only": True,
    })
    assert ask_resp.status_code == 200
    resp_body = ask_resp.json()
    assert "Insufficient evidence in the Chanakya University repository" in resp_body["answer"], f"Expected refusal, got: {resp_body['answer']}"
    assert resp_body["citations"] == []
    print("    -> Grounded Assistant refusal gate passed!")

    print("Testing /api/alerts...")
    # Alerts name flagged members, so only admins may read or act on them.
    assert client.get("/api/alerts").status_code == 401
    assert client.get("/api/alerts", headers=headers).status_code == 403
    assert client.post("/api/analytics/run-spike-scan", headers=headers).status_code == 403
    assert client.post("/api/admin/members/00000000-0000-0000-0000-000000000000/spam", json={"flagged": False}, headers=headers).status_code == 403
    print("    -> /api/alerts and moderation actions are admin-only!")

    print("Testing private notes and save-by-identifier validation...")
    assert client.patch("/api/library/save/00000000-0000-0000-0000-000000000000", json={"private_notes": "x"}, headers=headers).status_code == 404
    assert client.post("/api/library/save-by-identifier", json={"identifier": "not an identifier"}, headers=headers).status_code == 422
    assert client.post("/api/library/save-by-identifier", json={"identifier": "http://127.0.0.1:8000/api/users"}, headers=headers).status_code == 404
    print("    -> notes require a save; bad identifiers and private-network links are refused!")

    print("\nALL SYSTEM TESTS PASSED CLEANLY!")

if __name__ == "__main__":
    test_full_pipeline()
