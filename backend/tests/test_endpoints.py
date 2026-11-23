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

    print("Testing /api/analytics/drilldown...")
    d_univ = client.get("/api/analytics/drilldown")
    assert d_univ.status_code == 200
    assert d_univ.json()["level"] == "school"
    d_dept = client.get("/api/analytics/drilldown?school=School%20of%20Technology%20%26%20AI")
    assert d_dept.status_code == 200
    assert d_dept.json()["level"] == "department"
    d_memb = client.get("/api/analytics/drilldown?department=Computer%20Science%20%26%20AI")
    assert d_memb.status_code == 200
    assert d_memb.json()["level"] == "member"
    print("    -> 3-level University -> School -> Department -> Member drilldown passed!")

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
    alerts_resp = client.get("/api/alerts")
    assert alerts_resp.status_code == 200
    print(f"    -> Persisted system alerts fetched: {len(alerts_resp.json())} alerts found.")

    print("\nALL SYSTEM TESTS PASSED CLEANLY!")

if __name__ == "__main__":
    test_full_pipeline()
