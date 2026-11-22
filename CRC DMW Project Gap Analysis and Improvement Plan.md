# CRC: DMW Project Gap Analysis and Improvement Plan

Nov 22, 2026 · @wreck

The project covers most of what the DMW course statement asks for; the biggest risk is evaluation numbers an examiner can pick apart, not missing features. This is based on reading the code and screenshots only; nothing was run.

## What the course document asks

The document is the DMW mini-project statement: nine subsystems (F1–F9) that feed a unified search. Submission is due 28-11-2026, six days after this analysis.

- **Rubric:** 20% web app, 20% data layer, 20% intelligent features, 40% report, demo and viva.
- **Evaluation:** every intelligent feature must be "evaluated with numbers, not only shown in a demo".
- **General expectations:** no committed secrets, and a README that reproduces every evaluation result.

## Where the project stands

Each row below was checked against `backend/main.py`, `db/schema.sql`, `data_pipeline/` and `evaluation/`; the gaps are what a grader reading the statement literally would mark down.

| Requirement | Status in the repo | Gap |
| --- | --- | --- |
| F1 accounts | Schema only | No registration or login code. Seeded users all share the hash `hashed_demo_pass`. Topic following (`topic_follows`) is unused. |
| F2 posts | Feed and create-post exist | No comment, reply or upvote routes in the committed backend. The feed ignores followed topics. |
| F3 library | Save and save count work | No save by URL, DOI or arXiv ID. No collections routes. |
| F4 ingestion | OpenAlex only; raw JSON kept in MinIO | No arXiv, Semantic Scholar or RSS articles. One-shot ingestion; the warehouse is truncated and rebuilt each run; the transform reads from memory, not the lake. |
| F5 search | Hybrid ranking, 4 panels, MinHash dedup | The "external" panel is rows in the local DB with `in_chanakya_library = FALSE`, not a live query. Dedup output goes to a JSON file and is never merged at serving time, so duplicates still show. Every paper has a single source. |
| F6 recommendations | Bio-embedding match plus FP-Growth "also saved" | Never uses a member's saves or follows. No collaborative filtering or community detection. FP-Growth is recomputed on every request. |
| F7 trends and spam | Spike ratio and Isolation Forest | Scoring runs inside a GET request. Windows are measured from `NOW()`. |
| F8 assistant | Retrieval plus Ollama, with citations | Each abstract is split into 2 chunks, so retrieval is over abstracts only. It always answers, even at low similarity. |
| F9 dashboard | Star schema plus topic clustering | Drill-down from university to member is unclear. The comments measure is hard-coded to 0. |
| General expectations | Docker Compose, README | Compose starts only Postgres, MinIO and Ollama. `.env` is tracked in git. The DB password is a hard-coded default in 3 files. The seed has no `random.seed`. |

## Problems an examiner would find first

Six issues weaken the evaluation numbers in `evaluation/evaluate_all.py` and the pipeline, and the viva is where they will be probed.

1. **Baselines asserted, not computed.** `baseline_exact_title_f1: 0.0` is a typed constant. The "rule-based" spam baseline and the "static count" spike baseline appear in the README table but not in the code.
2. **Results depend on the run date.** Spike detection uses `NOW() - 7 days`, but the planted spike is seeded relative to the day the seed ran. About a week after seeding, the spike leaves the window and recall@3 drops. Anchor everything to `max(occurred_at)`.
3. **Leakage and circular metrics.** Isolation Forest gets `contamination=0.09`, chosen knowing 5 of 60 users are planted spammers. "Relevance@5 = 0.97" counts a paper as relevant if it carries the user's department tag, and the profile embedding is built from a bio naming that department's topics. Nothing is held out.
4. **Tiny samples.** Search uses 6 queries, recommendations 20 users, RAG 3 questions. RAG is scored on latency and top-1 cosine only, not on answer faithfulness. The ILIKE search baseline matches the whole phrase literally, so it is weak by construction.
5. **Cluster names are probably wrong.** `AgglomerativeClustering` labels are arbitrary, but `run_dw_elt.py` maps label 0 to "Intelligent Systems", 1 to "Life Sciences" and so on by index. It also clusters character n-grams of topic names, not meaning.
6. **PageRank may carry almost no signal.** The UI shows scores near `1.2e-3` and `1.6e-3`, close to 1/N for a corpus this size. Citations are stored only when the cited paper is also in the corpus, so the graph is probably sparse, and the `pagerank_score * 10` boost then adds noise to the ranking.

## The improved version, in priority order

Spend the first two days on evaluation integrity, because it feeds the 40% report, demo and viva weight, then close the literal spec gaps.

**Days 1–2: make the numbers defensible**

- Replace every typed baseline with a real implementation. For search, compare keyword-only, semantic-only, hybrid, and hybrid without PageRank.
- Use 50 or more queries and report nDCG@10 and MRR with bootstrap confidence intervals.
- For recommendations, hold out each member's most recent saves and compare against item-based collaborative filtering and popularity.
- Score spam with PR-AUC instead of a fixed contamination setting.
- Add an `--as-of` date and `random.seed` so one command reproduces every result.
- Validate PageRank against OpenAlex `cited_by_count` with Spearman correlation.
- For RAG, build a question set from known papers and report hit@k, citation support, and refusal on out-of-corpus questions.

**Days 2–4: close the literal spec gaps**

- Registration, login and roles; comments, replies and upvotes; follow topics and members.
- Save by DOI, arXiv ID or URL.
- One more scholarly source (arXiv or Semantic Scholar) and an RSS article ingester. Merge records at serving time by DOI first, then MinHash, and show all sources on one result.
- Add author name-variant matching to the planted ground truth and evaluate it.
- Persist spike and spam alerts from a scheduled job instead of computing them on GET.
- Add a working university-to-member drill-down in the dashboard.
- Put backend, frontend and pipeline into Compose, rotate the DB password, and remove `.env` from git.

**If time remains**

- Densify the citation graph by pulling references one hop out.
- Chunk open-access full text for RAG and add a low-similarity "I don't know" gate.
- Make ingestion incremental with a watermark and a scheduler.
- Add a Parquet and DuckDB mirror, and benchmark star-schema queries against the same queries on the operational tables.
- Cluster topics on paper-embedding centroids and name each cluster from its content.

The frontend redesign brief covers F1 and F2 (login, voting, thread pages); it does not address the evaluation problems above.

## Caveats and next step

The findings come from reading the repo and screenshots; nothing was executed, so the points about PageRank scale, paper counts and cluster contents should be confirmed against the live database.

- [ ] Decide whether the IDE brief should focus on the evaluation fixes, the missing features, or both.
