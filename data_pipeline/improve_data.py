"""
Improve the seeded Chanakya Research Commons data.

What it does (all in ONE transaction, safe to re-run):
  1. Replaces the placeholder member names ("Member 1 (Computer)") with realistic names
     (titles "Dr." / "Prof." for the admin and faculty) and syncs dw.dim_member.
  2. Rewrites the 2,000 identical comment bodies with varied, academic comments that refer to
     the post's paper / topic. About a third become threaded replies, and every comment is
     timestamped after the post it belongs to (the original seed could put them before it).
  3. Regenerates ~500 post votes (mostly +1, a few -1) with a realistic long-tail distribution
     (a few popular posts, many quiet ones) and recomputes posts.upvote_count from the ledger.

Usage (from the repository root, with the Docker Postgres running):
    python data_pipeline/improve_data.py                 # apply to the database
    python data_pipeline/improve_data.py --sql-only      # only write improve_data.sql, change nothing
    python data_pipeline/improve_data.py --update-emails # also change member emails to first.last@...

Afterwards refresh the warehouse so analytics picks up the new names/timestamps:
    python data_pipeline/run_dw_elt.py

Only the 60 seeded members (university_id 24CU1000-24CU1059, is_synthetic = TRUE) are renamed; the
real account is never touched. The generated SQL is also written to data_pipeline/improve_data.sql.
"""
from __future__ import annotations

import argparse
import os
import random
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg2
from psycopg2.extras import RealDictCursor, register_uuid
from dotenv import load_dotenv
load_dotenv()

DB_URL = os.getenv("DATABASE_URL")

if not DB_URL:
    raise RuntimeError("DATABASE_URL is not set. Copy .env.example to .env and fill it in (see README, Environment Variables).")

SQL_OUT = Path(__file__).with_name("improve_data.sql")
SEED = 20261124
TARGET_VOTES = 500

# --------------------------------------------------------------------------------------
# 1. Member names. Index i matches university_id 24CU{1000 + i} from seed_database.py.
#    Roles in the seed: 0 = admin, i % 8 == 0 = faculty, i % 5 == 0 = researcher, else student.
#    Indexes 55-59 are the five planted spam accounts (they get normal names; they are
#    identified by behaviour, not by how their name looks).
# --------------------------------------------------------------------------------------
NAMES = [
    "Aditi Menon", "Rohan Iyer", "Priya Nair", "Arjun Reddy", "Kavya Krishnan", "Siddharth Rao",
    "Ananya Bhatt", "Vikram Singh", "Meera Kulkarni", "Karthik Subramanian", "Ishita Chatterjee",
    "Aarav Patel", "Neha Gupta", "Rahul Verma", "Sneha Pillai", "Aditya Joshi", "Lakshmi Narayanan",
    "Harsh Agarwal", "Divya Shetty", "Nikhil Deshpande", "Pooja Banerjee", "Manish Tiwari",
    "Shreya Kapoor", "Varun Malhotra", "Rekha Hegde", "Tanvi Mehta", "Abhishek Mishra",
    "Fatima Sheikh", "Gaurav Chauhan", "Swati Raman", "Deepak Nambiar", "Anjali Desai",
    "Suresh Venkatesh", "Pallavi Kamath", "Yash Saxena", "Radhika Sen", "Imran Qureshi",
    "Bhavana Gowda", "Tarun Bansal", "Mallika Das", "Ramesh Bhat", "Sanya Arora", "Kunal Thakur",
    "Nandini Prasad", "Omkar Jadhav", "Aishwarya Iyengar", "Zoya Khan", "Prakash Naidu",
    "Sunita Rathore", "Dev Mukherjee", "Charulatha Sundaram", "Jatin Khanna", "Rutuja Patil",
    "Faizan Ahmed", "Keerthana Murthy", "Rajat Soni", "Mohit Bhardwaj", "Simran Kaur",
    "Anil Pandey", "Tripti Sharma",
]
assert len(NAMES) == 60 and len(set(NAMES)) == 60


def display_name(i: int) -> str:
    base = NAMES[i]
    if i == 0:
        return f"Dr. {base}"
    if i % 8 == 0:  # faculty
        return f"{'Prof.' if (i // 8) % 2 == 1 else 'Dr.'} {base}"
    return base


def email_for(i: int) -> str:
    first, last = NAMES[i].lower().split()[0], NAMES[i].lower().split()[-1]
    return f"{first}.{last}@chanakyauniversity.edu.in"


# --------------------------------------------------------------------------------------
# 2. Comment generator
# --------------------------------------------------------------------------------------
SAHSS = "School of Arts, Humanities and Social Sciences"
SBS = "School of Biosciences"
SOE = "School of Engineering"
SLGPP = "School of Law, Governance and Public Policy"
SMS = "School of Management Sciences"
SMNS = "School of Mathematics and Natural Sciences"

DEPT_SHORT = {
    SAHSS: "humanities and social sciences",
    SBS: "biosciences",
    SOE: "engineering",
    SLGPP: "law and policy",
    SMS: "management",
    SMNS: "mathematical",
}
# Names used before the move to the six official schools (db/migrations/003_chanakya_schools.sql) still work.
LEGACY = {
    "Computer Science & AI": SOE,
    "Electronics & Communication": SOE,
    "Biotechnology": SBS,
    "Management & Commerce": SMS,
    "School of Law": SLGPP,
    "Liberal Arts & Humanities": SAHSS,
}
DEPT_NAMES = set(DEPT_SHORT) | set(LEGACY)


def canon(dept: str | None) -> str | None:
    return LEGACY.get(dept, dept) if dept else dept


STOP = set(
    """a an the and or of to in on for with by from as at is are was were be been being this that these those it its
    we our their his her they them you your i can could may might will would should must not no nor but if then than
    so such into over under between among across within without about after before during using use used based via per
    also however thus hence while which who whom whose what when where why how more most less least many much very
    paper papers study studies approach approaches method methods result results show shows shown propose proposed
    present presents presented novel new work works analysis model models data dataset datasets task tasks problem
    problems performance results demonstrate demonstrates evaluate evaluation different various several both each
    other another one two three first second well high low large small recent existing key main overall further""".split()
)


TITLE_STOP = set(
    """a an the and or of to in on for with by from as at is are was were be been being this that these those it its
    we our their you your can could may might will would should not no nor but if then than so into over under
    between among across within without about after before via per using use used based toward towards vs versus
    all only more most less what when where why how which who""".split()
)
GENERIC_WORDS = {"survey", "review", "overview", "introduction", "novel", "comprehensive", "systematic", "empirical", "perspective", "perspectives", "case", "study"}


def concepts_from(title: str, limit: int = 4) -> list[str]:
    """Noun-phrase chunks of a paper title: runs of content words between stop words / punctuation.

    'Federated Learning with Differential Privacy Guarantees' -> ['federated learning', 'differential privacy guarantees']
    """
    chunks: list[str] = []
    run: list[str] = []
    for raw in re.findall(r"[A-Za-z][A-Za-z\-]*|[:,;()\u2014]", title) + ["."]:
        tok = raw.lower()
        if tok[0].isalpha() and tok not in TITLE_STOP:
            run.append(raw if (raw.isupper() and len(raw) > 1) else tok)  # keep acronyms (CRISPR, BERT)
            continue
        if run:
            words = [w for w in run if w.lower() not in GENERIC_WORDS]
            if len(words) >= 2 or (len(words) == 1 and len(words[0]) >= 7):
                chunks.append(" ".join(words[:4]))
            run = []
    seen: list[str] = []
    for c in chunks:
        if c not in seen:
            seen.append(c)
    return seen[:limit]


def short_title(title: str) -> str:
    t = re.split(r"[:—]", title)[0].strip()
    words = t.split()
    if len(words) > 9:
        t = " ".join(words[:9]).rstrip(",;") + "…"
    return t


# Openers answering the post itself
OPEN_TOP = [
    "Thanks for bringing this up; {title_ref} is a useful lens on {topic}.",
    "This is a timely question, and we ran into something similar while working on {topic}.",
    "Interesting thread. My first reaction is that the {concept} piece is doing most of the heavy lifting here.",
    "Good question. I read {title_ref} a few weeks ago and it has stayed with me.",
    "I have been following this line of work on {topic} for a while, so I'm glad it came up.",
    "Short answer from my side: it depends heavily on the data you start with.",
    "Appreciate you sharing this with the group.",
    "Worth discussing properly, because the topic of {topic} keeps coming up in our seminars.",
    "I skimmed {title_ref} last week, and the framing of {concept} is the part I would discuss first.",
    "Great discussion starter; the core idea around {concept} is easy to underestimate.",
    "Quick note before the details: I'm reading this mostly from a {dept_short} point of view.",
    "Honest take: the results look promising, but I would hold off on strong conclusions.",
    "This lines up with what we have seen when applying {topic} in practice.",
    "I tried reproducing a small part of this and had mixed results.",
    "Nice find, and a good reminder that the {concept} question deserves more attention than it gets.",
    "I think the interesting part of {title_ref} is less the headline number and more how it handles {concept}.",
]
# Openers when replying to another commenter
OPEN_REPLY = [
    "Good point, {pf}; I had not considered that angle on {topic}.",
    "I see it a little differently, {pf}.",
    "{pf}, that matches my experience too.",
    "Thanks {pf}, that clarifies the {concept} part for me.",
    "Building on {pf}'s comment, the {concept} assumption matters a lot here.",
    "{pf}, could you say more about how you handled {concept}?",
    "Agreed with {pf} on the main point.",
    "Fair objection, {pf}, though I think it depends on the dataset.",
    "I would gently disagree, {pf}: the evidence for {concept} is thinner than it looks.",
    "Helpful context, {pf}.",
    "That is a fair summary, {pf}, but one detail about {topic} is missing.",
    "{pf}, this is the kind of detail that rarely makes it into the paper.",
]
# Openers when the post's author replies to a commenter
OPEN_OP = [
    "Thanks {pf}, this is exactly the feedback I was hoping for.",
    "Appreciate the pointers, {pf}; I will try that on my next run.",
    "Good catch, {pf}. I should have been clearer about the setup around {concept}.",
    "{pf}, that is a fair concern, and I will check it before drawing conclusions about {topic}.",
    "Thanks for pushing on this, {pf}; I'll report back once I have numbers for {concept}.",
]
# Follow-up when the post's author comments on their own post with nobody to reply to
OPEN_OP_SELF = [
    "Update from my side: I re-read {title_ref} and the {concept} section changes my view slightly.",
    "Adding some context from my own notes on {topic}, in case it helps the discussion.",
    "Quick follow-up to my post: I'll keep a running list of what we learn about {concept} here.",
]

EXPERIENCE = [
    "In our group we used {concept} on a small {topic} dataset, and the gains were modest but consistent.",
    "When we tried a similar setup for {topic}, preprocessing choices changed the outcome more than the model did.",
    "A colleague's project on {topic} hit the same issue with {concept}.",
    "We saw noticeable sensitivity to random seeds, so I would report results over several runs.",
    "Last semester's reading group went through {title_ref}, and most of the debate centred on {concept}.",
    "On our side the {concept} step was the bottleneck, not the main method.",
    "We reproduced part of this for {topic} and the trend held, although the absolute numbers were lower.",
    "In a small pilot, the approach worked well on clean data and degraded quickly on messy real-world input.",
    "Our lab has been collecting notes on {concept}; the picture is more nuanced than the abstract suggests.",
]
CRITIQUE = [
    "My main concern is whether the evaluation reflects realistic conditions for {topic}.",
    "The comparison would be more convincing with a stronger baseline and a proper ablation of {concept}.",
    "I would be cautious about generalising beyond the datasets reported in the paper.",
    "It is not clear how much of the improvement comes from {concept} versus simply more tuning.",
    "Reporting confidence intervals would make the claims around {topic} easier to trust.",
    "Scalability is the open question; it is unclear how this behaves when the data grows by an order of magnitude.",
    "The limitations section is thin, especially regarding {concept}.",
    "Several of the reported gains are small enough that they could disappear under a different split.",
    "I worry the benchmark is too close to the training setup to say much about {topic} in the wild.",
]
QUESTION = [
    "Did you check how it performs when the input around {concept} is noisy or partially missing?",
    "Which metric did you prioritise, and does the ranking change if you pick another one?",
    "Has anyone compared this against a simple baseline for {topic}?",
    "Is the code or the exact configuration available so we can reproduce the {concept} results?",
    "How sensitive is it to the choice of hyperparameters?",
    "What would it take to adapt this to a different domain, say {topic2}?",
    "Do the authors say anything about computational cost for {concept}?",
    "Is there a public dataset we could use to test {concept} ourselves?",
    "How does this compare with last year's work on {topic2}?",
]
SUGGEST = [
    "It could be worth pairing this with ideas from {topic2}; the overlap with {concept} looks real.",
    "One option is to run a small ablation on {concept} and share the numbers with the group.",
    "I would suggest a pilot on a small subset first, then scale up if the {topic} results hold.",
    "If you are open to it, we could draft a short comparison note for the reading group.",
    "A cleaner experiment might isolate {concept} and keep everything else fixed.",
    "It may help to add a qualitative error analysis alongside the headline metrics.",
    "Consider tracking {concept} separately so that regressions are easier to spot.",
]
RELATED = [
    "This connects to the work on {topic2}, which tackles a similar trade-off from a different direction.",
    "For context, the {topic2} literature has been debating a very similar question for some time.",
    "Related reading: surveys on {topic2} cover the background on {concept} nicely.",
    "There is a useful parallel with {topic2}, where the role of {concept} is comparable.",
    "The recent papers in our library on {topic2} would make a good companion read.",
]
DEPT_LENS = {
    SOE: [
        "From an engineering angle, I would want to see how {topic} behaves under distribution shift before relying on it.",
        "Computationally, the question is whether investing in {concept} still pays off once you account for training and inference cost.",
        "On the hardware side, any {topic} pipeline would have to fit a tight power and latency budget, so I would profile it on a real board.",
        "In deployment, noise and quantisation tend to hurt {concept} more than simulation suggests.",
        "A leaderboard number alone will not tell us whether work on {topic} is robust enough for deployment.",
        "I would like to see a measured latency figure rather than an estimate for {topic}.",
    ],
    SBS: [
        "For wet-lab collaborators, the useful question is whether the {topic} results survive biological replicates rather than a single benchmark.",
        "Before this informs experiments, we would need validation on independent samples for {concept}.",
        "The biological interpretation of {concept} is where I would be most careful.",
        "A negative control would make the {topic} claims much easier to interpret in a lab setting.",
    ],
    SMS: [
        "From a management perspective, the interesting part is the cost-benefit: what would adopting {topic} change for a firm's decisions?",
        "I would want evidence that {concept} translates into measurable business outcomes, not only better metrics.",
        "Adoption is usually limited by process and incentives, so any plan to adopt {topic} needs a realistic rollout story.",
        "It would help to see how {concept} performs for smaller organisations with limited data.",
    ],
    SLGPP: [
        "There is a regulatory angle here: work on {topic} raises questions about data governance, consent and accountability that we should map early.",
        "From a legal standpoint, how {concept} is documented will matter if the results are ever challenged.",
        "Liability and transparency around {topic} are still unsettled, and this paper does not address them.",
        "I would flag the privacy and public-policy implications of {concept} before anyone builds on it.",
    ],
    SAHSS: [
        "I would add a humanities lens: how research on {topic} is framed and interpreted matters as much as the technical result.",
        "Public-facing claims about {concept} deserve careful wording, since non-specialists will read them very differently.",
        "The social context of {topic} is largely absent here, and I think it changes how we should read the findings.",
        "It would be worth asking whose perspective is missing from the data behind {concept}.",
    ],
    SMNS: [
        "From a statistical point of view, I would want to see uncertainty estimates around the {topic} results, not only point values.",
        "It would help to state the assumptions behind {concept} formally and check which of them actually hold.",
        "A sensitivity analysis would show how stable the conclusions about {topic} are to small changes in the data.",
        "I would like to see a simple analytical baseline for {concept} before trusting the more elaborate method.",
    ],
}
CLOSERS = [
    "Happy to share my notes if that helps.",
    "I would be glad to discuss this at the next group meeting.",
    "Looking forward to hearing what others think.",
    "Let me know if a joint write-up would be useful.",
    "I will revisit this after I have had time to run a few experiments.",
    "Keen to see follow-up results.",
    "Sharing a few references in the group folder later this week.",
]
SHORT = [
    "Agreed; this is worth benchmarking properly.",
    "+1, this deserves a proper replication.",
    "Solid point, and well put.",
    "Bookmarked for our next reading group.",
    "Saving this; the {concept} angle is useful.",
    "Useful pointer, thank you.",
    "Worth a closer look when we plan the next {topic} project.",
]

CROSS_CUTTING = {SMS, SLGPP, SAHSS, SMNS}
GENERIC_TOPICS = ["machine learning", "data analysis", "research methodology", "evaluation practice"]
GENERIC_CONCEPTS = ["the evaluation protocol", "the core assumption", "the experimental setup", "the data pipeline"]


class CommentWriter:
    def __init__(self, rng: random.Random):
        self.rng = rng
        self.used: set[str] = set()

    def _pick(self, pool: list[str]) -> str:
        return self.rng.choice(pool)

    def _ctx(self, post: dict, author: dict, parent_author: str | None) -> dict:
        r = self.rng
        tags = [t for t in (post.get("tags") or []) if t not in DEPT_NAMES]
        ptopics = [t for t in (post.get("paper_topics") or []) if t not in DEPT_NAMES]
        pool = ptopics or tags or GENERIC_TOPICS
        topic = r.choice(pool)
        others = [t for t in tags + list(author.get("interest_tags") or []) + ptopics if t != topic and t not in DEPT_NAMES] or GENERIC_TOPICS
        cs = concepts_from(post["paper_title"]) if post.get("paper_title") else []
        cs = [c for c in cs if c != topic] or cs or GENERIC_CONCEPTS
        r.shuffle(cs)
        concept = cs[0]
        title = short_title(post["paper_title"]) if post.get("paper_title") else None
        title_ref = f"“{title}”" if title and r.random() < 0.7 else ("the paper" if title else "this")
        return {
            "topic": topic,
            "topic2": r.choice(others),
            "concept": concept,
            "concepts": cs,
            "title_ref": title_ref,
            "dept_short": DEPT_SHORT.get(canon(author.get("department")), "interdisciplinary"),
            "pf": parent_author or "",
        }

    def write(self, post: dict, author: dict, parent_author: str | None, is_op: bool) -> str:
        r = self.rng
        for attempt in range(60):
            n = r.choices([1, 2, 3, 4], weights=[20, 35, 30, 15])[0]
            if attempt > 30:
                n = max(n, 3)
            ctx = self._ctx(post, author, parent_author)
            parts: list[str] = []
            if n == 1:
                if parent_author:
                    parts.append(self._pick(OPEN_OP if is_op else OPEN_REPLY))
                else:
                    parts.append(self._pick(r.choice([OPEN_TOP, QUESTION, CRITIQUE, SUGGEST, SHORT, SHORT])))
            else:
                if parent_author:
                    parts.append(self._pick(OPEN_OP if is_op else OPEN_REPLY))
                elif is_op:
                    parts.append(self._pick(OPEN_OP_SELF))
                else:
                    parts.append(self._pick(OPEN_TOP))
                dept = canon(author.get("department"))
                paper_schools = {canon(t) for t in (post.get("paper_topics") or []) if t in DEPT_NAMES}
                # Law / management / humanities / maths lenses fit any paper; technical lenses only when the paper is in that school.
                lens_ok = dept in CROSS_CUTTING or dept in paper_schools
                body_pools = [EXPERIENCE, CRITIQUE, QUESTION, SUGGEST, RELATED, DEPT_LENS[dept] if lens_ok and dept in DEPT_LENS else RELATED]
                weights = [3, 3, 3, 2, 2, 3]
                chosen: list[list[str]] = []
                want = n - 1 - (1 if n == 4 else 0)
                while len(chosen) < want:
                    pool = r.choices(body_pools, weights=weights)[0]
                    if pool not in chosen:
                        chosen.append(pool)
                parts += [self._pick(p) for p in chosen]
                if n == 4:
                    parts.append(self._pick(CLOSERS))
            rendered = []
            for k, part in enumerate(parts):  # rotate through the paper's concepts so a comment does not repeat one phrase
                rendered.append(part.format(**{**ctx, "concept": ctx["concepts"][k % len(ctx["concepts"])]}))
            text = " ".join(rendered)
            text = re.sub(r"\s+", " ", text).strip()
            if text not in self.used:
                self.used.add(text)
                return text
        raise RuntimeError("could not generate a unique comment")  # pragma: no cover


# --------------------------------------------------------------------------------------
# 3. Build SQL
# --------------------------------------------------------------------------------------
def build(conn, rng: random.Random, update_emails: bool) -> list[str]:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    sql: list[str] = []

    def lit(query: str, params: tuple | list | None = None) -> str:
        return cur.mogrify(query, params).decode()

    now = datetime.now(timezone.utc)

    # ---- members ----
    cur.execute(
        "SELECT user_id::text, university_id, role, department, interest_tags, full_name FROM users WHERE is_synthetic = TRUE"
    )
    members = {}
    for u in cur.fetchall():
        m = re.fullmatch(r"24CU(\d{4})", u["university_id"] or "")
        if m and 0 <= int(m.group(1)) - 1000 < 60:
            members[u["user_id"]] = {**u, "idx": int(m.group(1)) - 1000}
    if not members:
        raise SystemExit("No seeded members (24CU1000-24CU1059, is_synthetic) found - run seed_database.py first.")

    for uid, u in sorted(members.items(), key=lambda kv: kv[1]["idx"]):
        i = u["idx"]
        u["new_name"] = display_name(i)
        if update_emails:
            sql.append(lit("UPDATE users SET full_name = %s, email = %s WHERE user_id = %s::uuid", (u["new_name"], email_for(i), uid)))
        else:
            sql.append(lit("UPDATE users SET full_name = %s WHERE user_id = %s::uuid", (u["new_name"], uid)))
    sql.append(
        "DO $$ BEGIN IF to_regclass('dw.dim_member') IS NOT NULL THEN "
        "UPDATE dw.dim_member dm SET full_name = u.full_name FROM users u WHERE dm.user_id = u.user_id; END IF; END $$;"
    )

    spam_ids = {uid for uid, u in members.items() if u["idx"] >= 55}
    voters = [uid for uid in members if uid not in spam_ids]

    # ---- posts ----
    cur.execute(
        """
        SELECT p.post_id::text, p.author_id::text, p.title, p.tags, p.created_at,
               pa.canonical_title AS paper_title, pa.abstract AS paper_abstract, pa.topics AS paper_topics
        FROM posts p LEFT JOIN papers pa ON pa.paper_id = p.attached_paper_id
        """
    )
    posts = {p["post_id"]: p for p in cur.fetchall()}
    is_spam_post = {
        pid: (p["author_id"] in spam_ids or (p["title"] or "").upper().startswith("URGENT:")) for pid, p in posts.items()
    }

    # ---- comments ----
    cur.execute("SELECT comment_id::text, post_id::text, author_id::text, created_at FROM comments ORDER BY comment_id")
    by_post: dict[str, list[dict]] = defaultdict(list)
    for c in cur.fetchall():
        if c["post_id"] in posts:
            by_post[c["post_id"]].append(c)

    cur.execute("SELECT user_id::text, full_name, department, interest_tags FROM users")
    people = {u["user_id"]: u for u in cur.fetchall()}
    for uid, m in members.items():
        people[uid]["full_name"] = m["new_name"]  # use the new names in replies

    writer = CommentWriter(rng)
    comment_rows: list[tuple] = []
    n_replies = 0
    for pid, items in by_post.items():
        post = posts[pid]
        post_ts = post["created_at"]
        rng.shuffle(items)
        placed: list[dict] = []
        for c in items:
            author = people[c["author_id"]]
            is_op = c["author_id"] == post["author_id"]
            parent = None
            latest = now - timedelta(hours=2)
            candidates = [p for p in placed if p["author_id"] != c["author_id"] and p["depth"] < 2 and p["ts"] < latest - timedelta(hours=1)]
            if candidates and (rng.random() < 0.35 or is_op):
                parent = rng.choice(candidates)
            first = lambda u: people[u]["full_name"].replace("Dr. ", "").replace("Prof. ", "").split()[0]
            parent_first = first(parent["author_id"]) if parent else None
            body = writer.write(post, author, parent_first, is_op)
            if parent:
                ts = parent["ts"] + timedelta(minutes=rng.randint(8, 60 * 72))
                n_replies += 1
            else:
                ts = post_ts + timedelta(minutes=rng.randint(15, 60 * 24 * 12))
            ts = min(ts, latest)
            ts = max(ts, (parent["ts"] if parent else post_ts) + timedelta(minutes=1))
            c.update(ts=ts, depth=(parent["depth"] + 1) if parent else 0)
            placed.append(c)
            comment_rows.append((c["comment_id"], body, parent["comment_id"] if parent else None, ts))
    # UPDATE in chunks so that the .sql file stays readable
    for i in range(0, len(comment_rows), 100):
        chunk = comment_rows[i : i + 100]
        values = ",\n  ".join(lit("(%s::uuid, %s, %s::uuid, %s::timestamptz)", row) for row in chunk)
        sql.append(
            "UPDATE comments c SET body = v.body, parent_comment_id = v.parent, created_at = v.ts FROM (VALUES\n  "
            + values
            + "\n) AS v(id, body, parent, ts) WHERE c.comment_id = v.id;"
        )
    sql.append(
        "UPDATE activity_events e SET occurred_at = c.created_at FROM comments c "
        "WHERE e.event_type = 'add_comment' AND e.target_id = c.comment_id;"
    )

    # ---- votes ----
    sql.append("DELETE FROM post_upvotes WHERE user_id IN (SELECT user_id FROM users WHERE is_synthetic = TRUE);")
    eligible = [pid for pid in posts if not is_spam_post[pid]]
    rng.shuffle(eligible)
    pop = {pid: 1.0 / ((rank + 1) ** 0.75) for rank, pid in enumerate(eligible)}  # long tail
    votes: dict[tuple[str, str], int] = {}
    user_tags = {uid: set(members[uid]["interest_tags"] or []) for uid in voters}
    user_dept = {uid: members[uid]["department"] for uid in voters}
    author_dept = {pid: people[posts[pid]["author_id"]]["department"] for pid in eligible}
    guard = 0
    while len(votes) < TARGET_VOTES and guard < TARGET_VOTES * 200:
        guard += 1
        pid = rng.choices(eligible, weights=[pop[p] for p in eligible])[0]
        uid = rng.choice(voters)
        if uid == posts[pid]["author_id"] or (uid, pid) in votes:
            continue
        affinity = 1.0
        if user_dept[uid] == author_dept[pid]:
            affinity += 1.0
        if user_tags[uid] & set(posts[pid]["tags"] or []):
            affinity += 2.0
        if rng.random() > affinity / 4.0:
            continue
        votes[(uid, pid)] = -1 if rng.random() < 0.08 else 1
    vote_rows = []
    for (uid, pid), value in votes.items():
        ts = posts[pid]["created_at"] + timedelta(minutes=rng.randint(5, 60 * 24 * 20))
        vote_rows.append((uid, pid, value, min(ts, now - timedelta(minutes=rng.randint(1, 600)))))
    for i in range(0, len(vote_rows), 100):
        values = ",\n  ".join(lit("(%s::uuid, %s::uuid, %s, %s::timestamptz)", r) for r in vote_rows[i : i + 100])
        sql.append(
            "INSERT INTO post_upvotes (user_id, post_id, value, created_at) VALUES\n  " + values + "\nON CONFLICT (user_id, post_id) DO NOTHING;"
        )
    sql.append(
        "UPDATE posts p SET upvote_count = COALESCE((SELECT SUM(value) FROM post_upvotes v WHERE v.post_id = p.post_id), 0);"
    )
    cur.close()
    sql = [stmt.rstrip().rstrip(";") + ";" for stmt in sql]
    print(
        f"Plan: rename {len(members)} members, rewrite {len(comment_rows)} comments ({n_replies} threaded replies), "
        f"insert {len(vote_rows)} votes ({sum(1 for v in votes.values() if v < 0)} downvotes) across "
        f"{len({pid for _, pid in votes})} posts."
    )
    return sql


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sql-only", action="store_true", help="write improve_data.sql but do not change the database")
    ap.add_argument("--update-emails", action="store_true", help="also set member emails to first.last@chanakyauniversity.edu.in")
    ap.add_argument("--seed", type=int, default=SEED, help="random seed (same seed = same output)")
    args = ap.parse_args()

    register_uuid()
    conn = psycopg2.connect(DB_URL)
    try:
        sql = build(conn, random.Random(args.seed), args.update_emails)
        SQL_OUT.write_text("BEGIN;\n" + "\n".join(sql) + "\nCOMMIT;\n", encoding="utf-8")
        print(f"Wrote {SQL_OUT} ({SQL_OUT.stat().st_size // 1024} KB)")
        if args.sql_only:
            conn.rollback()
            print("--sql-only: database left unchanged.")
            return 0
        cur = conn.cursor()
        for stmt in sql:
            cur.execute(stmt)
        conn.commit()
        print("Applied. Now run: python data_pipeline/run_dw_elt.py   (refreshes the analytics warehouse)")
        return 0
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
