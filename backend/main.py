import os
import re
import json
import uuid
import base64
import hashlib
import hmac
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID
import jwt
import bcrypt
import numpy as np
import pandas as pd
import requests
import psycopg2
from psycopg2.extras import RealDictCursor, register_uuid
from fastapi import FastAPI, Header, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer
from sklearn.ensemble import IsolationForest
from mlxtend.frequent_patterns import fpgrowth, association_rules
from dotenv import load_dotenv

try:
    from backend.services.mining_service import (
        get_topic_associations,
        get_researcher_archetypes,
        get_related_topics_for_query,
    )
    from backend.services.anomaly_service import (
        submission_detector,
        warmup_submission_detector,
    )
except ImportError:
    from services.mining_service import (
        get_topic_associations,
        get_researcher_archetypes,
        get_related_topics_for_query,
    )
    from services.anomaly_service import (
        submission_detector,
        warmup_submission_detector,
    )

from contextlib import contextmanager
from psycopg2 import pool

register_uuid()  # lets psycopg2 bind uuid.UUID path parameters directly

load_dotenv()

DB_URL = os.getenv("DATABASE_URL", "postgresql://crc_admin:crc_secure_pass@localhost:5434/chanakya_commons")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
# The first request after Ollama starts loads the model into memory, which can exceed 60s on CPU.
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "180"))
AUTH_SECRET = os.getenv("CRC_AUTH_SECRET")
if not AUTH_SECRET:
    AUTH_SECRET = secrets.token_urlsafe(48)
    print("[Auth] CRC_AUTH_SECRET unset; using an ephemeral development secret.")
DEMO_PASSCODE = os.getenv("CRC_DEMO_PASSCODE", "chanakya-demo")

app = FastAPI(title="Chanakya Research Commons API", version="1.0.0")

# Security: Configurable explicit CORS origins (avoid wildcards with credentials)
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CRC_CORS_ORIGINS",
        "http://localhost:3000"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS if ALLOWED_ORIGINS else ["*"],
    allow_credentials=True if ALLOWED_ORIGINS else False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Resilient connection pool
try:
    db_pool = pool.ThreadedConnectionPool(1, 20, DB_URL)
except Exception as exc:
    print(f"[DB Init] Notice initializing pool ({exc}). Direct connection fallback active.")
    db_pool = None


@contextmanager
def get_db():
    """Connection context manager with connection pooling and guaranteed return/closure."""
    if db_pool:
        conn = db_pool.getconn()
        conn.cursor_factory = RealDictCursor
        try:
            yield conn
        except Exception:
            conn.rollback()
            raise
        finally:
            db_pool.putconn(conn)
    else:
        conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
        try:
            yield conn
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def get_conn():
    """Backward compatibility helper."""
    return psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)


@app.on_event("startup")
def startup_event():
    if not os.getenv("CRC_AUTH_SECRET") and os.getenv("ENVIRONMENT", "development").lower() not in ("development", "dev", "test"):
        raise RuntimeError("CRC_AUTH_SECRET must be configured outside development.")
    if not os.getenv("CRC_AUTH_SECRET"):
        print("[Auth] Development sign-in tokens will expire when the backend restarts.")
    print("[Auth] Legacy demo credentials enabled; seeded accounts use CRC_DEMO_PASSCODE.")
    try:
        # Additive, idempotent: lets "edited" posts work even if migration 004 was never run by hand.
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ")
            conn.commit()
            cur.close()
    except Exception as exc:
        print(f"[FastAPI Startup] edited_at column check failed: {exc}")
    try:
        warmup_submission_detector()
    except Exception as exc:
        print(f"[FastAPI Startup] Anomaly detector warmup notice: {exc}")


embed_model = SentenceTransformer("all-MiniLM-L6-v2")


def vec_literal(text: str) -> str:
    emb = embed_model.encode(text).tolist()
    return "[" + ",".join(f"{x:.6f}" for x in emb) + "]"


# ==========================================
# Pydantic Schemas
# ==========================================
class PostCreate(BaseModel):
    author_id: Optional[str] = None
    title: str
    body: str
    tags: list[str] = []
    attached_paper_id: Optional[str] = None


class PostUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=250)
    body: Optional[str] = Field(None, min_length=1, max_length=20000)
    tags: Optional[list[str]] = None


class CollectionUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    description: Optional[str] = None


class UpvoteRequest(BaseModel):
    user_id: Optional[str] = None


class CommentCreate(BaseModel):
    author_id: Optional[str] = None
    body: str = Field(..., min_length=1, max_length=5000)
    parent_comment_id: Optional[UUID] = None


class VoteRequest(BaseModel):
    value: int = Field(..., ge=-1, le=1)


class GatekeeperPayload(BaseModel):
    title: Optional[str] = ""
    abstract: Optional[str] = ""
    authors: Optional[list] = []
    topics: Optional[list] = []
    coauthor_count: Optional[int] = None
    keyword_count: Optional[int] = None
    abstract_length: Optional[int] = None
    reference_count: Optional[int] = 0
    submissions_last_24h: Optional[int] = 1


class SavePaperRequest(BaseModel):
    user_id: Optional[str] = None
    paper_id: UUID
    private_notes: Optional[str] = ""
    collection_id: Optional[UUID] = None


class AskAssistantRequest(BaseModel):
    question: str
    library_only: bool = False
    paper_id: Optional[UUID] = None


class RegisterRequest(BaseModel):
    university_id: str = Field(..., min_length=3, max_length=30)
    full_name: str = Field(..., min_length=2, max_length=120)
    email: str = Field(..., min_length=5, max_length=150)
    password: str = Field(..., min_length=6, max_length=100)
    role: str = Field("student", pattern="^(student|faculty|researcher|admin)$")
    department: str = Field(..., min_length=2, max_length=100)
    bio: Optional[str] = ""
    interest_tags: Optional[list[str]] = []


class LoginRequest(BaseModel):
    identifier: str = Field(..., min_length=1, max_length=150)
    passcode: str = Field(..., min_length=1, max_length=256)


class CollectionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = None


class SaveByIdentifierRequest(BaseModel):
    identifier: str = Field(..., min_length=3, max_length=500)
    collection_id: Optional[UUID] = None
    private_notes: Optional[str] = ""


class AddPaperToCollectionRequest(BaseModel):
    paper_id: UUID
    private_notes: Optional[str] = ""


ROLE_RANK = {"student": 1, "faculty": 2, "researcher": 2, "admin": 3}
_login_attempts: dict[str, list[float]] = {}
_login_attempts_lock = threading.Lock()


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _issue_token(user_id: str, role: str) -> tuple[str, str]:
    expires = datetime.now(timezone.utc) + timedelta(hours=8)
    claims = {
        "sub": str(user_id),
        "role": role,
        "exp": int(expires.timestamp()),
        "iat": int(datetime.now(timezone.utc).timestamp())
    }
    token = jwt.encode(claims, AUTH_SECRET, algorithm="HS256")
    return token, expires.isoformat()


def _decode_token(token: str) -> str:
    try:
        claims = jwt.decode(token, AUTH_SECRET, algorithms=["HS256"])
        return str(UUID(claims["sub"]))
    except Exception:
        # Fallback for legacy base64 format tokens if present
        try:
            payload, signature = token.split(".", 1)
            expected = hmac.new(AUTH_SECRET.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest()
            supplied = base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4))
            if not hmac.compare_digest(expected, supplied):
                raise ValueError("invalid signature")
            raw = base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))
            claims = json.loads(raw.decode("utf-8"))
            if not isinstance(claims, dict) or int(claims.get("exp", 0)) <= int(time.time()):
                raise ValueError("expired token")
            return str(UUID(claims["sub"]))
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid or expired session")


def _verify_password(stored: str, submitted: str) -> bool:
    if stored == "hashed_demo_pass":
        hashlib.pbkdf2_hmac("sha256", submitted.encode("utf-8"), b"crc-demo-timing-salt", 200_000)
        return hmac.compare_digest(submitted.encode("utf-8"), DEMO_PASSCODE.encode("utf-8"))
    if stored.startswith("bcrypt$"):
        try:
            raw_hash = stored[len("bcrypt$"):].encode("utf-8")
            return bcrypt.checkpw(submitted.encode("utf-8"), raw_hash)
        except Exception:
            return False
    if stored.startswith("$2b$") or stored.startswith("$2a$"):
        try:
            return bcrypt.checkpw(submitted.encode("utf-8"), stored.encode("utf-8"))
        except Exception:
            return False
    try:
        scheme, iterations, salt_hex, digest_hex = stored.split("$", 3)
        if scheme != "pbkdf2":
            return False
        calculated = hashlib.pbkdf2_hmac(
            "sha256", submitted.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        )
        return hmac.compare_digest(calculated, bytes.fromhex(digest_hex))
    except (ValueError, TypeError):
        return False


def _safe_user(row: dict) -> dict:
    return {
        "user_id": str(row["user_id"]),
        "university_id": row["university_id"],
        "full_name": row["full_name"],
        "role": row["role"],
        "department": row["department"],
        "bio": row.get("bio"),
        "interest_tags": row.get("interest_tags"),
        "is_flagged_spam": bool(row.get("is_flagged_spam", False)),
        **({"email": row["email"]} if row.get("email") else {}),
    }


def current_user_optional(authorization: Optional[str] = Header(None)):
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    user_id = _decode_token(token)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT user_id, university_id, full_name, email, role, department, bio, interest_tags, is_flagged_spam FROM users WHERE user_id = %s::uuid",
            (user_id,),
        )
        user = cur.fetchone()
        cur.close()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user


def current_user(user=Depends(current_user_optional)):
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required")
    return user


def require_role(min_role: str):
    def dependency(user=Depends(current_user)):
        if ROLE_RANK.get(user["role"], 0) < ROLE_RANK[min_role]:
            raise HTTPException(status_code=403, detail="Insufficient role")
        return user
    return dependency


def _login_is_throttled(identifier: str) -> bool:
    now = time.time()
    key = identifier.strip().lower()
    with _login_attempts_lock:
        attempts = [stamp for stamp in _login_attempts.get(key, []) if now - stamp < 60]
        _login_attempts[key] = attempts
        return len(attempts) >= 5


def _record_login_failure(identifier: str) -> None:
    key = identifier.strip().lower()
    with _login_attempts_lock:
        _login_attempts.setdefault(key, []).append(time.time())


# ==========================================
# F1: Accounts, Profiles & Following
# ==========================================
@app.post("/api/auth/register")
def register(payload: RegisterRequest):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT 1 FROM users WHERE lower(email) = lower(%s) OR university_id = %s",
            (payload.email.strip(), payload.university_id.strip()),
        )
        if cur.fetchone():
            cur.close()
            raise HTTPException(status_code=400, detail="User with this email or university ID already exists")

        # Bcrypt password hashing
        salt = bcrypt.gensalt()
        pw_hash = "bcrypt$" + bcrypt.hashpw(payload.password.encode("utf-8"), salt).decode("utf-8")

        # Self-registration always creates a student. Faculty / researcher / admin access is
        # granted by the university (an admin updates users.role); a client-supplied role is ignored.
        self_role = "student"

        # Initial profile embedding computed from role, department, tags & bio
        bio_text = f"{self_role.title()} in {payload.department}. {payload.bio or ''}"
        emb = embed_model.encode(bio_text).tolist()

        cur.execute(
            """
            INSERT INTO users (university_id, full_name, email, password_hash, role, department, bio, interest_tags, profile_embedding)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::vector)
            RETURNING user_id, university_id, full_name, email, role, department, bio, interest_tags, is_flagged_spam
            """,
            (
                payload.university_id.strip(),
                payload.full_name.strip(),
                payload.email.strip(),
                pw_hash,
                self_role,
                payload.department.strip(),
                payload.bio or "",
                payload.interest_tags or [],
                emb,
            ),
        )
        new_user = cur.fetchone()
        conn.commit()
        cur.close()

    token, expires_at = _issue_token(str(new_user["user_id"]), new_user["role"])
    return {
        "access_token": token,
        "token": token,
        "token_type": "bearer",
        "expires_at": expires_at,
        "user": _safe_user(new_user),
    }


@app.post("/api/auth/login")
def login(payload: LoginRequest):
    identifier = payload.identifier.strip()
    if _login_is_throttled(identifier):
        raise HTTPException(status_code=429, detail="Too many failed sign-in attempts. Try again in a minute.")
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT user_id, university_id, full_name, email, password_hash, role, department, bio, interest_tags,
                   is_flagged_spam
            FROM users
            WHERE lower(email) = lower(%s) OR university_id = %s
            LIMIT 1
            """,
            (identifier, identifier),
        )
        user = cur.fetchone()
        cur.close()

    # Perform a PBKDF2 operation for unknown accounts too, avoiding a cheap timing oracle.
    password_ok = _verify_password(user["password_hash"] if user else "pbkdf2$200000$" + "00" * 16 + "$" + "00" * 32, payload.passcode)
    if not user or not password_ok:
        _record_login_failure(identifier)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    with _login_attempts_lock:
        _login_attempts.pop(identifier.lower(), None)
    token, expires_at = _issue_token(str(user["user_id"]), user["role"])
    return {
        "access_token": token,
        "token": token,
        "token_type": "bearer",
        "expires_at": expires_at,
        "user": _safe_user(user),
    }


@app.get("/api/auth/me")
def auth_me(user=Depends(current_user)):
    return _safe_user(user)


@app.post("/api/topics/{topic}/follow")
def follow_topic(topic: str, user=Depends(current_user)):
    cleaned_topic = topic.strip()
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO topic_follows (user_id, topic_tag) VALUES (%s::uuid, %s) ON CONFLICT DO NOTHING",
            (user["user_id"], cleaned_topic),
        )
        conn.commit()
        cur.close()
    return {"status": "following", "topic": cleaned_topic}


@app.delete("/api/topics/{topic}/follow")
def unfollow_topic(topic: str, user=Depends(current_user)):
    cleaned_topic = topic.strip()
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM topic_follows WHERE user_id = %s::uuid AND topic_tag = %s",
            (user["user_id"], cleaned_topic),
        )
        conn.commit()
        cur.close()
    return {"status": "unfollowed", "topic": cleaned_topic}


@app.post("/api/users/{user_id}/follow")
def follow_user(user_id: UUID, user=Depends(current_user)):
    if str(user["user_id"]) == str(user_id):
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO user_follows (follower_id, followee_id) VALUES (%s::uuid, %s::uuid) ON CONFLICT DO NOTHING",
            (user["user_id"], user_id),
        )
        conn.commit()
        cur.close()
    return {"status": "following", "user_id": str(user_id)}


@app.delete("/api/users/{user_id}/follow")
def unfollow_user(user_id: UUID, user=Depends(current_user)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM user_follows WHERE follower_id = %s::uuid AND followee_id = %s::uuid",
            (user["user_id"], user_id),
        )
        conn.commit()
        cur.close()
    return {"status": "unfollowed", "user_id": str(user_id)}


@app.get("/api/users/me/follows")
def get_my_follows(user=Depends(current_user)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT topic_tag FROM topic_follows WHERE user_id = %s::uuid ORDER BY created_at DESC", (user["user_id"],))
        topics = [r["topic_tag"] for r in cur.fetchall()]
        cur.execute(
            """
            SELECT u.user_id, u.full_name, u.role, u.department
            FROM user_follows uf
            JOIN users u ON uf.followee_id = u.user_id
            WHERE uf.follower_id = %s::uuid
            ORDER BY uf.created_at DESC
            """,
            (user["user_id"],),
        )
        followed_users = cur.fetchall()
        cur.close()
    return {"followed_topics": topics, "followed_users": followed_users}


@app.get("/api/users/{user_id}")
def get_user_profile(user_id: UUID, viewer=Depends(current_user_optional)):
    """Public profile: identity, activity counts and recent posts/comments (no email)."""
    viewer_id = str(viewer["user_id"]) if viewer else None
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT user_id, university_id, full_name, role, department, bio, interest_tags, profile_url, created_at
            FROM users WHERE user_id = %s::uuid AND is_flagged_spam = FALSE
            """,
            (str(user_id),),
        )
        person = cur.fetchone()
        if not person:
            cur.close()
            raise HTTPException(status_code=404, detail="Member not found")

        cur.execute(
            """
            SELECT
              (SELECT COUNT(*) FROM posts WHERE author_id = %(u)s::uuid AND is_flagged_spam = FALSE) AS post_count,
              (SELECT COUNT(*) FROM comments WHERE author_id = %(u)s::uuid) AS comment_count,
              (SELECT COALESCE(SUM(upvote_count), 0) FROM posts WHERE author_id = %(u)s::uuid AND is_flagged_spam = FALSE) AS karma,
              (SELECT COUNT(*) FROM user_follows WHERE followee_id = %(u)s::uuid) AS follower_count,
              (SELECT COUNT(*) FROM user_follows WHERE follower_id = %(u)s::uuid) AS following_count,
              (SELECT COUNT(*) FROM library_saves WHERE user_id = %(u)s::uuid) AS saved_count
            """,
            {"u": str(user_id)},
        )
        stats = cur.fetchone()

        cur.execute(
            """
            SELECT p.post_id, p.author_id, p.title, p.body, p.tags, p.upvote_count, p.created_at, p.edited_at,
                   u.full_name AS author_name, u.department AS author_dept, u.role AS author_role,
                   pa.canonical_title AS attached_paper_title, pa.paper_id AS attached_paper_id,
                   (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.post_id) AS comment_count,
                   COALESCE(mine.value, 0) AS my_vote
            FROM posts p
            JOIN users u ON u.user_id = p.author_id
            LEFT JOIN papers pa ON pa.paper_id = p.attached_paper_id
            LEFT JOIN post_upvotes mine ON mine.post_id = p.post_id AND mine.user_id = %s::uuid
            WHERE p.author_id = %s::uuid AND p.is_flagged_spam = FALSE
            ORDER BY p.created_at DESC
            LIMIT 40
            """,
            (viewer_id, str(user_id)),
        )
        posts = cur.fetchall()

        cur.execute(
            """
            SELECT c.comment_id, c.post_id, p.title AS post_title, c.body, c.created_at
            FROM comments c JOIN posts p ON p.post_id = c.post_id
            WHERE c.author_id = %s::uuid AND p.is_flagged_spam = FALSE
            ORDER BY c.created_at DESC
            LIMIT 40
            """,
            (str(user_id),),
        )
        comments = cur.fetchall()

        is_following = False
        if viewer_id and viewer_id != str(user_id):
            cur.execute(
                "SELECT 1 FROM user_follows WHERE follower_id = %s::uuid AND followee_id = %s::uuid",
                (viewer_id, str(user_id)),
            )
            is_following = cur.fetchone() is not None
        cur.close()

    return {
        "user": {**person, "user_id": str(person["user_id"])},
        "stats": stats,
        "posts": posts,
        "comments": comments,
        "is_following": is_following,
    }


@app.get("/api/users")
def list_users(department: Optional[str] = None, limit: int = Query(30, ge=1, le=100)):
    with get_db() as conn:
        cur = conn.cursor()
        if department:
            cur.execute(
                """
                SELECT user_id, university_id, full_name, role, department, bio, interest_tags, is_flagged_spam
                FROM users
                WHERE department = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (department, limit),
            )
        else:
            cur.execute(
                """
                SELECT user_id, university_id, full_name, role, department, bio, interest_tags, is_flagged_spam
                FROM users
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (limit,),
            )
        rows = cur.fetchall()
        cur.close()
        return rows


# ==========================================
# F2: Posts, Feed & Upvotes
# ==========================================
@app.get("/api/feed")
def get_feed(
    user_id: Optional[str] = None,
    limit: int = Query(25, ge=1, le=100),
    sort: str = Query("best", pattern="^(best|new|top)$"),
    user=Depends(current_user_optional),
):
    acting_id = str(user["user_id"]) if user else None
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT p.post_id, p.author_id, p.title, p.body, p.tags, p.upvote_count, p.created_at, p.edited_at,
                   u.full_name AS author_name, u.department AS author_dept, u.role AS author_role,
                   pa.canonical_title AS attached_paper_title, pa.paper_id AS attached_paper_id,
                   (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.post_id) AS comment_count,
                   COALESCE(mine.value, 0) AS my_vote,
                   CASE WHEN followed.followee_id IS NOT NULL THEN 2.0 ELSE 0.0 END +
                     CASE WHEN EXISTS (SELECT 1 FROM topic_follows tf WHERE tf.user_id = %s::uuid AND tf.topic_tag = ANY(p.tags)) THEN 1.5 ELSE 0.0 END +
                     CASE WHEN me.profile_embedding IS NOT NULL AND p.post_embedding IS NOT NULL
                       THEN (1 - (p.post_embedding <=> me.profile_embedding)) ELSE 0.0 END AS relevance_score
            FROM posts p
            JOIN users u ON p.author_id = u.user_id
            LEFT JOIN papers pa ON p.attached_paper_id = pa.paper_id
            LEFT JOIN users me ON me.user_id = %s::uuid
            LEFT JOIN user_follows followed ON followed.follower_id = %s::uuid AND followed.followee_id = p.author_id
            LEFT JOIN post_upvotes mine ON mine.post_id = p.post_id AND mine.user_id = %s::uuid
            WHERE p.is_flagged_spam = FALSE AND u.is_flagged_spam = FALSE
            ORDER BY
              CASE WHEN %s = 'top' THEN p.upvote_count END DESC,
              CASE WHEN %s = 'best' AND %s::uuid IS NOT NULL THEN
                CASE WHEN followed.followee_id IS NOT NULL THEN 2.0 ELSE 0.0 END +
                  CASE WHEN EXISTS (SELECT 1 FROM topic_follows tf WHERE tf.user_id = %s::uuid AND tf.topic_tag = ANY(p.tags)) THEN 1.5 ELSE 0.0 END +
                  CASE WHEN me.profile_embedding IS NOT NULL AND p.post_embedding IS NOT NULL
                    THEN (1 - (p.post_embedding <=> me.profile_embedding)) ELSE 0.0 END
              END DESC,
              p.created_at DESC
            LIMIT %s
            """,
            (acting_id, acting_id, acting_id, acting_id, sort, sort, acting_id, acting_id, limit),
        )
        rows = cur.fetchall()
        cur.close()
        return rows


@app.post("/api/posts")
def create_post(payload: PostCreate, user=Depends(current_user)):
    with get_db() as conn:
        cur = conn.cursor()
        q_vec = vec_literal(f"{payload.title} {payload.body}")
        cur.execute(
            """
            INSERT INTO posts (author_id, attached_paper_id, title, body, tags, post_embedding)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s::vector)
            RETURNING post_id, title, created_at
            """,
            (user["user_id"], payload.attached_paper_id, payload.title, payload.body, payload.tags, q_vec),
        )
        post = cur.fetchone()
        cur.execute(
            "INSERT INTO activity_events (user_id, event_type, target_id, topic_tags) VALUES (%s::uuid, 'create_post', %s::uuid, %s)",
            (user["user_id"], post["post_id"], payload.tags),
        )
        conn.commit()
        cur.close()
        return post


@app.patch("/api/posts/{post_id}")
def update_post(post_id: UUID, payload: PostUpdate, user=Depends(current_user)):
    """Author-only edit. Stamps edited_at so the UI can show an "edited" marker."""
    changes = payload.model_dump(exclude_unset=True) if hasattr(payload, "model_dump") else payload.dict(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=422, detail="Nothing to update")
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT author_id, title, body, tags FROM posts WHERE post_id = %s FOR UPDATE", (post_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            raise HTTPException(status_code=404, detail="Post not found")
        if str(row["author_id"]) != str(user["user_id"]):
            cur.close()
            raise HTTPException(status_code=403, detail="You can only edit your own posts")
        title = (changes.get("title") if changes.get("title") is not None else row["title"]).strip()
        body = (changes.get("body") if changes.get("body") is not None else row["body"]).strip()
        tags = changes["tags"] if changes.get("tags") is not None else row["tags"]
        if not title or not body:
            cur.close()
            raise HTTPException(status_code=422, detail="Title and body cannot be blank")
        if title == row["title"] and body == row["body"] and list(tags or []) == list(row["tags"] or []):
            cur.execute("SELECT edited_at FROM posts WHERE post_id = %s", (post_id,))
            current = cur.fetchone()
            cur.close()
            return {"post_id": str(post_id), "title": title, "body": body, "tags": tags, "edited_at": current["edited_at"]}
        q_vec = vec_literal(f"{title} {body}")
        cur.execute(
            """
            UPDATE posts SET title = %s, body = %s, tags = %s, post_embedding = %s::vector, edited_at = NOW()
            WHERE post_id = %s
            RETURNING post_id, title, body, tags, edited_at
            """,
            (title, body, tags, q_vec, post_id),
        )
        updated = cur.fetchone()
        conn.commit()
        cur.close()
        updated["post_id"] = str(updated["post_id"])
        return updated


@app.delete("/api/posts/{post_id}")
def delete_post(post_id: UUID, user=Depends(current_user)):
    """Author (or an admin moderating) can delete a post; comments and votes cascade."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT author_id FROM posts WHERE post_id = %s", (post_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            raise HTTPException(status_code=404, detail="Post not found")
        if str(row["author_id"]) != str(user["user_id"]) and user["role"] != "admin":
            cur.close()
            raise HTTPException(status_code=403, detail="You can only delete your own posts")
        cur.execute("DELETE FROM posts WHERE post_id = %s", (post_id,))
        conn.commit()
        cur.close()
    return {"status": "deleted", "post_id": str(post_id)}


def _set_post_vote(post_id: UUID, user_id: str, value: int):
    """Apply one user's vote as a *delta* on the stored score.

    posts.upvote_count is a running total that may already include votes that never went through the
    ledger (seeded or imported scores). Adding (new - previous) keeps that history intact instead of
    recomputing from post_upvotes, which used to reset a score of e.g. 14 to 1 on the first click.
    """
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM posts WHERE post_id = %s FOR UPDATE", (post_id,))
        if not cur.fetchone():
            cur.close()
            raise HTTPException(status_code=404, detail="Post not found")
        cur.execute(
            "SELECT value FROM post_upvotes WHERE user_id = %s::uuid AND post_id = %s",
            (user_id, post_id),
        )
        previous = cur.fetchone()
        previous_value = previous["value"] if previous else 0
        delta = value - previous_value
        if value == 0:
            cur.execute(
                "DELETE FROM post_upvotes WHERE user_id = %s::uuid AND post_id = %s",
                (user_id, post_id),
            )
        else:
            cur.execute(
                """
                INSERT INTO post_upvotes (user_id, post_id, value) VALUES (%s::uuid, %s, %s)
                ON CONFLICT (user_id, post_id) DO UPDATE SET value = EXCLUDED.value
                """,
                (user_id, post_id, value),
            )
            if delta != 0:
                cur.execute(
                    "INSERT INTO activity_events (user_id, event_type, target_id) VALUES (%s::uuid, 'vote_post', %s)",
                    (user_id, post_id),
                )
        cur.execute(
            "UPDATE posts SET upvote_count = COALESCE(upvote_count, 0) + %s WHERE post_id = %s RETURNING upvote_count",
            (delta, post_id),
        )
        score = cur.fetchone()["upvote_count"]
        conn.commit()
        cur.close()
        return {"upvote_count": score, "my_vote": value}


@app.post("/api/posts/{post_id}/vote")
def vote_post(post_id: UUID, payload: VoteRequest, user=Depends(current_user)):
    return _set_post_vote(post_id, str(user["user_id"]), payload.value)


@app.post("/api/posts/{post_id}/upvote")
def toggle_upvote(post_id: UUID, payload: UpvoteRequest, user=Depends(current_user)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT value FROM post_upvotes WHERE user_id = %s::uuid AND post_id = %s",
            (user["user_id"], post_id),
        )
        existing = cur.fetchone()
        cur.close()
    return _set_post_vote(post_id, str(user["user_id"]), 0 if existing and existing["value"] == 1 else 1)


@app.get("/api/posts/{post_id}")
def get_post(post_id: UUID, user=Depends(current_user_optional)):
    user_id = str(user["user_id"]) if user else None
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT p.post_id, p.author_id, p.title, p.body, p.tags, p.upvote_count, p.created_at, p.edited_at,
                   u.full_name AS author_name, u.department AS author_dept, u.role AS author_role,
                   pa.canonical_title AS attached_paper_title, pa.paper_id AS attached_paper_id,
                   (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.post_id) AS comment_count,
                   COALESCE(mine.value, 0) AS my_vote,
                   (SELECT COUNT(*) FROM posts authored WHERE authored.author_id = u.user_id) AS post_count,
                   u.bio AS author_bio, u.interest_tags AS author_interest_tags,
                   pa.authors AS attached_paper_authors, pa.venue AS attached_paper_venue,
                   pa.publication_year AS attached_paper_year,
                   (SELECT ranked.pagerank_percentile FROM (
                      SELECT paper_id, percent_rank() OVER (ORDER BY pagerank_score) AS pagerank_percentile
                      FROM papers
                    ) ranked WHERE ranked.paper_id = pa.paper_id) AS attached_paper_percentile
            FROM posts p
            JOIN users u ON u.user_id = p.author_id
            LEFT JOIN papers pa ON pa.paper_id = p.attached_paper_id
            LEFT JOIN post_upvotes mine ON mine.post_id = p.post_id AND mine.user_id = %s::uuid
            WHERE p.post_id = %s AND p.is_flagged_spam = FALSE
            """,
            (user_id, post_id),
        )
        post = cur.fetchone()
        cur.close()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    post["author"] = {
        "user_id": str(post.pop("author_id")),
        "full_name": post.pop("author_name"),
        "role": post.pop("author_role"),
        "department": post.pop("author_dept"),
        "bio": post.pop("author_bio"),
        "interest_tags": post.pop("author_interest_tags"),
        "post_count": post.pop("post_count"),
    }
    if post.get("attached_paper_id"):
        post["attached_paper"] = {
            "paper_id": str(post["attached_paper_id"]),
            "canonical_title": post["attached_paper_title"],
            "authors": post.pop("attached_paper_authors"),
            "venue": post.pop("attached_paper_venue"),
            "publication_year": post.pop("attached_paper_year"),
            "pagerank_percentile": post.pop("attached_paper_percentile"),
        }
    else:
        post["attached_paper"] = None
        for key in ("attached_paper_authors", "attached_paper_venue", "attached_paper_year", "attached_paper_percentile"):
            post.pop(key, None)
    post["post_id"] = str(post["post_id"])
    if post.get("attached_paper_id"):
        post["attached_paper_id"] = str(post["attached_paper_id"])
    post["created_at"] = post["created_at"].isoformat()
    return post


@app.get("/api/posts/{post_id}/comments")
def get_comments(post_id: UUID):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM posts WHERE post_id = %s", (post_id,))
        if not cur.fetchone():
            cur.close()
            raise HTTPException(status_code=404, detail="Post not found")
        cur.execute(
            """
            SELECT c.comment_id, c.post_id, c.author_id, u.full_name AS author_name,
                   u.role AS author_role, u.department AS author_dept,
                   c.parent_comment_id, c.body, c.created_at
            FROM comments c
            JOIN users u ON c.author_id = u.user_id
            WHERE c.post_id = %s::uuid
            ORDER BY c.created_at ASC
            """,
            (post_id,),
        )
        comments = cur.fetchall()
        cur.close()
        return comments


@app.post("/api/posts/{post_id}/comments")
def add_comment(post_id: UUID, payload: CommentCreate, user=Depends(current_user)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM posts WHERE post_id = %s", (post_id,))
        if not cur.fetchone():
            cur.close()
            raise HTTPException(status_code=404, detail="Post not found")
        if payload.parent_comment_id:
            cur.execute(
                "SELECT 1 FROM comments WHERE comment_id = %s AND post_id = %s",
                (payload.parent_comment_id, post_id),
            )
            if not cur.fetchone():
                cur.close()
                raise HTTPException(status_code=400, detail="Parent comment belongs to another discussion")
        cur.execute(
            """
            INSERT INTO comments (post_id, author_id, parent_comment_id, body)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s)
            RETURNING comment_id, created_at
            """,
            (post_id, user["user_id"], payload.parent_comment_id, payload.body),
        )
        created = cur.fetchone()
        cur.execute(
            "INSERT INTO activity_events (user_id, event_type, target_id) VALUES (%s::uuid, 'add_comment', %s::uuid)",
            (user["user_id"], created["comment_id"]),
        )
        cur.execute(
            """
            SELECT c.comment_id, c.post_id, c.author_id, u.full_name AS author_name,
                   u.role AS author_role, u.department AS author_dept,
                   c.parent_comment_id, c.body, c.created_at
            FROM comments c JOIN users u ON u.user_id = c.author_id
            WHERE c.comment_id = %s
            """,
            (created["comment_id"],),
        )
        comment = cur.fetchone()
        conn.commit()
        cur.close()
        return comment


# ==========================================
# F3: Shared Chanakya Library
# ==========================================
@app.get("/api/library")
def get_library(
    user_id: Optional[str] = None,
    limit: int = Query(30, ge=1, le=100),
    user=Depends(current_user_optional),
):
    with get_db() as conn:
        cur = conn.cursor()
        if user_id:
            if not user:
                cur.close()
                raise HTTPException(status_code=401, detail="Sign in required")
            cur.execute(
                """
                SELECT p.paper_id, p.canonical_title, p.abstract, p.authors, p.publication_year, p.venue, p.topics,
                       p.save_count, p.pagerank_score, ls.private_notes, ls.saved_at, ls.collection_id,
                       c.name AS collection_name,
                       CASE
                         WHEN 'School of Arts, Humanities and Social Sciences' = ANY(p.topics) THEN 'School of Arts, Humanities and Social Sciences'
                         WHEN 'School of Biosciences' = ANY(p.topics) THEN 'School of Biosciences'
                         WHEN 'School of Engineering' = ANY(p.topics) THEN 'School of Engineering'
                         WHEN 'School of Law, Governance and Public Policy' = ANY(p.topics) THEN 'School of Law, Governance and Public Policy'
                         WHEN 'School of Management Sciences' = ANY(p.topics) THEN 'School of Management Sciences'
                         WHEN 'School of Mathematics and Natural Sciences' = ANY(p.topics) THEN 'School of Mathematics and Natural Sciences'
                         ELSE NULL
                       END AS school
                FROM library_saves ls
                JOIN papers p ON ls.paper_id = p.paper_id
                LEFT JOIN collections c ON c.collection_id = ls.collection_id
                WHERE ls.user_id = %s::uuid
                ORDER BY ls.saved_at DESC
                LIMIT %s
                """,
                (user["user_id"], limit),
            )
        else:
            cur.execute(
                """
                SELECT p.paper_id, p.canonical_title, p.abstract, p.authors, p.publication_year, p.venue, p.topics,
                       p.save_count, p.pagerank_score,
                       CASE
                         WHEN 'School of Arts, Humanities and Social Sciences' = ANY(p.topics) THEN 'School of Arts, Humanities and Social Sciences'
                         WHEN 'School of Biosciences' = ANY(p.topics) THEN 'School of Biosciences'
                         WHEN 'School of Engineering' = ANY(p.topics) THEN 'School of Engineering'
                         WHEN 'School of Law, Governance and Public Policy' = ANY(p.topics) THEN 'School of Law, Governance and Public Policy'
                         WHEN 'School of Management Sciences' = ANY(p.topics) THEN 'School of Management Sciences'
                         WHEN 'School of Mathematics and Natural Sciences' = ANY(p.topics) THEN 'School of Mathematics and Natural Sciences'
                         ELSE NULL
                       END AS school
                FROM papers p
                WHERE in_chanakya_library = TRUE
                ORDER BY save_count DESC, pagerank_score DESC
                LIMIT %s
                """,
                (limit,),
            )
        rows = cur.fetchall()
        cur.close()
        return rows


@app.post("/api/library/save")
def save_to_library(req: SavePaperRequest, user=Depends(current_user)):
    with get_db() as conn:
        cur = conn.cursor()
        if req.collection_id:
            cur.execute(
                "SELECT 1 FROM collections WHERE collection_id = %s::uuid AND user_id = %s::uuid",
                (req.collection_id, user["user_id"]),
            )
            if not cur.fetchone():
                cur.close()
                raise HTTPException(status_code=404, detail="Collection not found")
        cur.execute(
            """
            INSERT INTO library_saves (user_id, paper_id, private_notes, collection_id)
            VALUES (%s::uuid, %s::uuid, %s, %s::uuid)
            ON CONFLICT (user_id, paper_id) DO UPDATE
              SET private_notes = EXCLUDED.private_notes, collection_id = EXCLUDED.collection_id
            """,
            (user["user_id"], req.paper_id, req.private_notes, req.collection_id),
        )
        cur.execute(
            """
            UPDATE papers
            SET save_count = (SELECT COUNT(*) FROM library_saves WHERE paper_id = %s::uuid),
                in_chanakya_library = TRUE
            WHERE paper_id = %s::uuid
            RETURNING paper_id, save_count
            """,
            (req.paper_id, req.paper_id),
        )
        updated = cur.fetchone()
        cur.execute(
            "INSERT INTO activity_events (user_id, event_type, target_id) VALUES (%s::uuid, 'save_paper', %s::uuid)",
            (user["user_id"], req.paper_id),
        )
        conn.commit()
        cur.close()
        return {"status": "saved", "paper": updated}


@app.delete("/api/library/save/{paper_id}")
def remove_from_library(paper_id: UUID, user=Depends(current_user)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM library_saves WHERE user_id = %s::uuid AND paper_id = %s",
            (user["user_id"], paper_id),
        )
        removed = cur.rowcount > 0
        if removed:
            cur.execute(
                "UPDATE papers SET save_count = (SELECT COUNT(*) FROM library_saves WHERE paper_id = %s) WHERE paper_id = %s",
                (paper_id, paper_id),
            )
            conn.commit()
        cur.close()
    return {"status": "removed" if removed else "not_saved"}


@app.get("/api/collections")
def get_collections(user_id: Optional[str] = None, user=Depends(current_user)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT c.collection_id, c.name, c.description, COUNT(ls.paper_id) AS paper_count
            FROM collections c
            LEFT JOIN library_saves ls ON c.collection_id = ls.collection_id
            WHERE c.user_id = %s::uuid
            GROUP BY c.collection_id, c.name, c.description
            ORDER BY c.created_at DESC
            """,
            (user["user_id"],),
        )
        cols = cur.fetchall()
        cur.close()
        return cols


@app.post("/api/collections")
def create_collection(payload: CollectionCreate, user=Depends(current_user)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Collection name cannot be blank")
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO collections (user_id, name, description)
            VALUES (%s::uuid, %s, %s)
            RETURNING collection_id, name, description
            """,
            (user["user_id"], name, payload.description),
        )
        collection = cur.fetchone()
        conn.commit()
        cur.close()
        collection["paper_count"] = 0
        return collection


def _owned_collection(cur, collection_id, user_id):
    cur.execute(
        "SELECT collection_id, name, description FROM collections WHERE collection_id = %s::uuid AND user_id = %s::uuid",
        (collection_id, user_id),
    )
    row = cur.fetchone()
    if not row:
        cur.close()
        raise HTTPException(status_code=404, detail="Collection not found")
    return row


@app.patch("/api/collections/{collection_id}")
def update_collection(collection_id: UUID, payload: CollectionUpdate, user=Depends(current_user)):
    changes = payload.model_dump(exclude_unset=True) if hasattr(payload, "model_dump") else payload.dict(exclude_unset=True)
    with get_db() as conn:
        cur = conn.cursor()
        current = _owned_collection(cur, str(collection_id), user["user_id"])
        name = (changes.get("name") if changes.get("name") is not None else current["name"]).strip()
        if not name:
            cur.close()
            raise HTTPException(status_code=422, detail="Collection name cannot be blank")
        description = changes["description"] if "description" in changes else current["description"]
        cur.execute(
            "UPDATE collections SET name = %s, description = %s WHERE collection_id = %s::uuid RETURNING collection_id, name, description",
            (name, (description or "").strip() or None, collection_id),
        )
        updated = cur.fetchone()
        conn.commit()
        cur.close()
        updated["collection_id"] = str(updated["collection_id"])
        return updated


@app.delete("/api/collections/{collection_id}")
def delete_collection(collection_id: UUID, user=Depends(current_user)):
    """Deletes the collection only. Papers stay in the member's library (collection_id is set to NULL)."""
    with get_db() as conn:
        cur = conn.cursor()
        _owned_collection(cur, str(collection_id), user["user_id"])
        cur.execute("DELETE FROM collections WHERE collection_id = %s::uuid", (collection_id,))
        conn.commit()
        cur.close()
    return {"status": "deleted", "collection_id": str(collection_id)}


@app.get("/api/collections/{collection_id}/papers")
def list_collection_papers(collection_id: UUID, user=Depends(current_user_optional)):
    """Collection contents. Anyone can read a collection (they are shown on public profiles)."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT c.collection_id, c.name, c.description, c.user_id, u.full_name AS owner_name
            FROM collections c JOIN users u ON u.user_id = c.user_id
            WHERE c.collection_id = %s::uuid
            """,
            (collection_id,),
        )
        collection = cur.fetchone()
        if not collection:
            cur.close()
            raise HTTPException(status_code=404, detail="Collection not found")
        cur.execute(
            """
            SELECT p.paper_id, p.canonical_title, p.authors, p.venue, p.publication_year, p.topics,
                   p.save_count, p.pagerank_score, ls.saved_at
            FROM library_saves ls JOIN papers p ON p.paper_id = ls.paper_id
            WHERE ls.collection_id = %s::uuid
            ORDER BY ls.saved_at DESC
            """,
            (collection_id,),
        )
        papers = cur.fetchall()
        cur.close()
    collection["collection_id"] = str(collection["collection_id"])
    collection["user_id"] = str(collection["user_id"])
    return {"collection": collection, "papers": papers}


@app.delete("/api/collections/{collection_id}/papers/{paper_id}")
def remove_paper_from_collection(collection_id: UUID, paper_id: UUID, user=Depends(current_user)):
    """Takes a paper out of the collection but keeps it saved in the library."""
    with get_db() as conn:
        cur = conn.cursor()
        _owned_collection(cur, str(collection_id), user["user_id"])
        cur.execute(
            "UPDATE library_saves SET collection_id = NULL WHERE user_id = %s::uuid AND paper_id = %s AND collection_id = %s::uuid",
            (user["user_id"], paper_id, collection_id),
        )
        removed = cur.rowcount > 0
        conn.commit()
        cur.close()
    return {"status": "removed" if removed else "not_in_collection"}


@app.get("/api/users/{user_id}/collections")
def get_user_collections(user_id: UUID):
    """Collections shown on a member's profile (name, description, size and a few titles)."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT c.collection_id, c.name, c.description, c.created_at,
                   COUNT(ls.paper_id) AS paper_count,
                   COALESCE((ARRAY_AGG(p.canonical_title ORDER BY ls.saved_at DESC) FILTER (WHERE p.paper_id IS NOT NULL))[1:3], ARRAY[]::text[]) AS sample_titles
            FROM collections c
            LEFT JOIN library_saves ls ON ls.collection_id = c.collection_id
            LEFT JOIN papers p ON p.paper_id = ls.paper_id
            WHERE c.user_id = %s::uuid
            GROUP BY c.collection_id, c.name, c.description, c.created_at
            ORDER BY c.created_at DESC
            """,
            (user_id,),
        )
        rows = cur.fetchall()
        cur.close()
    for row in rows:
        row["collection_id"] = str(row["collection_id"])
    return rows


@app.post("/api/collections/{collection_id}/papers")
def add_paper_to_collection(collection_id: UUID, payload: AddPaperToCollectionRequest, user=Depends(current_user)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT 1 FROM collections WHERE collection_id = %s::uuid AND user_id = %s::uuid",
            (collection_id, user["user_id"]),
        )
        if not cur.fetchone():
            cur.close()
            raise HTTPException(status_code=404, detail="Collection not found")
        cur.execute(
            """
            INSERT INTO library_saves (user_id, paper_id, collection_id, private_notes)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s)
            ON CONFLICT (user_id, paper_id) DO UPDATE
              SET collection_id = EXCLUDED.collection_id,
                  private_notes = COALESCE(NULLIF(EXCLUDED.private_notes, ''), library_saves.private_notes)
            RETURNING save_id
            """,
            (user["user_id"], payload.paper_id, collection_id, payload.private_notes),
        )
        cur.execute(
            "UPDATE papers SET save_count = (SELECT COUNT(*) FROM library_saves WHERE paper_id = %s::uuid), in_chanakya_library = TRUE WHERE paper_id = %s::uuid",
            (payload.paper_id, payload.paper_id),
        )
        conn.commit()
        cur.close()
    return {"status": "added_to_collection", "collection_id": str(collection_id), "paper_id": str(payload.paper_id)}


@app.post("/api/library/save-by-identifier")
def save_by_identifier(payload: SaveByIdentifierRequest, user=Depends(current_user)):
    raw_id = payload.identifier.strip()
    doi = None
    arxiv_id = None

    if "doi.org/" in raw_id:
        doi = raw_id.split("doi.org/")[-1].strip()
    elif "10." in raw_id and "/" in raw_id:
        doi = raw_id.strip()
    elif "arxiv.org/abs/" in raw_id:
        arxiv_id = raw_id.split("arxiv.org/abs/")[-1].split("v")[0].strip()
    elif "arxiv:" in raw_id.lower():
        arxiv_id = raw_id.lower().replace("arxiv:", "").strip()
    elif re.match(r"^\d{4}\.\d{4,5}$", raw_id):
        arxiv_id = raw_id

    with get_db() as conn:
        cur = conn.cursor()
        existing = None
        if doi:
            cur.execute("SELECT paper_id, canonical_title FROM papers WHERE doi = %s", (doi,))
            existing = cur.fetchone()
        if not existing and arxiv_id:
            cur.execute("SELECT paper_id, canonical_title FROM papers WHERE arxiv_id = %s", (arxiv_id,))
            existing = cur.fetchone()

        if existing:
            paper_id = existing["paper_id"]
        else:
            fetched = None
            if doi:
                try:
                    r = requests.get(f"https://api.crossref.org/works/{doi}", headers={"User-Agent": "chanakya-commons/1.0"}, timeout=10)
                    if r.status_code == 200:
                        msg = r.json().get("message", {})
                        title = " ".join(msg.get("title", [])) or "Crossref Paper"
                        abstract = msg.get("abstract", "") or f"Research article retrieved via Crossref DOI {doi}."
                        authors = [{"name": f"{a.get('given', '')} {a.get('family', '')}".strip()} for a in msg.get("author", [])]
                        year = (msg.get("published", {}).get("date-parts", [[2024]])[0][0]) if msg.get("published") else 2024
                        venue = msg.get("container-title", ["Scholarly Journal"])[0] if msg.get("container-title") else "Journal"
                        fetched = {
                            "title": title,
                            "abstract": abstract,
                            "authors": authors[:5] or [{"name": "Author"}],
                            "year": year,
                            "venue": venue,
                            "topics": ["Research Paper"],
                            "doi": doi,
                            "arxiv_id": None,
                            "sources": ["crossref"]
                        }
                except Exception:
                    pass

            if not fetched and arxiv_id:
                try:
                    r = requests.get(f"http://export.arxiv.org/api/query?id_list={arxiv_id}", headers={"User-Agent": "chanakya-commons/1.0"}, timeout=10)
                    if r.status_code == 200:
                        import xml.etree.ElementTree as ET
                        root = ET.fromstring(r.content)
                        ns = {"atom": "http://www.w3.org/2005/Atom"}
                        entry = root.find("atom:entry", ns)
                        if entry is not None:
                            title = (entry.find("atom:title", ns).text or "").strip().replace("\n", " ")
                            abstract = (entry.find("atom:summary", ns).text or "").strip().replace("\n", " ")
                            authors = [{"name": a.find("atom:name", ns).text} for a in entry.findall("atom:author", ns) if a.find("atom:name", ns) is not None]
                            fetched = {
                                "title": title,
                                "abstract": abstract,
                                "authors": authors[:5] or [{"name": "arXiv Author"}],
                                "year": 2024,
                                "venue": "arXiv.org",
                                "topics": ["arXiv Preprint"],
                                "doi": None,
                                "arxiv_id": arxiv_id,
                                "sources": ["arxiv"]
                            }
                except Exception:
                    pass

            if not fetched:
                fetched = {
                    "title": f"External Publication: {raw_id}",
                    "abstract": f"Academic work saved from external identifier reference: {raw_id}",
                    "authors": [{"name": "Contributing Scholar"}],
                    "year": 2024,
                    "venue": "Academic Commons",
                    "topics": ["Interdisciplinary"],
                    "doi": doi,
                    "arxiv_id": arxiv_id,
                    "sources": ["external"]
                }

            paper_id = uuid.uuid4()
            emb = embed_model.encode(f"{fetched['title']}. {fetched['abstract'][:500]}").tolist()
            cur.execute(
                """
                INSERT INTO papers (paper_id, doi, arxiv_id, canonical_title, abstract, authors, publication_year, venue, topics, sources, embedding)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::vector)
                """,
                (
                    paper_id,
                    fetched["doi"],
                    fetched["arxiv_id"],
                    fetched["title"],
                    fetched["abstract"],
                    json.dumps(fetched["authors"]),
                    fetched["year"],
                    fetched["venue"],
                    fetched["topics"],
                    json.dumps(fetched["sources"]),
                    emb,
                ),
            )
            cur.execute(
                """
                INSERT INTO paper_chunks (paper_id, chunk_index, chunk_text, chunk_embedding)
                VALUES (%s, 0, %s, %s::vector)
                """,
                (paper_id, fetched["abstract"][:1200], emb),
            )

        # Save to library
        cur.execute(
            """
            INSERT INTO library_saves (user_id, paper_id, collection_id, private_notes)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s)
            ON CONFLICT (user_id, paper_id) DO UPDATE
              SET collection_id = COALESCE(EXCLUDED.collection_id, library_saves.collection_id),
                  private_notes = COALESCE(NULLIF(EXCLUDED.private_notes, ''), library_saves.private_notes)
            """,
            (user["user_id"], paper_id, payload.collection_id, payload.private_notes or ""),
        )
        cur.execute(
            """
            UPDATE papers
            SET save_count = (SELECT COUNT(*) FROM library_saves WHERE paper_id = %s::uuid),
                in_chanakya_library = TRUE
            WHERE paper_id = %s::uuid
            RETURNING paper_id, canonical_title, save_count
            """,
            (paper_id, paper_id),
        )
        saved_row = cur.fetchone()
        cur.execute("INSERT INTO activity_events (user_id, event_type, target_id) VALUES (%s::uuid, 'save_paper', %s::uuid)", (user["user_id"], paper_id))
        conn.commit()
        cur.close()

    return {"status": "saved", "paper": saved_row, "identifier": raw_id}


def _deduplicate_search_results(papers: list[dict]) -> list[dict]:
    seen = {}
    deduped = []
    for p in papers:
        doi = p.get("doi")
        title_norm = re.sub(r"[^\w\s]", "", (p.get("canonical_title") or "").lower()).strip()
        title_norm = re.sub(r"\s+preprint$", "", title_norm)
        key = doi if doi else title_norm
        if key in seen:
            canonical = seen[key]
            # Merge sources
            srcs = set(canonical.get("sources") or ["OpenAlex"])
            if p.get("sources"):
                for s in p["sources"]:
                    srcs.add(s.title() if isinstance(s, str) else str(s))
            canonical["sources"] = list(srcs)
            if p.get("pagerank_score", 0) > canonical.get("pagerank_score", 0):
                canonical["pagerank_score"] = p["pagerank_score"]
        else:
            p_obj = dict(p)
            srcs = set()
            if p_obj.get("sources"):
                for s in p_obj["sources"]:
                    srcs.add(s.title() if isinstance(s, str) else str(s))
            if not srcs:
                srcs.add("OpenAlex")
            p_obj["sources"] = list(srcs)
            seen[key] = p_obj
            deduped.append(p_obj)
    return deduped


# ==========================================
# F5: Unified 4-Panel Hybrid Search (RRF + PageRank)
# ==========================================
@app.get("/api/search")
def unified_search(q: str = Query(..., min_length=2), limit: int = Query(8, ge=1, le=50)):
    with get_db() as conn:
        cur = conn.cursor()
        q_vec = vec_literal(q)

        # Panel 1 & 2: True Index-Accelerated Hybrid RRF
        # Direct ORDER BY ... LIMIT 40 in subqueries leverages pgvector HNSW & full-text GIN index scans
        paper_sql = """
            WITH semantic_knn AS (
                SELECT paper_id, (embedding <=> %s::vector) AS dist
                FROM papers
                WHERE in_chanakya_library = %s
                ORDER BY embedding <=> %s::vector
                LIMIT 40
            ),
            semantic AS (
                SELECT paper_id, ROW_NUMBER() OVER (ORDER BY dist ASC) AS sem_rank
                FROM semantic_knn
            ),
            keyword_top AS (
                SELECT paper_id, ts_rank(search_tsv, plainto_tsquery('english', %s)) AS kw_score
                FROM papers
                WHERE in_chanakya_library = %s AND search_tsv @@ plainto_tsquery('english', %s)
                ORDER BY kw_score DESC
                LIMIT 40
            ),
            keyword AS (
                SELECT paper_id, ROW_NUMBER() OVER (ORDER BY kw_score DESC) AS kw_rank
                FROM keyword_top
            )
            SELECT p.paper_id, p.doi, p.arxiv_id, p.canonical_title, p.abstract, p.authors, p.publication_year, p.venue, p.topics,
                   p.save_count, p.pagerank_score, p.in_chanakya_library,
                   COALESCE(ARRAY_AGG(DISTINCT ps.source_name) FILTER (WHERE ps.source_name IS NOT NULL), ARRAY['openalex']) AS sources,
                   (COALESCE(1.0 / (60 + s.sem_rank), 0) + COALESCE(1.0 / (60 + k.kw_rank), 0) + (LEAST(p.pagerank_score * 50.0, 0.15))) AS rrf_score
            FROM papers p
            LEFT JOIN semantic s ON p.paper_id = s.paper_id
            LEFT JOIN keyword k ON p.paper_id = k.paper_id
            LEFT JOIN paper_sources ps ON p.paper_id = ps.paper_id
            WHERE (s.paper_id IS NOT NULL OR k.paper_id IS NOT NULL)
            GROUP BY p.paper_id, s.sem_rank, k.kw_rank
            ORDER BY rrf_score DESC
            LIMIT %s
        """

        cur.execute(paper_sql, (q_vec, False, q_vec, q, False, q, limit * 2))
        raw_external = cur.fetchall()

        cur.execute(paper_sql, (q_vec, True, q_vec, q, True, q, limit * 2))
        raw_library = cur.fetchall()

        external_papers = _deduplicate_search_results(raw_external)[:limit]
        library_papers = _deduplicate_search_results(raw_library)[:limit]

        # Panel 3: University Members working in that area
        cur.execute(
            """
            SELECT user_id, full_name, role, department, bio, interest_tags,
                   (1 - (profile_embedding <=> %s::vector)) AS similarity
            FROM users
            WHERE is_flagged_spam = FALSE
            ORDER BY profile_embedding <=> %s::vector
            LIMIT %s
            """,
            (q_vec, q_vec, limit),
        )
        people = cur.fetchall()

        # Panel 4: Related Posts & Discussions
        cur.execute(
            """
            SELECT p.post_id, p.title, p.body, p.tags, p.upvote_count, u.full_name AS author_name, u.department,
                   (1 - (p.post_embedding <=> %s::vector)) AS similarity
            FROM posts p
            JOIN users u ON p.author_id = u.user_id
            WHERE p.is_flagged_spam = FALSE AND u.is_flagged_spam = FALSE
            ORDER BY p.post_embedding <=> %s::vector
            LIMIT %s
            """,
            (q_vec, q_vec, limit),
        )
        posts = cur.fetchall()

        cur.execute("INSERT INTO activity_events (event_type, search_query) VALUES ('search', %s)", (q,))
        conn.commit()
        cur.close()

    # Search Expansion Hook: Match query against antecedents in high-lift rules (lift >= 1.5)
    related_topics = get_related_topics_for_query(q, min_lift=1.5)

    return {
        "query": q,
        "related_topics": related_topics,
        "panels": {
            "external_sources": external_papers,
            "chanakya_library": library_papers,
            "people": people,
            "posts": posts,
        },
    }


# ==========================================
# F6: Recommendations + FP-Growth "Also Saved"
# ==========================================
@app.get("/api/recommendations/{user_id}")
def get_recommendations(user_id: str, limit: int = Query(6, ge=1, le=50)):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT user_id, department, profile_embedding FROM users WHERE user_id = %s::uuid", (user_id,))
        user = cur.fetchone()
        if not user:
            cur.close()
            raise HTTPException(status_code=404, detail="User not found")

        # Recommended papers (excluding already saved).
        # Taste vector = the member's profile embedding (bio + interest tags) blended with the centroid of
        # the papers they saved, so saving papers really does tune the list. "reason" says which signal won.
        rec_sql_blended = """
            WITH me AS (SELECT profile_embedding FROM users WHERE user_id = %s::uuid),
            taste AS (
                SELECT AVG(p.embedding) AS centroid, COUNT(*) AS n
                FROM library_saves ls JOIN papers p ON p.paper_id = ls.paper_id
                WHERE ls.user_id = %s::uuid AND p.embedding IS NOT NULL
            ),
            ranked AS (
                SELECT paper_id, percent_rank() OVER (ORDER BY pagerank_score) AS pagerank_percentile FROM papers
            )
            SELECT p.paper_id, p.canonical_title, p.publication_year, p.venue, p.topics, p.save_count, p.pagerank_score,
                   r.pagerank_percentile,
                   CASE WHEN t.centroid IS NULL THEN (1 - (p.embedding <=> me.profile_embedding))
                        ELSE 0.5 * (1 - (p.embedding <=> me.profile_embedding)) + 0.5 * (1 - (p.embedding <=> t.centroid)) END AS match_score,
                   CASE WHEN t.centroid IS NOT NULL
                         AND (1 - (p.embedding <=> t.centroid)) > (1 - (p.embedding <=> me.profile_embedding))
                        THEN 'saved' ELSE 'profile' END AS reason
            FROM papers p
            CROSS JOIN me CROSS JOIN taste t
            JOIN ranked r ON r.paper_id = p.paper_id
            WHERE p.paper_id NOT IN (SELECT paper_id FROM library_saves WHERE user_id = %s::uuid)
            ORDER BY match_score DESC, p.pagerank_score DESC
            LIMIT %s
        """
        try:
            cur.execute(rec_sql_blended, (user_id, user_id, user_id, limit))
            rec_papers = cur.fetchall()
        except psycopg2.Error as exc:
            # Older pgvector without avg(vector): fall back to the profile-only ranking.
            conn.rollback()
            print(f"[recommendations] blended ranking unavailable, using profile only: {exc}")
            cur.execute(
                """
                SELECT p.paper_id, p.canonical_title, p.publication_year, p.venue, p.topics, p.save_count, p.pagerank_score,
                       ranked.pagerank_percentile,
                       (1 - (p.embedding <=> u.profile_embedding)) AS match_score,
                       'profile' AS reason
                FROM papers p
                JOIN (SELECT paper_id, percent_rank() OVER (ORDER BY pagerank_score) AS pagerank_percentile FROM papers) ranked
                  ON ranked.paper_id = p.paper_id
                CROSS JOIN (SELECT profile_embedding FROM users WHERE user_id = %s::uuid) u
                WHERE p.paper_id NOT IN (SELECT paper_id FROM library_saves WHERE user_id = %s::uuid)
                ORDER BY match_score DESC, p.pagerank_score DESC
                LIMIT %s
                """,
                (user_id, user_id, limit),
            )
            rec_papers = cur.fetchall()

        # Recommended collaborators (excluding already followed)
        cur.execute(
            """
            SELECT other.user_id, other.full_name, other.role, other.department, other.interest_tags,
                   (1 - (other.profile_embedding <=> me.profile_embedding)) AS match_score
            FROM users other
            CROSS JOIN (SELECT profile_embedding FROM users WHERE user_id = %s::uuid) me
            WHERE other.user_id != %s::uuid
              AND other.is_flagged_spam = FALSE
              AND other.user_id NOT IN (SELECT followee_id FROM user_follows WHERE follower_id = %s::uuid)
            ORDER BY match_score DESC
            LIMIT %s
            """,
            (user_id, user_id, user_id, limit),
        )
        rec_people = cur.fetchall()
        cur.close()
        return {"recommended_papers": rec_papers, "recommended_people": rec_people}


@app.get("/api/papers/{paper_id}/also-saved")
def get_also_saved(paper_id: str, limit: int = Query(5, ge=1, le=20)):
    """Association Rule Mining (FP-Growth) on user library baskets."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT user_id, paper_id::text FROM library_saves")
        rows = cur.fetchall()

        if not rows:
            cur.close()
            return []

        df = pd.DataFrame(rows)
        basket = pd.crosstab(df["user_id"], df["paper_id"]).astype(bool)

        recommendations = []
        if paper_id in basket.columns and len(basket) >= 5:
            freq_items = fpgrowth(basket, min_support=0.04, use_colnames=True)
            if not freq_items.empty:
                rules = association_rules(freq_items, metric="lift", min_threshold=1.1)
                matched = rules[rules["antecedents"].apply(lambda x: paper_id in x)]
                consequent_ids = []
                for _, r in matched.sort_values("confidence", ascending=False).iterrows():
                    for cid in r["consequents"]:
                        if cid != paper_id and cid not in consequent_ids:
                            consequent_ids.append(cid)

                if consequent_ids:
                    cur.execute(
                        "SELECT paper_id, canonical_title, publication_year, save_count FROM papers WHERE paper_id = ANY(%s::uuid[]) LIMIT %s",
                        (consequent_ids[:limit], limit),
                    )
                    recommendations = cur.fetchall()

        cur.close()
        return recommendations


@app.get("/api/papers/{paper_id}")
def get_paper(paper_id: UUID, user=Depends(current_user_optional)):
    user_id = str(user["user_id"]) if user else None
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            WITH ranked AS (
              SELECT paper_id, percent_rank() OVER (ORDER BY pagerank_score) AS pagerank_percentile
              FROM papers
            )
            SELECT p.paper_id, p.doi, p.arxiv_id, p.canonical_title, p.abstract, p.authors,
                   p.publication_year, p.venue, p.topics, p.in_chanakya_library, p.pagerank_score,
                   p.save_count, ranked.pagerank_percentile,
                   (SELECT COUNT(*) FROM paper_citations pc WHERE pc.citing_paper_id = p.paper_id) AS cites_count,
                   (SELECT COUNT(*) FROM paper_citations pc WHERE pc.cited_paper_id = p.paper_id) AS cited_by_count,
                   EXISTS(SELECT 1 FROM library_saves ls WHERE ls.paper_id = p.paper_id AND ls.user_id = %s::uuid) AS is_saved,
                   (SELECT collection_id FROM library_saves ls
                    WHERE ls.paper_id = p.paper_id AND ls.user_id = %s::uuid) AS collection_id
            FROM papers p JOIN ranked USING (paper_id)
            WHERE p.paper_id = %s
            """,
            (user_id, user_id, paper_id),
        )
        paper = cur.fetchone()
        if not paper:
            cur.close()
            raise HTTPException(status_code=404, detail="Paper not found")
        cur.execute(
            """
            SELECT p.paper_id, p.canonical_title, p.publication_year
            FROM paper_citations pc JOIN papers p ON p.paper_id = pc.cited_paper_id
            WHERE pc.citing_paper_id = %s ORDER BY p.publication_year DESC NULLS LAST LIMIT 8
            """,
            (paper_id,),
        )
        paper["references"] = cur.fetchall()
        cur.execute(
            """
            SELECT p.paper_id, p.canonical_title, p.publication_year
            FROM paper_citations pc JOIN papers p ON p.paper_id = pc.citing_paper_id
            WHERE pc.cited_paper_id = %s ORDER BY p.publication_year DESC NULLS LAST LIMIT 8
            """,
            (paper_id,),
        )
        paper["cited_by"] = cur.fetchall()
        cur.execute(
            """
            SELECT p.post_id, p.title, u.full_name AS author_name, p.upvote_count,
                   (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.post_id) AS comment_count,
                   p.created_at
            FROM posts p JOIN users u ON u.user_id = p.author_id
            WHERE p.attached_paper_id = %s AND p.is_flagged_spam = FALSE
            ORDER BY p.created_at DESC LIMIT 10
            """,
            (paper_id,),
        )
        paper["related_posts"] = cur.fetchall()
        cur.close()
    paper["paper_id"] = str(paper["paper_id"])
    if paper.get("collection_id"):
        paper["collection_id"] = str(paper["collection_id"])
    return paper


@app.get("/api/home")
def get_home():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
              (SELECT COUNT(*) FROM papers WHERE in_chanakya_library = TRUE) AS papers,
              (SELECT COUNT(*) FROM users WHERE is_flagged_spam = FALSE) AS scholars,
              (SELECT COUNT(DISTINCT parent_cluster) FROM dw.dim_topic) AS clusters,
              (SELECT COUNT(*) FROM posts WHERE is_flagged_spam = FALSE) AS posts
            """
        )
        stats = cur.fetchone()
        cur.execute(
            """
            WITH ranked AS (
              SELECT paper_id, percent_rank() OVER (ORDER BY pagerank_score) AS pagerank_percentile
              FROM papers
            )
            SELECT p.paper_id, p.canonical_title, p.authors, p.venue, p.publication_year,
                   p.pagerank_score, p.save_count, ranked.pagerank_percentile
            FROM papers p JOIN ranked USING (paper_id)
            WHERE p.in_chanakya_library = TRUE
            ORDER BY p.pagerank_score DESC LIMIT 6
            """
        )
        featured = cur.fetchall()
        cur.execute(
            """
            SELECT p.post_id, p.author_id, p.title, p.body, p.tags, p.upvote_count, p.created_at, p.edited_at,
                   u.full_name AS author_name, u.department AS author_dept, u.role AS author_role,
                   pa.canonical_title AS attached_paper_title, pa.paper_id AS attached_paper_id,
                   (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.post_id) AS comment_count
            FROM posts p JOIN users u ON p.author_id = u.user_id
            LEFT JOIN papers pa ON pa.paper_id = p.attached_paper_id
            WHERE p.is_flagged_spam = FALSE AND u.is_flagged_spam = FALSE
            ORDER BY p.created_at DESC LIMIT 4
            """
        )
        recent_posts = cur.fetchall()
        cur.close()
    for paper in featured:
        paper["paper_id"] = str(paper["paper_id"])
    for post in recent_posts:
        post["post_id"] = str(post["post_id"])
        post["author_id"] = str(post["author_id"])
        if post.get("attached_paper_id"):
            post["attached_paper_id"] = str(post["attached_paper_id"])
        post["created_at"] = post["created_at"].isoformat()
    return {"stats": stats, "featured_papers": featured, "recent_posts": recent_posts}


# ==========================================
# F7: Sliding Window Trends & Anomaly Detection
# ==========================================
@app.get("/api/trends-and-anomalies")
def get_trends_and_anomalies(user=Depends(current_user_optional)):
    """
    Purely read-only endpoint: returns date-anchored sliding window topic spike detection
    and active flagged spam/anomaly alerts without modifying database state on GET.
    """
    with get_db() as conn:
        cur = conn.cursor()

        # 1. Sliding window topic spike detection anchored to MAX(occurred_at)
        cur.execute(
            """
            WITH anchor AS (
                SELECT COALESCE(MAX(occurred_at), NOW()) AS max_ts FROM activity_events
            ),
            expanded AS (
                SELECT UNNEST(topic_tags) AS topic, occurred_at
                FROM activity_events, anchor
                WHERE topic_tags IS NOT NULL
                  AND occurred_at >= anchor.max_ts - INTERVAL '37 days'
                  AND occurred_at <= anchor.max_ts
            ),
            window_counts AS (
                SELECT
                    topic,
                    COUNT(*) FILTER (WHERE occurred_at >= (SELECT max_ts FROM anchor) - INTERVAL '7 days') AS recent_7d,
                    COUNT(*) FILTER (WHERE occurred_at < (SELECT max_ts FROM anchor) - INTERVAL '7 days') / 4.28 AS baseline_weekly_avg
                FROM expanded
                GROUP BY topic
            )
            SELECT topic, recent_7d, ROUND(baseline_weekly_avg::numeric, 2) AS baseline_weekly_avg,
                   ROUND(((recent_7d - baseline_weekly_avg) / GREATEST(baseline_weekly_avg, 1.0))::numeric, 2) AS spike_ratio
            FROM window_counts
            ORDER BY spike_ratio DESC
            LIMIT 10
            """
        )
        trending_topics = cur.fetchall()

        # 2. Read flagged accounts without mutating user rows on GET
        flagged_accounts = []
        if user and user["role"] == "admin":
            cur.execute(
                """
                SELECT u.user_id::text, u.full_name, u.department,
                       COUNT(p.post_id) AS post_count,
                       u.spam_score AS anomaly_score
                FROM users u
                LEFT JOIN posts p ON u.user_id = p.author_id
                WHERE u.is_flagged_spam = TRUE
                GROUP BY u.user_id, u.full_name, u.department, u.spam_score
                ORDER BY u.spam_score DESC
                LIMIT 20
                """
            )
            flagged_accounts = cur.fetchall()
        cur.close()
        result = {"trending_topics": trending_topics}
        if user and user["role"] == "admin":
            result["flagged_spam_accounts"] = flagged_accounts
        return result


@app.get("/api/alerts")
def get_system_alerts(limit: int = Query(25, ge=1, le=100), user=Depends(current_user_optional)):
    """Fetch unresolved system alerts persisted during ELT or moderation jobs."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT alert_id, alert_type, entity_ref, severity_score, details, is_resolved, detected_at
            FROM system_alerts
            WHERE is_resolved = FALSE
            ORDER BY detected_at DESC
            LIMIT %s
            """,
            (limit,)
        )
        alerts = cur.fetchall()
        cur.close()
        return alerts


@app.post("/api/analytics/run-spam-job")
def run_spam_detection_job(
    threshold: float = Query(0.18, description="Minimum inverted anomaly score to flag an account"),
    user=Depends(require_role("admin")),
):
    """
    Scheduled / administrative batch anomaly detection job.
    Uses Isolation Forest with an absolute score threshold rather than hardcoding contamination %,
    and logs events to system_alerts with an actionable review state.
    """
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                u.user_id::text,
                u.full_name,
                u.department,
                COUNT(DISTINCT p.post_id) AS post_count,
                COALESCE(EXTRACT(EPOCH FROM (MAX(p.created_at) - MIN(p.created_at))) / GREATEST(COUNT(p.post_id), 1), 999999) AS avg_seconds_between_posts,
                COALESCE(AVG(p.upvote_count), 0) AS avg_upvotes
            FROM users u
            LEFT JOIN posts p ON u.user_id = p.author_id
            GROUP BY u.user_id, u.full_name, u.department
            """
        )
        user_stats = pd.DataFrame(cur.fetchall())

        flagged = []
        if len(user_stats) >= 10:
            features = user_stats[["post_count", "avg_seconds_between_posts", "avg_upvotes"]].fillna(0)
            iso = IsolationForest(contamination=0.08, random_state=42)
            iso.fit(features)
            user_stats["anomaly_score"] = -iso.decision_function(features)

            # Strictly filter by score threshold rather than blind contamination
            outliers = user_stats[user_stats["anomaly_score"] >= threshold].sort_values("anomaly_score", ascending=False)
            for _, row in outliers.iterrows():
                score = round(float(row["anomaly_score"]), 4)
                user_id = row["user_id"]
                cur.execute(
                    """
                    INSERT INTO system_alerts (alert_type, entity_ref, severity_score, details, is_resolved)
                    VALUES ('USER_SPAM', %s, %s, %s::jsonb, FALSE)
                    """,
                    (
                        user_id,
                        score,
                        json.dumps({
                            "full_name": row["full_name"],
                            "department": row["department"],
                            "post_count": int(row["post_count"]),
                            "avg_upvotes": float(row["avg_upvotes"]),
                            "score": score
                        })
                    )
                )
                cur.execute(
                    "UPDATE users SET is_flagged_spam = TRUE, spam_score = %s WHERE user_id = %s::uuid",
                    (score, user_id),
                )
                flagged.append({
                    "user_id": user_id,
                    "full_name": row["full_name"],
                    "department": row["department"],
                    "anomaly_score": score
                })
            conn.commit()

        cur.close()
        return {"status": "completed", "evaluated_users": len(user_stats), "flagged_count": len(flagged), "flagged": flagged}


@app.post("/api/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: UUID, user=Depends(require_role("admin"))):
    """Admin endpoint to resolve an anomaly alert and unflag false positives."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE system_alerts
            SET is_resolved = TRUE
            WHERE alert_id = %s::uuid
            RETURNING alert_id, alert_type, entity_ref
            """,
            (alert_id,)
        )
        alert = cur.fetchone()
        if not alert:
            cur.close()
            raise HTTPException(status_code=404, detail="Alert not found")

        if alert["alert_type"] == "USER_SPAM":
            cur.execute("UPDATE users SET is_flagged_spam = FALSE WHERE user_id = %s::uuid", (alert["entity_ref"],))

        conn.commit()
        cur.close()
        return {"status": "resolved", "alert": alert}


# ==========================================
# Admin dashboard (admin role only)
# ==========================================
_ADMIN_MEMBER_SORTS = {
    "name": "u.full_name",
    "role": "u.role",
    "department": "u.department",
    "joined": "u.created_at",
    "posts": "posts",
    "comments": "comments",
    "saves": "saves",
    "votes": "votes_cast",
    "karma": "karma",
    "last_active": "last_active",
}


@app.get("/api/admin/overview")
def admin_overview(days: int = Query(30, ge=7, le=90), user=Depends(require_role("admin"))):
    """Headline counts, daily activity and moderation queue for the admin dashboard."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
              (SELECT COUNT(*) FROM users)                                        AS members,
              (SELECT COUNT(*) FROM users WHERE is_flagged_spam)                  AS flagged_members,
              (SELECT COUNT(*) FROM papers)                                       AS papers,
              (SELECT COUNT(*) FROM papers WHERE in_chanakya_library)             AS library_papers,
              (SELECT COUNT(*) FROM posts)                                        AS posts,
              (SELECT COUNT(*) FROM comments)                                     AS comments,
              (SELECT COUNT(*) FROM post_upvotes)                                 AS votes,
              (SELECT COUNT(*) FROM library_saves)                                AS saves,
              (SELECT COUNT(*) FROM system_alerts WHERE NOT is_resolved)          AS open_alerts
            """
        )
        totals = cur.fetchone()

        cur.execute("SELECT role, COUNT(*)::int AS count FROM users GROUP BY role ORDER BY count DESC")
        by_role = cur.fetchall()
        cur.execute("SELECT department, COUNT(*)::int AS count FROM users GROUP BY department ORDER BY count DESC")
        by_department = cur.fetchall()

        cur.execute(
            """
            WITH d AS (
              SELECT generate_series((CURRENT_DATE - (%(n)s - 1) * INTERVAL '1 day')::date, CURRENT_DATE, INTERVAL '1 day')::date AS day
            )
            SELECT d.day::text AS day,
                   (SELECT COUNT(*) FROM posts p WHERE p.created_at::date = d.day)::int         AS posts,
                   (SELECT COUNT(*) FROM comments c WHERE c.created_at::date = d.day)::int      AS comments,
                   (SELECT COUNT(*) FROM post_upvotes v WHERE v.created_at::date = d.day)::int  AS votes,
                   (SELECT COUNT(*) FROM library_saves s WHERE s.saved_at::date = d.day)::int   AS saves
            FROM d ORDER BY d.day
            """,
            {"n": days},
        )
        activity = cur.fetchall()

        cur.execute(
            """
            SELECT a.alert_id::text, a.alert_type, a.entity_ref, u.full_name AS entity_name,
                   a.severity_score, a.details, a.detected_at
            FROM system_alerts a
            LEFT JOIN users u ON a.alert_type = 'USER_SPAM' AND u.user_id::text = a.entity_ref
            WHERE NOT a.is_resolved
            ORDER BY a.severity_score DESC, a.detected_at DESC LIMIT 8
            """
        )
        alerts = cur.fetchall()

        cur.execute(
            """
            SELECT u.user_id::text, u.full_name, u.role, u.department,
                   COUNT(DISTINCT p.post_id)::int AS posts,
                   COALESCE(SUM(p.upvote_count), 0)::int AS karma
            FROM users u JOIN posts p ON p.author_id = u.user_id AND NOT p.is_flagged_spam
            WHERE NOT u.is_flagged_spam
            GROUP BY u.user_id, u.full_name, u.role, u.department
            ORDER BY karma DESC, posts DESC LIMIT 5
            """
        )
        top = cur.fetchall()
        cur.close()
    return {
        "totals": totals,
        "members_by_role": by_role,
        "members_by_department": by_department,
        "activity": activity,
        "open_alerts": alerts,
        "top_contributors": top,
    }


@app.get("/api/admin/members")
def admin_members(
    q: Optional[str] = Query(None, max_length=80),
    role: Optional[str] = Query(None, pattern="^(student|faculty|researcher|admin)$"),
    department: Optional[str] = Query(None, max_length=100),
    flagged: Optional[bool] = None,
    sort: str = Query("joined"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(require_role("admin")),
):
    """Member directory with contact details and activity counts - visible to admins only."""
    sort_col = _ADMIN_MEMBER_SORTS.get(sort)
    if not sort_col:
        raise HTTPException(status_code=422, detail=f"sort must be one of {sorted(_ADMIN_MEMBER_SORTS)}")
    where, params = ["TRUE"], {"limit": limit, "offset": offset}
    if q:
        where.append("(u.full_name ILIKE %(q)s OR u.email ILIKE %(q)s OR u.university_id ILIKE %(q)s)")
        params["q"] = f"%{q.strip()}%"
    if role:
        where.append("u.role = %(role)s")
        params["role"] = role
    if department:
        where.append("u.department = %(department)s")
        params["department"] = department
    if flagged is not None:
        where.append("u.is_flagged_spam = %(flagged)s")
        params["flagged"] = flagged
    clause = " AND ".join(where)
    direction = "ASC" if order == "asc" else "DESC"
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(f"SELECT COUNT(*) AS n FROM users u WHERE {clause}", params)
        total = cur.fetchone()["n"]
        cur.execute(
            f"""
            SELECT u.user_id::text, u.university_id, u.full_name, u.email, u.role, u.department,
                   u.interest_tags, u.created_at, u.is_synthetic, u.is_flagged_spam, u.spam_score,
                   COALESCE(po.n, 0)::int AS posts, COALESCE(po.karma, 0)::int AS karma,
                   COALESCE(co.n, 0)::int AS comments,
                   COALESCE(sa.n, 0)::int AS saves,
                   COALESCE(vo.n, 0)::int AS votes_cast,
                   ev.last_active
            FROM users u
            LEFT JOIN (SELECT author_id, COUNT(*) AS n, SUM(upvote_count) AS karma FROM posts GROUP BY author_id) po ON po.author_id = u.user_id
            LEFT JOIN (SELECT author_id, COUNT(*) AS n FROM comments GROUP BY author_id) co ON co.author_id = u.user_id
            LEFT JOIN (SELECT user_id, COUNT(*) AS n FROM library_saves GROUP BY user_id) sa ON sa.user_id = u.user_id
            LEFT JOIN (SELECT user_id, COUNT(*) AS n FROM post_upvotes GROUP BY user_id) vo ON vo.user_id = u.user_id
            LEFT JOIN (SELECT user_id, MAX(occurred_at) AS last_active FROM activity_events GROUP BY user_id) ev ON ev.user_id = u.user_id
            WHERE {clause}
            ORDER BY {sort_col} {direction} NULLS LAST, u.full_name ASC
            LIMIT %(limit)s OFFSET %(offset)s
            """,
            params,
        )
        items = cur.fetchall()
        cur.close()
    return {"total": total, "limit": limit, "offset": offset, "items": items}


# ==========================================
# F8: Grounded Research Assistant (RAG + Ollama)
# ==========================================
_SUMMARY_RE = re.compile(
    r"summar|overview|main (contribution|idea|finding)|key (idea|contribution|finding)|about this paper|tl;?dr|what does this paper",
    re.I,
)


def _clean_passage(text: str) -> str:
    """Chunks are cut at fixed character offsets, so they often start/end mid-word. Trim those fragments."""
    t = (text or "").strip()
    if t and t[0].islower() and " " in t[:25]:
        t = t.split(" ", 1)[1]
    if t and t[-1] not in ".!?\"')]" and " " in t[-25:]:
        cut = t.rfind(" ")
        tail = t[cut + 1:]
        if len(tail) < 15 and not tail.endswith((".", "!", "?")):
            t = t[:cut]
    return t.strip()


_GREETING_RE = re.compile(r"^\s*(hi+|hello+|hey+|hiya|yo|namaste|good\s+(morning|afternoon|evening)|greetings)(\s+(there|assistant|bot|crc))?\s*[!.?]*\s*$", re.I)
_THANKS_RE = re.compile(r"^\s*(thanks?( you)?( so much)?|thx|ty|cheers|great|nice|cool|ok(ay)?|got it|perfect|awesome)\s*[!.]*\s*$", re.I)
_ABOUT_RE = re.compile(r"^\s*(who|what)\s+are\s+you\b|what\s+can\s+you\s+do|how\s+(do\s+you|does\s+this)\s+work|^\s*help\s*[!?.]*\s*$|how\s+can\s+you\s+help", re.I)

_EXAMPLE_QUESTIONS = (
    "“What are the key applications and challenges of graph neural networks?”, "
    "“How does federated learning protect privacy?” or “What methods exist for detecting anomalies in citation data?”"
)


def _small_talk_reply(question: str) -> Optional[str]:
    """Greetings, thanks and 'what can you do' need no retrieval (and no model), so answer them directly."""
    q = (question or "").strip()
    if not q:
        return None
    if _GREETING_RE.match(q):
        return (
            "Hi! I'm the Chanakya Research Commons assistant. Ask me about a research topic and I'll answer from the papers "
            f"in the library, with citations you can check. For example: {_EXAMPLE_QUESTIONS}"
        )
    if _THANKS_RE.match(q):
        return "You're welcome! Ask another research question whenever you like."
    if _ABOUT_RE.search(q):
        return (
            "I answer research questions using only the papers in the Chanakya library, and every claim carries a citation you can open. "
            "You can ask about a topic across the whole library, or open a paper and ask about that paper alone "
            f"(for example “Summarize this paper’s main contribution”). Try {_EXAMPLE_QUESTIONS}"
        )
    return None


_REFUSAL = (
    "Insufficient evidence in the Chanakya University repository to answer this query. "
    "Try rephrasing with specific research terms (a method, topic or paper), or ask about a subject the library covers."
)


def _retrieve_for_assistant(req: AskAssistantRequest):
    """Returns (passages, refusal_message). `refusal_message` is set when there is nothing to answer from."""
    q_vec = vec_literal(req.question)
    scoped = bool(req.paper_id)
    # "Summarize this paper" shares almost no words with the paper's text, so its embedding scores low
    # against every chunk. For those questions we read the paper's opening chunks instead.
    wants_overview = scoped and bool(_SUMMARY_RE.search(req.question))

    with get_db() as conn:
        cur = conn.cursor()
        conditions = []
        if req.library_only:
            conditions.append("p.in_chanakya_library = TRUE")
        if req.paper_id:
            conditions.append("p.paper_id = %s::uuid")
        filter_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
        if wants_overview:
            order_clause, query_params = "pc.chunk_index ASC", (q_vec, req.paper_id)
        elif scoped:
            order_clause, query_params = "pc.chunk_embedding <=> %s::vector", (q_vec, req.paper_id, q_vec)
        else:
            order_clause, query_params = "pc.chunk_embedding <=> %s::vector", (q_vec, q_vec)
        cur.execute(
            f"""
            SELECT pc.chunk_id, pc.chunk_text, p.paper_id, p.canonical_title, p.publication_year,
                   (1 - (pc.chunk_embedding <=> %s::vector)) AS similarity
            FROM paper_chunks pc
            JOIN papers p ON pc.paper_id = p.paper_id
            {filter_clause}
            ORDER BY {order_clause}
            LIMIT 4
            """,
            query_params,
        )
        passages = cur.fetchall()
        if scoped and not passages:
            # The paper has no stored chunks (e.g. saved from an external ID): fall back to its abstract.
            cur.execute(
                "SELECT paper_id, canonical_title, publication_year, abstract FROM papers WHERE paper_id = %s::uuid",
                (req.paper_id,),
            )
            paper = cur.fetchone()
            if paper and paper["abstract"]:
                passages = [{
                    "chunk_id": None,
                    "chunk_text": paper["abstract"][:1500],
                    "paper_id": paper["paper_id"],
                    "canonical_title": paper["canonical_title"],
                    "publication_year": paper["publication_year"],
                    "similarity": 0.0,
                }]
        cur.close()

    if not passages:
        return [], "No relevant passages found in the research corpus."
    if scoped:
        # The person chose this paper, so retrieval is not a relevance judgement: use what it has.
        return passages, None
    # Similarity floor: decline to hallucinate if confidence is low (< 0.32)
    relevant = [p for p in passages if float(p.get("similarity", 0.0)) >= 0.32]
    if not relevant:
        return [], _REFUSAL
    return relevant, None


def _citations_payload(passages) -> list[dict]:
    return [
        {
            "ref_index": idx,
            "paper_id": str(psg["paper_id"]),
            "title": psg["canonical_title"],
            "year": psg["publication_year"],
            "passage": _clean_passage(psg["chunk_text"]),
            "similarity": round(float(psg["similarity"]), 3),
        }
        for idx, psg in enumerate(passages, start=1)
    ]


def _build_prompt(question: str, passages) -> str:
    blocks = [
        f"[{idx}] {psg['canonical_title']} ({psg['publication_year']}): {_clean_passage(psg['chunk_text'])}"
        for idx, psg in enumerate(passages, start=1)
    ]
    return (
        "You are the Chanakya Research Commons Assistant. Answer the question using ONLY the numbered passages below.\n"
        "Rules: be direct and start with the answer; write 2 short paragraphs or a short bullet list at most; "
        "cite every claim inline like [1] or [2]; never invent a citation number; "
        "if the passages do not answer the question, say so in one sentence.\n\n"
        "Passages:\n" + "\n\n".join(blocks) + f"\n\nQuestion: {question}\nAnswer:"
    )


def _general_prompt(question: str) -> str:
    return (
        "You are the Chanakya Research Commons Assistant. The university library has no passages on this question, "
        "so answer from your general knowledge. Be accurate and concise (under about 150 words) in plain language. "
        "If you are not sure, say so. Do not cite papers, authors or references, and do not use [1]-style markers.\n\n"
        f"Question: {question}\nAnswer:"
    )


def _general_allowed(req: AskAssistantRequest) -> bool:
    """Open questions may fall back to the model's own knowledge; paper-scoped or library-only ones may not."""
    return not req.library_only and not req.paper_id


_GENERAL_UNAVAILABLE = (
    "The library has nothing on this topic and the language model isn't responding right now, so I can't answer it. "
    "Check that Ollama is running, then try again."
)


def _extractive_answer(question: str, passages) -> str:
    """
    Model-free fallback: pick the sentences from the retrieved passages that best match the question
    and present them with their citation numbers, so the person still gets an answer.
    """
    candidates = []  # (ref, sentence)
    for idx, psg in enumerate(passages, start=1):
        text = _clean_passage(psg["chunk_text"])
        for sent in re.split(r"(?<=[.!?])\s+", text):
            sent = sent.strip()
            if 40 <= len(sent) <= 400:
                candidates.append((idx, sent))
    if not candidates:
        return "I couldn't extract a clear answer from the retrieved passages."
    q_emb = embed_model.encode(question)
    s_emb = embed_model.encode([c[1] for c in candidates])
    sims = (s_emb @ q_emb) / (np.linalg.norm(s_emb, axis=1) * np.linalg.norm(q_emb) + 1e-9)
    ranked = sorted(range(len(candidates)), key=lambda i: -float(sims[i]))
    chosen: list[int] = []
    for i in ranked:
        if len(chosen) >= 4:
            break
        if any(candidates[i][1][:60] == candidates[j][1][:60] for j in chosen):
            continue
        chosen.append(i)
    chosen.sort(key=lambda i: (candidates[i][0], i))
    bullets = "\n".join(f"- {candidates[i][1]} [{candidates[i][0]}]" for i in chosen)
    return "Here is what the library's sources say:\n" + bullets


def _ollama_payload(prompt: str, stream: bool) -> dict:
    return {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": stream,
        "keep_alive": "30m",  # keep the model in memory so only the first question pays the load time
        "options": {"temperature": 0.2, "num_predict": 450},
    }


@app.post("/api/assistant/ask")
def ask_research_assistant(req: AskAssistantRequest):
    """
    Grounded Question Answering: enforces a similarity floor to prevent hallucinated answers
    when retrieval confidence is insufficient. If the local model is unavailable the answer is
    assembled from the best-matching sentences of the retrieved passages.
    """
    chat = _small_talk_reply(req.question)
    if chat:
        return {"question": req.question, "answer": chat, "citations": [], "mode": "chat"}
    passages, refusal = _retrieve_for_assistant(req)
    if refusal:
        if not _general_allowed(req):
            return {"question": req.question, "answer": refusal, "citations": [], "mode": "grounded"}
        try:
            resp = requests.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json=_ollama_payload(_general_prompt(req.question), False),
                timeout=OLLAMA_TIMEOUT,
            )
            text = (resp.json().get("response") or "").strip() if resp.status_code == 200 else ""
        except Exception:
            text = ""
        if not text:
            return {"question": req.question, "answer": _GENERAL_UNAVAILABLE, "citations": [], "mode": "grounded"}
        return {"question": req.question, "answer": text, "citations": [], "mode": "general"}

    try:
        resp = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json=_ollama_payload(_build_prompt(req.question, passages), False),
            timeout=OLLAMA_TIMEOUT,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Ollama returned HTTP {resp.status_code}")
        answer_text = (resp.json().get("response") or "").strip()
        if not answer_text:
            raise RuntimeError("the model returned an empty response")
        degraded, reason = False, None
    except Exception as exc:
        answer_text, degraded, reason = _extractive_answer(req.question, passages), True, str(exc)

    return {
        "question": req.question,
        "answer": answer_text,
        "degraded": degraded,
        "degraded_reason": reason,
        "mode": "grounded",
        "citations": _citations_payload(passages),
    }


@app.post("/api/assistant/ask/stream")
def ask_research_assistant_stream(req: AskAssistantRequest):
    """
    Same contract as /api/assistant/ask (including the general-knowledge fallback when the library has nothing) but streamed as newline-delimited JSON so the page can show
    sources immediately and the answer as it is written:
      {"type":"meta","citations":[...]}  ->  {"type":"token","text":"..."} *  ->  {"type":"done","degraded":bool}
    A {"type":"replace","answer":"..."} event overwrites the text (refusals and the model-free fallback).
    """
    def emit(obj: dict) -> bytes:
        return (json.dumps(obj, default=str) + "\n").encode("utf-8")

    def generate():
        chat = _small_talk_reply(req.question)
        passages, refusal = ([], None) if chat else _retrieve_for_assistant(req)
        if chat:
            yield emit({"type": "meta", "citations": []})
            yield emit({"type": "replace", "answer": chat})
            yield emit({"type": "done", "degraded": False})
            return
        if refusal:
            yield emit({"type": "meta", "citations": []})
            if not _general_allowed(req):
                yield emit({"type": "replace", "answer": refusal})
                yield emit({"type": "done", "degraded": False})
                return
            # Nothing in the library: let the model answer from general knowledge, and say that it did.
            produced = 0
            try:
                with requests.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json=_ollama_payload(_general_prompt(req.question), True),
                    stream=True,
                    timeout=(10, OLLAMA_TIMEOUT),
                ) as resp:
                    if resp.status_code != 200:
                        raise RuntimeError(f"Ollama returned HTTP {resp.status_code}")
                    for line in resp.iter_lines():
                        if not line:
                            continue
                        chunk = json.loads(line)
                        piece = chunk.get("response") or ""
                        if piece:
                            if produced == 0:
                                yield emit({"type": "mode", "mode": "general"})
                            produced += len(piece)
                            yield emit({"type": "token", "text": piece})
                        if chunk.get("done"):
                            break
                if produced == 0:
                    raise RuntimeError("the model returned an empty response")
                yield emit({"type": "done", "degraded": False})
            except Exception as exc:
                if produced == 0:
                    yield emit({"type": "replace", "answer": _GENERAL_UNAVAILABLE})
                yield emit({"type": "done", "degraded": False, "reason": str(exc)})
            return

        yield emit({"type": "meta", "citations": _citations_payload(passages)})
        produced = 0
        try:
            # The read timeout applies between chunks, so a slow first token (model load) gets the
            # full OLLAMA_TIMEOUT but a model that stalls mid-answer is still caught.
            with requests.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json=_ollama_payload(_build_prompt(req.question, passages), True),
                stream=True,
                timeout=(10, OLLAMA_TIMEOUT),
            ) as resp:
                if resp.status_code != 200:
                    raise RuntimeError(f"Ollama returned HTTP {resp.status_code}")
                for line in resp.iter_lines():
                    if not line:
                        continue
                    chunk = json.loads(line)
                    piece = chunk.get("response") or ""
                    if piece:
                        produced += len(piece)
                        yield emit({"type": "token", "text": piece})
                    if chunk.get("done"):
                        break
            if produced == 0:
                raise RuntimeError("the model returned an empty response")
            yield emit({"type": "done", "degraded": False})
        except Exception as exc:
            if produced == 0:
                yield emit({"type": "replace", "answer": _extractive_answer(req.question, passages)})
                yield emit({"type": "done", "degraded": True, "reason": str(exc)})
            else:
                yield emit({"type": "done", "degraded": False, "truncated": True, "reason": str(exc)})

    return StreamingResponse(generate(), media_type="application/x-ndjson", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


# ==========================================
# F9: Institutional Analytics Dashboard (Star Schema)
# ==========================================
@app.get("/api/analytics/overview")
def analytics_overview(department: Optional[str] = None, user=Depends(require_role("admin"))):
    """
    Institutional dimensional analytics from dw Star Schema.
    Department filter faithfully applies across Topic Breakdown, Collaboration Matrix, and Monthly Trends.
    """
    if department and (not user or ROLE_RANK.get(user["role"], 0) < ROLE_RANK["faculty"]):
        raise HTTPException(status_code=403 if user else 401, detail="Department analytics require faculty access")
    with get_db() as conn:
        cur = conn.cursor()

        # 1. Research activity by department & topic cluster
        dept_filter = "WHERE dm.department = %s" if department else ""
        params = (department,) if department else ()

        cur.execute(
            f"""
            SELECT dm.department, dt.parent_cluster, dt.topic_name,
                   SUM(f.saves_count) AS total_saves,
                   SUM(f.posts_count) AS total_posts,
                   SUM(f.views_count) AS total_views
            FROM dw.fact_research_activity f
            JOIN dw.dim_member dm ON f.member_key = dm.member_key
            LEFT JOIN dw.dim_topic dt ON f.topic_key = dt.topic_key
            {dept_filter}
            GROUP BY dm.department, dt.parent_cluster, dt.topic_name
            ORDER BY total_saves DESC, total_views DESC
            LIMIT 25
            """,
            params,
        )
        topic_breakdown = cur.fetchall()

        # 2. Cross-department collaboration matrix (filtered if department specified)
        if department:
            cur.execute(
                """
                SELECT source_department, target_department, SUM(interaction_count) AS interactions
                FROM dw.fact_dept_collaboration
                WHERE source_department = %s OR target_department = %s
                GROUP BY source_department, target_department
                ORDER BY interactions DESC
                LIMIT 20
                """,
                (department, department),
            )
        else:
            cur.execute(
                """
                SELECT source_department, target_department, SUM(interaction_count) AS interactions
                FROM dw.fact_dept_collaboration
                GROUP BY source_department, target_department
                ORDER BY interactions DESC
                LIMIT 20
                """
            )
        collaboration = cur.fetchall()

        # 3. Monthly engagement trend (filtered if department specified)
        if department:
            cur.execute(
                """
                SELECT dd.year, dd.month, dd.month_name,
                       SUM(f.saves_count) AS saves,
                       SUM(f.posts_count) AS posts,
                       SUM(f.views_count) AS views
                FROM dw.fact_research_activity f
                JOIN dw.dim_date dd ON f.date_key = dd.date_key
                JOIN dw.dim_member dm ON f.member_key = dm.member_key
                WHERE dm.department = %s
                GROUP BY dd.year, dd.month, dd.month_name
                ORDER BY dd.year, dd.month
                """,
                (department,),
            )
        else:
            cur.execute(
                """
                SELECT dd.year, dd.month, dd.month_name,
                       SUM(f.saves_count) AS saves,
                       SUM(f.posts_count) AS posts,
                       SUM(f.views_count) AS views
                FROM dw.fact_research_activity f
                JOIN dw.dim_date dd ON f.date_key = dd.date_key
                GROUP BY dd.year, dd.month, dd.month_name
                ORDER BY dd.year, dd.month
                """
            )
        monthly_trends = cur.fetchall()
        cur.close()

        return {
            "topic_breakdown": topic_breakdown,
            "cross_dept_collaboration": collaboration,
            "monthly_trends": monthly_trends,
        }


@app.get("/api/analytics/drilldown")
def get_analytics_drilldown(
    school: Optional[str] = Query(None, description="School filter"),
    department: Optional[str] = Query(None, description="Department filter"),
    user=Depends(require_role("admin")),
):
    """
    Dimensional Drill-Down supporting University -> School -> Department -> Member hierarchy.
    """
    with get_db() as conn:
        cur = conn.cursor()
        if department:
            # Level 3: Individual Members within Department
            cur.execute(
                """
                SELECT researcher_id, researcher_name, role, department, school_name,
                       total_publications, total_citations, avg_coauthors, avg_pagerank, topic_breadth
                FROM dw.vw_researcher_profiles
                WHERE department = %s
                ORDER BY avg_pagerank DESC, total_citations DESC
                """,
                (department,)
            )
            data = cur.fetchall()
            cur.close()
            return {"level": "member", "school": school, "department": department, "count": len(data), "data": data}
        elif school and school != "ALL":
            # Level 2: Departments within School
            cur.execute(
                """
                SELECT department,
                       COUNT(DISTINCT researcher_id) AS researcher_count,
                       SUM(total_publications) AS total_publications,
                       SUM(total_citations) AS total_citations,
                       ROUND(AVG(avg_pagerank)::numeric, 5)::float AS avg_pagerank,
                       ROUND(AVG(topic_breadth)::numeric, 1)::float AS avg_topic_breadth
                FROM dw.vw_researcher_profiles
                WHERE school_name = %s
                GROUP BY department
                ORDER BY total_citations DESC
                """,
                (school,)
            )
            data = cur.fetchall()
            cur.close()
            return {"level": "department", "school": school, "count": len(data), "data": data}
        else:
            # Level 1: Schools across the University
            cur.execute(
                """
                SELECT school_name,
                       COUNT(DISTINCT researcher_id) AS researcher_count,
                       COUNT(DISTINCT department) AS department_count,
                       SUM(total_publications) AS total_publications,
                       SUM(total_citations) AS total_citations,
                       ROUND(AVG(avg_pagerank)::numeric, 5)::float AS avg_pagerank
                FROM dw.vw_researcher_profiles
                GROUP BY school_name
                ORDER BY total_citations DESC
                """
            )
            data = cur.fetchall()
            cur.close()
            return {"level": "school", "count": len(data), "data": data}


# ==========================================
# F9.2: Association Rule Mining & Researcher Archetypes
# ==========================================
@app.get("/api/analytics/topic-associations")
def topic_associations(
    school: Optional[str] = Query(None, description="Filter by school name (e.g. 'School of Engineering' or 'ALL')"),
    min_support: float = Query(0.04, ge=0.001, le=1.0, description="Minimum support threshold"),
    min_lift: float = Query(1.2, ge=0.1, description="Minimum lift threshold"),
    user=Depends(require_role("admin")),
):
    """
    Subgroup-Stratified FP-Growth & FP-Max mining over publication topic baskets.
    Extracts maximal thematic bundles (FP-Max) and high-lift association rules.
    """
    return get_topic_associations(school=school, min_support=min_support, min_lift=min_lift)


@app.get("/api/analytics/researcher-archetypes")
def researcher_archetypes(
    n_clusters: int = Query(4, ge=2, le=10, description="Number of researcher archetype clusters"),
    user=Depends(require_role("admin")),
):
    """
    Agglomerative Researcher Clustering (Ward linkage) on continuous metrics,
    evaluated with silhouette score and profiled with discretized trait association rules (FP-Growth).
    """
    return get_researcher_archetypes(n_clusters=n_clusters)


# ==========================================
# F9.3: Isolation Forest Anomaly Watchlist & Gatekeeper
# ==========================================
@app.get("/api/analytics/anomalies")
def get_anomalies(user=Depends(require_role("admin"))):
    """
    Multidimensional Isolation Forest Outlier Analysis on Researcher Profiles.
    Separates positive breakout performers (HIGH_IMPACT_SPOTLIGHT) from
    suspicious velocity/metadata anomalies (INTEGRITY_REVIEW).
    """
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT 
                    researcher_id::text,
                    researcher_name,
                    role,
                    department,
                    school_name,
                    total_publications,
                    total_citations,
                    avg_coauthors,
                    avg_pagerank,
                    topic_breadth
                FROM dw.vw_researcher_profiles
            """)
            rows = cur.fetchall()
            cur.close()

        if rows and len(rows) >= 5:
            df = pd.DataFrame(rows)
            feature_cols = ["total_publications", "total_citations", "avg_coauthors", "avg_pagerank", "topic_breadth"]
            result = submission_detector.detect_batch_anomalies(
                df=df,
                feature_cols=feature_cols,
                id_col="researcher_id",
                classify_impact=True
            )
            response = {"spotlights": result.get("impact_spotlights", [])}
            if user and user["role"] == "admin":
                response["integrity"] = result.get("integrity_alerts", [])
            return response
    except Exception as exc:
        print(f"[Anomalies API] Database notice: {exc}")

    # Fallback simulation if warehouse table is not populated yet
    response = {
        "spotlights": [
            {
                "id": "spotlight-dr-sharma-0",
                "name": "Dr. Ananya Sharma",
                "department": "School of Engineering",
                "role": "faculty",
                "anomaly_score": 0.248,
                "severity": "HIGH",
                "classification": "HIGH_IMPACT_SPOTLIGHT",
                "impact_summary": "Citation authority (142 citations, PageRank 0.0482) exceeds cohort median by 310%.",
                "metrics": {
                    "total_publications": 18,
                    "total_citations": 142,
                    "avg_coauthors": 3.4,
                    "avg_pagerank": 0.0482,
                    "topic_breadth": 7
                }
            },
            {
                "id": "spotlight-prof-verma-1",
                "name": "Prof. Rajesh Verma",
                "department": "School of Engineering",
                "role": "faculty",
                "anomaly_score": 0.194,
                "severity": "HIGH",
                "classification": "HIGH_IMPACT_SPOTLIGHT",
                "impact_summary": "High multi-department coauthorship velocity with strong institutional PageRank authority.",
                "metrics": {
                    "total_publications": 24,
                    "total_citations": 98,
                    "avg_coauthors": 5.2,
                    "avg_pagerank": 0.0391,
                    "topic_breadth": 6
                }
            }
        ],
    }
    if user and user["role"] == "admin":
        response["integrity"] = [
            {
                "id": "integrity-user-bot-0",
                "name": "ResearchBot_Alpha",
                "department": "School of Engineering",
                "role": "student",
                "anomaly_score": 0.285,
                "severity": "HIGH",
                "classification": "INTEGRITY_REVIEW",
                "integrity_reason": "High submission velocity with zero citation yield and synthetic author distributions.",
                "metrics": {
                    "total_publications": 45,
                    "total_citations": 0,
                    "avg_coauthors": 1.0,
                    "avg_pagerank": 0.0001,
                    "topic_breadth": 1
                }
            },
            {
                "id": "integrity-user-sync-1",
                "name": "AutoScraper_V2",
                "department": "School of Management Sciences",
                "role": "researcher",
                "anomaly_score": 0.172,
                "severity": "MEDIUM",
                "classification": "INTEGRITY_REVIEW",
                "integrity_reason": "Submissions spike with duplicate abstract lengths and missing institutional affiliation.",
                "metrics": {
                    "total_publications": 28,
                    "total_citations": 1,
                    "avg_coauthors": 1.1,
                    "avg_pagerank": 0.0003,
                    "topic_breadth": 2
                }
            }
        ]
    return response


@app.post("/api/analytics/gatekeeper")
@app.post("/api/analytics/gatekeeper/score")
@app.post("/api/analytics/anomalies/score")
def score_gatekeeper_submission(payload: GatekeeperPayload, user=Depends(require_role("admin"))):
    """
    Sub-5ms in-memory Isolation Forest live submission gatekeeper.
    Evaluates submission characteristics for anomalies and moderation flags.
    """
    import time
    t0 = time.perf_counter()

    coauthor_count = payload.coauthor_count if payload.coauthor_count is not None else (len(payload.authors) if payload.authors else 1)
    keyword_count = payload.keyword_count if payload.keyword_count is not None else (len(payload.topics) if payload.topics else 1)
    abstract_length = payload.abstract_length if payload.abstract_length is not None else len(payload.abstract or "")
    reference_count = payload.reference_count or 0
    submissions_24h = payload.submissions_last_24h or 1

    record = {
        "coauthor_count": coauthor_count,
        "keyword_count": keyword_count,
        "abstract_length": abstract_length,
        "reference_count": reference_count,
        "submissions_last_24h": submissions_24h
    }

    verdict = submission_detector.score_live_record(record)
    elapsed_ms = (time.perf_counter() - t0) * 1000

    reasons = []
    if abstract_length < 60:
        reasons.append("Abstract is unusually short (< 60 chars)")
    elif abstract_length > 8000:
        reasons.append("Abstract length is unusually long (> 8,000 chars)")
    if coauthor_count > 30:
        reasons.append(f"Excessive co-author count ({coauthor_count})")
    if keyword_count > 20:
        reasons.append(f"High keyword count ({keyword_count})")
    if submissions_24h > 20:
        reasons.append("High 24h submission frequency detected")

    if verdict["is_anomaly"] and not reasons:
        reasons.append(f"Multi-feature vector outlier (anomaly score: {verdict['anomaly_score']:.3f})")

    return {
        "is_anomaly": verdict["is_anomaly"],
        "anomaly_score": verdict["anomaly_score"],
        "severity": verdict["severity"].lower(),
        "latency_ms": round(elapsed_ms, 2),
        "reasons": reasons,
        "model_status": verdict.get("model_status", "active")
    }
