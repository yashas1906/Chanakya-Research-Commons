# Chanakya Research Commons: Demo Script and Viva Preparation

A 12–15 minute live demo that touches every requirement (F1–F9), followed by the numbers to know and the
questions examiners are likely to ask. Detail behind every answer is in `docs/TECHNICAL_REPORT.md`
(section numbers in brackets).

---

## 1. Before the demo (do this 30 minutes ahead)

- [ ] Docker Desktop running; `docker compose up -d postgres minio ollama`.
- [ ] Warm the model so the first answer isn't slow: `docker exec crc_ollama ollama run llama3.2:3b "hi"`.
- [ ] `python start.py` (backend on :8000, frontend on :3000). Wait for the yellow "API unavailable" banner
      to disappear (the backend loads the embedding model at start-up, about 20 s).
- [ ] Fresh RSS articles (optional): `python data_pipeline/ingest.py --sources rss`.
- [ ] Two browser windows: one signed in as the **admin**, one as a **member** (private window).
- [ ] Open `evaluation/evaluation_results.json` and `docs/TECHNICAL_REPORT.md` in the editor, in case of
      questions about numbers.
- [ ] Have `http://localhost:8000/docs` (API docs) in a tab.

**Accounts** (all seeded accounts share the demo passcode in `.env` → `CRC_DEMO_PASSCODE`):

| Role | Sign in with | Name |
|---|---|---|
| Admin | `member1@chanakyauniversity.edu.in` or `24CU1000` | Dr. Aditi Menon |
| Student (School of Management Sciences, 12 saves, follows 6 people) | `member4@chanakyauniversity.edu.in` or `24CU1003` | Arjun Reddy |

---

## 2. Demo flow

### 0:00 Opening (30 s)

> "Chanakya Research Commons is a research platform for our six schools: a shared library, discussions,
> one search box, recommendations and a research assistant, with an admin dashboard on a data warehouse.
> Underneath are the DMW techniques from the course: MinHash LSH, PageRank, rank fusion, FP-Growth,
> Isolation Forest, a star schema and retrieval-augmented generation."

Show the architecture diagram from the report (§3) for 20 seconds if a projector is available.

### 0:30 Home and search: F5 (2 min), as the member

1. Home page → type **`supply chain analytics data-driven approach`** in the top search bar.
2. Point at the tabs: **Papers / People / Discussions**, and the source buttons **All sources / Chanakya
   library / Open literature**.
   > "Papers are ranked by Reciprocal Rank Fusion of semantic search (pgvector) and PostgreSQL full-text
   > search. On 25 held-out queries it scores nDCG@10 0.81, against 0.20 for keyword search."
3. The first result, **Supply Chain Analytics: A Data-Driven Approach**, lists two sources (arXiv, OpenAlex).
   Open it → on the paper page, **Found in** lists both. (Other merged examples: `Introduction to Protein
   Folding`, `Solvent framework protein folding`.)
   > "This came from two sources. MinHash LSH on word 3-shingles found the duplicate, and the two records
   > were merged into one. Benchmark F1 is 1.0; 45 of 46 real merges were correct."
4. Back → search **`Escher mathematical worlds`** → open the Quanta Magazine result: it says **Article** and
   **Found in: RSS feed**.
   > "F4: articles come from 14 curated RSS feeds. Every raw response is stored unchanged in MinIO first,
   > then parsed; ingestion is incremental with cursors and runs every 6 hours."

### 2:30 Paper page and library: F3, F6 (2.5 min)

1. Open **Digital Humanities and Librarianship** (the most saved paper).
2. Walk the page top to bottom: actions bar (**Save to library** with a collection, **Ask the research
   assistant**, **Discuss this paper**, Share) → stats strip (prestige tier from PageRank, saves, references,
   cited by) → abstract → **Citation graph / Discussions / Readers also saved**.
3. Under **Readers also saved**, read one reason line aloud.
   > "Three tiers so every library item gets an answer: FP-Growth association rules where at least two
   > members support them, then co-saves, then embedding similarity. Rules alone answer 151 of 461 items;
   > with the tiers, all 461."
4. Click **Save to library** → add a private note.
5. **Library** → **Recommended** tab.
   > "Co-save collaborative filtering plus content similarity, blended with z-scores. On held-out saves it ties
   > item-based CF and beats popularity six-fold, and it still works for a brand-new member through the
   > profile text."
6. Point at the left rail: **Sort by**, School, Publication decade, PageRank tier. Switch to **My saves** and
   show **Add a paper not in the library** (DOI / arXiv / link → Crossref, arXiv or page metadata).

### 5:00 Feed and community: F1, F2, F7 (2 min)

1. **Feed** → **Best** is selected. Point at a reason under a post ("From someone you follow").
   > "Best = 2 for a followed author, 1.5 for a followed domain, plus cosine similarity between the post and
   > the member's profile. Signed-out visitors get newest first."
2. Left rail **Domains**: all 32 research domains, with counts.
3. **Create post** → choose a domain from the dropdown (up to 3) → attach a paper → Publish. It appears at the
   top of **New**.
4. Right rail **Trending this week**: spike badges.
   > "7-day count against the 30-day weekly average, at least 5 events. The three planted spikes are exactly the
   > top three."
5. Click an author → profile → **Follow**.

### 7:00 Research assistant: F8 (2 min)

1. **Assistant** → ask **"How do deep learning methods assist in protein folding prediction?"**
2. While it streams, point at the **retrieved passages** with similarity scores and the [1] [2] citations.
   > "We embed the question, retrieve the four nearest abstract chunks, and the model may only use those,
   > citing each claim. Llama 3.2 3B runs locally through Ollama, so nothing leaves the machine."
3. Tick **Chanakya Library only** and ask something off-topic, e.g. **"Who won the 2018 FIFA World Cup?"**
   > "Below 0.32 similarity it refuses instead of inventing an answer: 4 of 5 out-of-corpus questions
   > refused. Retrieval hit rate is 100 % on 15 test questions."

### 9:00 Admin dashboard: F7, F9 (3.5 min), as the admin

1. Top bar **Dashboard** → **Overview**: totals, members by school, top contributors, **Alerts to review**.
2. In the alert list find **Suspected spam: Anil Pandey** → click **Confirm spam**.
   > "Isolation Forest on log-scaled posting behaviour: post count, gap between posts, average votes.
   > ROC-AUC 0.975. Every flag goes to a person; cleared members aren't re-flagged unless they post again."
3. **Members** → **Manage** on any member: change role, view / edit / delete their posts.
4. **Chanakya holdings** → **New holding** → show the form (don't need to publish) → **Posting history**.
5. **Analytics** → **Activity**: monthly engagement, topic activity, **cross-school collaboration matrix**,
   most saved / most discussed.
   > "All of this reads from the star schema in the dw schema: date, member, topic and paper dimensions,
   > a research-activity fact and a school-collaboration fact, rebuilt by the ELT every 6 hours."
6. **Drill-down**: University → pick a school → a topic → members.
7. **Topic associations** (FP-Growth / FP-Max topic bundles per school) and **Researcher archetypes** (Ward
   clustering) in one sentence each.

### 12:30 Evaluation and close (1.5 min)

Show the results table (report §6 or README §8) and close with the honest findings:

> "Hybrid search is level with semantic-only and far above keyword search. PageRank didn't help relevance
> because the citation graph is sparse, so we set its weight to zero on development queries rather than keep
> a boost that lowered results. A simple post-count baseline beats Isolation Forest on our planted spammers,
> because they differ mainly in volume; we report that and keep the forest for other kinds of abnormal
> behaviour, with a human review step."

### If something fails

| Problem | Fallback |
|---|---|
| Assistant slow or Ollama down | It switches to an extractive answer from the retrieved passages (still cited). Say so; it is a designed fallback. |
| Backend not up | Show `http://localhost:8000/docs` once it starts; meanwhile walk through the report's architecture. |
| Search returns odd results for a live query | Use the queries in this script; they were checked against the database on 25 Nov. |
| No internet | Everything runs locally; only RSS refresh and "add by DOI" need the network. |

---

## 3. Numbers to know

| What | Number |
|---|---|
| Corpus | 1,089 items (960 papers, 129 RSS articles), all with abstracts; 772 OpenAlex + 234 arXiv + 129 RSS records; 46 merges |
| Community | 61 members, 6 schools, 4 roles; 601 posts, 2,002 comments; 14,389 events over 6 months; 362 follows |
| Library | 726 saves, 461 library items, 61 collections |
| Embeddings | all-MiniLM-L6-v2, 384 dimensions, HNSW cosine indexes |
| Dedup | F1 1.00 vs 0.10 exact title, 0.87 old MinHash; real merges 45/46 |
| Search | nDCG@10 0.815 hybrid / 0.822 semantic / 0.197 keyword (25 held-out queries) |
| PageRank | Spearman 0.41 vs OpenAlex citations; 188 internal edges; weight 0 in ranking |
| Recommendations | Recall@10 0.107 hybrid = item-CF 0.107 > profile 0.036 > popularity 0.018 (28 held-out members) |
| Also saved | 461 / 461 items answered (rules alone: 151) |
| Spikes | Recall@3 1.00, alert precision 1.00 |
| Spam | ROC-AUC 0.975, PR-AUC 0.73; baseline post count PR-AUC 0.925; threshold 0.09 → P 0.67, R 0.80 |
| Assistant | Hit@4 1.00, 22 ms retrieval, refuses 4/5 off-corpus at similarity < 0.32 |
| Tests | 32 backend API tests passing |

---

## 4. Likely viva questions

### Data and warehouse

**Why keep the operational data and the warehouse in the same PostgreSQL?**
At our scale one database is simpler to run and back up, and pgvector lets vectors live next to the rows.
The warehouse is a separate `dw` schema, rebuilt in batch, so dashboard queries never touch the tables the
website writes to. At university scale we'd move it to its own instance or a columnar store (report §9).

**What is the grain of your fact table?**
`fact_research_activity`: one row per date × member × topic × paper, with additive counts (saves, posts,
comments, upvotes, views). `fact_dept_collaboration`: date × source school × target school × interaction type
(follow or comment). Both share `dim_date` and the member's school, so they can be sliced together.

**Why a star schema rather than querying the operational tables directly?**
The dashboard asks the same few questions in many slices (by school, topic, month). Pre-joined, additive facts
with small dimensions make those queries simple and fast, and they don't lock or slow the live tables.
Denormalised dimensions also hold derived attributes (PageRank tier, topic cluster) computed once in the ELT.

**Full rebuild or incremental load?**
Full rebuild every 6 hours; it takes seconds at this size and avoids slowly-changing-dimension bookkeeping. In
production: append facts by date partition and keep type-2 history for members who change role or school.

**Why MinIO? What is "raw first"?**
Every API response is stored unchanged before parsing. If a parser has a bug we fix it and re-derive the
tables from the lake without calling OpenAlex again. MinIO speaks the S3 API, so the code moves to any S3 store.

**How is ingestion incremental?**
`ingestion_state` stores a cursor per source/topic/feed: OpenAlex paging cursor, arXiv offset, RSS `ETag` and
`Last-Modified` (conditional GET, so unchanged feeds return 304). Known IDs, DOIs and arXiv IDs are skipped
before embedding. Each run is logged in `ingestion_runs`.

**Is your data real?**
The papers and articles are real (OpenAlex, arXiv, RSS). Members and their activity are synthetic, generated
with a fixed seed, with planted duplicates, spammers and spikes so we know the right answers. Synthetic rows
are flagged `is_synthetic` and can be removed without schema changes.

### Duplicates and search

**Explain MinHash and LSH.**
Jaccard similarity of two documents' shingle sets measures overlap. MinHash approximates it: for each of 128
random hash functions, keep the minimum hash over the set; the probability two documents share a minimum equals
their Jaccard similarity. LSH splits the 128 values into bands and only compares documents that collide in at
least one band, so we avoid comparing all pairs. Threshold 0.5, then verification on exact shingle Jaccard,
title overlap or embedding cosine ≥ 0.93.

**Why word 3-shingles instead of word sets?**
Word sets ignore order, so two different abstracts on the same topic share most words. 3-shingles capture
phrasing. Precision went from 0.76 (word sets, 0.65) to 1.00 with shingles plus verification.

**What is Reciprocal Rank Fusion and why k = 60?**
Each list contributes 1 / (k + rank). It combines rankings whose scores are on different scales (cosine
distance vs `ts_rank`) using only positions; k = 60 is the standard value from Cormack et al. (2009). It damps the
difference between rank 1 and rank 2 so one list cannot dominate.

**Your hybrid isn't better than semantic-only. Why keep it?**
On these 25 queries they're level (0.815 vs 0.822, intervals overlap). Keyword matching rescues exact terms that
embeddings handle poorly: acronyms, author names, rare technical words. The relevance labels here are term-based
topical matches, which don't test those cases much.

**Why is the PageRank weight zero?**
We swept it on 26 development queries and every positive weight lowered nDCG. The corpus has only 188 internal
citation edges, and relevance labels measure topical match, not authority. PageRank still breaks ties, sets the
prestige tier and picks featured papers. It does correlate with real citations (Spearman 0.41).

**Explain PageRank.**
A paper is important if important papers cite it. It's the stationary distribution of a random walk over the
citation graph that follows a citation with probability 0.85 and jumps to a random paper otherwise (the jump
handles dead ends and keeps the walk from getting stuck).

### Recommendations and association rules

**Explain support, confidence and lift.**
Support(A→B) = share of baskets containing both. Confidence = P(B | A). Lift = confidence / P(B): above 1
means A and B appear together more than chance. We rank by confidence then lift, and require support of at
least two members so one person's taste isn't a rule.

**Why FP-Growth instead of Apriori?**
Apriori generates and counts candidate itemsets level by level, scanning the data each time. FP-Growth
compresses the baskets into a prefix tree in two scans and mines it recursively without candidate
generation, which is much faster on sparse data like library saves.

**Why do association rules cover only a third of the library?**
726 saves spread over 461 papers: most papers are saved by one or two people, so many pairs never reach
two-member support (151 of 461 items have a rule). That's why "also saved" falls back to co-saves and then embedding similarity, and labels which one.

**How do you handle a brand-new member (cold start)?**
Their profile text is embedded at registration. With no saves the collaborative term has no spread and
contributes nothing, so recommendations come from profile similarity. Feed ranking also uses the profile.

**Why is recall@10 only about 0.1?**
The task is hard: find 1–3 hidden papers among 1,089 with very sparse histories. It's 6× popularity and
equal to item-CF; with 28 test members the intervals are wide, so we don't claim more than "ties CF".

### Trends and spam

**How do you detect a spike?**
For each topic: events in the last 7 days divided by its average weekly rate in the 30 days before. Alert at
ratio ≥ 1.5 with at least 5 events, so small topics don't spike on two events.

**How does Isolation Forest work?**
It builds random trees that split on random features at random values. Unusual points are isolated in fewer
splits, so a short average path length means anomalous. It needs no labels, which suits spam (rare, and
unlabelled in real life).

**Why does a post-count baseline beat it?**
Our planted spammers differ mainly in volume, which one feature captures perfectly. The forest is kept because it
also catches combinations a single rule misses (bursty gaps, ignored posts), and every flag goes to a human.
We report the baseline rather than hide it.

**Your spam numbers changed between runs. Why?**
On 24 November 15 leftover test accounts were in the population; after cleanup there are 61 members. Isolation
Forest scores are relative to the population, and with only five positives the threshold is unstable (0.83/1.00
then, 0.67/0.80 now at 0.09). In deployment the threshold would come from moderators' confirm/clear decisions.

### Assistant

**What is RAG and why not just ask the LLM?**
Retrieve relevant passages first, then have the model answer only from them with citations. The answer is
grounded in our corpus and checkable, and the model doesn't need to have memorised the papers.

**How do you stop hallucination?**
(1) Passages below 0.32 cosine similarity are dropped; if none remain, it refuses (or, for open questions, says
it's answering from general knowledge with no citations). (2) The prompt forbids claims without a citation
number. (3) Temperature 0.2. (4) Passages are shown beside the answer so the reader can check.

**Why 0.32?**
It separates our in-corpus test questions (mean top-1 similarity 0.70) from out-of-corpus traps (0.24); at
0.32, 4 of 5 traps are refused while all 15 real questions still retrieve the right paper.

**Why MiniLM and Llama 3.2 3B?**
Both run on a laptop CPU. MiniLM gives 384-d vectors (small indexes, fast queries) with good semantic quality.
The 3B model is about 2 GB quantised and follows citation instructions well enough; it can be swapped through
`OLLAMA_MODEL`.

### Engineering

**How do you know the evaluation measures the real system?**
The evaluation imports the same SQL and constants the API uses (`search_service.py`,
`recommendation_service.py`, `spam_service.py`, `dedup.py`). Ground truth is rebuilt from the seed's planting
rules, never from detector output. Tunable settings are chosen on a dev split and reported on held-out data.

**How is access controlled?**
JWT sessions (8 h), hashed passwords, login throttling; every admin endpoint checks the role on the server.
Recommendations are private to the member (or an admin). No credentials in code: everything comes from `.env`.

**What would you do with more time?**
Human relevance judgements for search; real moderation labels to set the spam threshold; full-text PDFs for
the assistant; incremental warehouse loads; university SSO (report §8–9).
