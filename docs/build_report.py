# -*- coding: utf-8 -*-
"""Build the DMW submission report (.docx) for Chanakya Research Commons."""
from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import sys

OUT = sys.argv[1]
INK = RGBColor(0x1A, 0x1A, 0x1A)
ACCENT = RGBColor(0x8A, 0x1F, 0x2B)   # deep red, matching the app
GREY = RGBColor(0x5A, 0x5A, 0x5A)

doc = Document()

# ---- base styles ----
normal = doc.styles["Normal"]
normal.font.name = "Calibri"
normal.font.size = Pt(11)
normal.font.color.rgb = INK
normal.paragraph_format.space_after = Pt(6)
normal.paragraph_format.line_spacing = 1.15

for lvl, size in [("Heading 1", 16), ("Heading 2", 13), ("Heading 3", 11.5)]:
    st = doc.styles[lvl]
    st.font.name = "Calibri"
    st.font.size = Pt(size)
    st.font.bold = True
    st.font.color.rgb = ACCENT if lvl == "Heading 1" else INK
    st.paragraph_format.space_before = Pt(12 if lvl == "Heading 1" else 8)
    st.paragraph_format.space_after = Pt(4)
    st.paragraph_format.keep_with_next = True


def set_cell_bg(cell, hex_color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:fill"), hex_color)
    tcPr.append(shd)


def para(text="", size=11, bold=False, italic=False, color=INK, align=None, space_after=6, style=None):
    p = doc.add_paragraph(style=style)
    if align is not None:
        p.alignment = align
    p.paragraph_format.space_after = Pt(space_after)
    if text:
        r = p.add_run(text)
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.italic = italic
        r.font.color.rgb = color
    return p


def rich(parts, align=None, space_after=6, size=11):
    """parts: list of (text, bold, italic) tuples."""
    p = doc.add_paragraph()
    if align is not None:
        p.alignment = align
    p.paragraph_format.space_after = Pt(space_after)
    for item in parts:
        text, bold, italic = (item + (False, False))[:3]
        r = p.add_run(text)
        r.font.size = Pt(size)
        r.bold = bold
        r.italic = italic
    return p


def h1(text):
    doc.add_heading(text, level=1)


def h2(text):
    doc.add_heading(text, level=2)


def h3(text):
    doc.add_heading(text, level=3)


def bullet(text, bold_lead=None):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_after = Pt(3)
    if bold_lead:
        r = p.add_run(bold_lead)
        r.bold = True
        r.font.size = Pt(11)
    r2 = p.add_run(text)
    r2.font.size = Pt(11)
    return p


def numbered(text, bold_lead=None):
    p = doc.add_paragraph(style="List Number")
    p.paragraph_format.space_after = Pt(3)
    if bold_lead:
        r = p.add_run(bold_lead); r.bold = True
    p.add_run(text)
    return p


def code(lines):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.left_indent = Inches(0.2)
    for i, line in enumerate(lines):
        r = p.add_run(line)
        r.font.name = "Consolas"
        r.font.size = Pt(9.5)
        r.font.color.rgb = RGBColor(0x30, 0x30, 0x30)
        if i < len(lines) - 1:
            r.add_break()
    pPr = p._p.get_or_add_pPr()
    shd = OxmlElement("w:shd"); shd.set(qn("w:val"), "clear"); shd.set(qn("w:fill"), "F3F1EE")
    pPr.append(shd)
    return p


def table(headers, rows, widths=None, header_bg="8A1F2B", font=9.5):
    t = doc.add_table(rows=1, cols=len(headers))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.style = "Table Grid"
    t.autofit = True
    hdr = t.rows[0].cells
    for i, htext in enumerate(headers):
        set_cell_bg(hdr[i], header_bg)
        p = hdr[i].paragraphs[0]
        p.paragraph_format.space_after = Pt(2); p.paragraph_format.space_before = Pt(2)
        r = p.add_run(htext); r.bold = True; r.font.size = Pt(font); r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    for ri, row in enumerate(rows):
        cells = t.add_row().cells
        for i, val in enumerate(row):
            if ri % 2 == 1:
                set_cell_bg(cells[i], "F7F5F2")
            p = cells[i].paragraphs[0]
            p.paragraph_format.space_after = Pt(2); p.paragraph_format.space_before = Pt(2)
            # bold marker: wrap value in ** **
            text = str(val)
            bold = False
            if text.startswith("**") and text.endswith("**"):
                text = text[2:-2]; bold = True
            r = p.add_run(text); r.font.size = Pt(font); r.bold = bold
    if widths:
        for i, w in enumerate(widths):
            for row in t.rows:
                row.cells[i].width = Inches(w)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t


def caption(text):
    para(text, size=9, italic=True, color=GREY, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=10)


def hrule():
    p = doc.add_paragraph()
    pPr = p._p.get_or_add_pPr()
    pbdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single"); bottom.set(qn("w:sz"), "6")
    bottom.set(qn("w:space"), "1"); bottom.set(qn("w:color"), "8A1F2B")
    pbdr.append(bottom); pPr.append(pbdr)


def page_break():
    doc.add_page_break()


def add_toc():
    p = doc.add_paragraph()
    run = p.add_run()
    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), r'TOC \o "1-2" \h \z \u')
    hint = OxmlElement("w:r"); t = OxmlElement("w:t")
    t.text = "Right-click and choose “Update Field” to build the table of contents."
    hint.append(t); fld.append(hint)
    p._p.append(fld)


# ============================= TITLE PAGE =============================
for _ in range(2):
    para(space_after=2)
para("CHANAKYA UNIVERSITY", size=14, bold=True, color=GREY, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
para("Department of Data Mining and Warehousing", size=12, color=GREY, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=24)
para("Semester 5 — Course Project Report", size=12, italic=True, color=GREY, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=30)

para("Chanakya Research Commons", size=28, bold=True, color=ACCENT, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=6)
para("An Intelligent Academic Research Platform with Hybrid Search, Recommendations, "
     "Trend and Spam Analytics, and Retrieval-Augmented Question Answering",
     size=13, italic=True, color=INK, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=28)

hrule()
para(space_after=10)
para("Submitted by", size=11, color=GREY, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
para("Yashas Hombal", size=14, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
para("University ID: ____________________", size=11, color=GREY, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=16)
para("Under the guidance of", size=11, color=GREY, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
para("____________________________", size=12, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=24)

para("Course: Data Mining and Warehousing (DMW)", size=11, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
para("Submission date: 28 November 2026", size=11, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
page_break()

# ============================= ABSTRACT =============================
h1("Abstract")
para("Chanakya Research Commons (CRC) is a research platform for the six schools of Chanakya University. "
     "It gives members a shared library of research papers, a discussion feed, a single search box across "
     "papers, people and discussions, personalised recommendations, and a research assistant that answers "
     "questions using only retrieved papers and cites them. Administrators get a dashboard built on a "
     "star-schema data warehouse, with automatic trend and spam alerts.")
para("The project applies the data-mining and data-warehousing techniques of the course to a complete, "
     "runnable system: MinHash with Locality-Sensitive Hashing for cross-source duplicate detection; "
     "Reciprocal Rank Fusion of semantic (vector) and lexical (full-text) search; PageRank for citation "
     "authority; FP-Growth association-rule mining for “members who saved this also saved”; a co-save and "
     "content hybrid for recommendations; sliding-window change detection for trending topics; an Isolation "
     "Forest for spam accounts; agglomerative clustering for topic and researcher groups; and "
     "retrieval-augmented generation with a local large language model. Every method is evaluated against "
     "baselines on planted ground truth or held-out data, and the report states the honest findings, including "
     "where a simple baseline is competitive.")
para("The corpus holds 1,089 real papers and articles from OpenAlex, arXiv and RSS feeds, with a synthetic "
     "community of 61 members and about 14,000 activity events over six months. The whole stack — PostgreSQL "
     "with pgvector, a MinIO data lake, a local Ollama language model, a FastAPI backend and a Next.js "
     "frontend — runs locally on free and open-source software.")
page_break()

# ============================= TOC =============================
h1("Table of Contents")
add_toc()
page_break()

# ============================= 1. INTRODUCTION =============================
h1("1. Introduction")

h2("1.1 Background and Motivation")
para("Research at a young, multi-school university is fragmented. A paper one student finds useful stays in a "
     "personal folder; the people working on a related topic in another school are hard to discover; and "
     "general-purpose search engines know nothing about what members of the university are actually reading "
     "or discussing. The result is duplicated effort and missed collaboration across the six schools:")
for s in ["School of Arts, Humanities and Social Sciences (SAHSS)",
          "School of Biosciences (SBS)",
          "School of Engineering (SOE)",
          "School of Law, Governance and Public Policy (SLGPP)",
          "School of Management Sciences (SMS)",
          "School of Mathematics and Natural Sciences (SMNS)"]:
    bullet(s)
para("Chanakya Research Commons addresses this by bringing literature, people and discussion into one place "
     "and applying data mining to make the collection useful: finding duplicates across sources, ranking search "
     "results, recommending papers and collaborators, surfacing emerging topics, flagging abnormal activity, "
     "and answering questions from the corpus with citations.")

h2("1.2 Objectives")
para("The project set out to build a complete, runnable platform that satisfies the course brief and "
     "demonstrates the core techniques of data mining and warehousing:")
numbered("Ingest real research literature from open sources, keep the raw responses, and load it in incremental batches.", "Ingestion: ")
numbered("Detect and merge duplicate records that arrive from more than one source.", "Entity resolution: ")
numbered("Provide one hybrid search box over papers, people and discussions.", "Search: ")
numbered("Recommend papers and collaborators, and explain why each is suggested.", "Recommendation: ")
numbered("Detect trending topics and flag spam or abnormal accounts for administrators.", "Monitoring: ")
numbered("Answer natural-language questions grounded in retrieved papers, with citations.", "Assistant: ")
numbered("Provide an administrator dashboard over a star-schema data warehouse, with drill-down.", "Analytics: ")
numbered("Evaluate every method against baselines and report the results honestly.", "Evaluation: ")

h2("1.3 Scope")
para("In scope: the nine functional areas above (F1–F9 in Section 2), a seeded corpus with planted ground "
     "truth for evaluation, and a local deployment on free software. Out of scope: full-text PDF processing "
     "(the assistant reads abstracts), a live connection to the university’s identity provider, and real "
     "member data — every member except one test account is synthetic and flagged as such, so the synthetic "
     "community can be removed without any schema change before a real deployment.")

h2("1.4 Organisation of the Report")
para("Section 2 lists the functional, data, software and hardware requirements. Section 3 describes the "
     "methodology and design: architecture, database and warehouse design, the data pipeline, and the "
     "data-mining method chosen for each feature and why. Section 4 covers the implementation: the technology "
     "stack, backend, frontend, security and testing. Section 5 presents the evaluation and results against "
     "baselines. Section 6 concludes with a summary, limitations and a deployment plan. A fuller engineering "
     "write-up is kept alongside the code in docs/TECHNICAL_REPORT.md.")
page_break()

# ============================= 2. SYSTEM REQUIREMENTS =============================
h1("2. System Requirements")

h2("2.1 Functional Requirements")
para("The brief defines nine functional areas. All are implemented; two carry a documented caveat.")
table(
    ["ID", "Requirement", "Status", "Notes"],
    [
        ["F1", "Accounts and profiles: roles, interests, follow people and topics", "**Done**", "Student / researcher / faculty / admin; profiles embedded as vectors"],
        ["F2", "Posts with tags, attached papers, comments, replies, votes, personal feed", "**Done**", "Posts filed under 32 research domains; “Best” feed blends follows and similarity"],
        ["F3", "Library: save from search or by DOI/arXiv/URL, collections, private notes, save counts", "**Done**", "Add-by-identifier uses Crossref / arXiv / page metadata"],
        ["F4", "Ingest papers and articles from open sources; keep raw; scheduled batches", "**Done**", "OpenAlex, arXiv, 14 RSS feeds; raw in MinIO; incremental"],
        ["F5", "One search box, four panels, keyword + semantic, duplicates merged", "**Done***", "External panel queries the local copy, not a live source"],
        ["F6", "Recommend papers and people; “also saved”; sensible cold start", "**Done**", "Co-save + content hybrid; FP-Growth rules with fall-backs"],
        ["F7", "Trending topics, spike alerts, spam flags for admins", "**Done**", "Sliding-window spikes; Isolation Forest; admin review queue"],
        ["F8", "Assistant: plain-language questions, grounded answers with citations, passages shown", "**Done**", "Retrieval + local LLM; refuses below a similarity floor"],
        ["F9", "Admin dashboard: topics by department over time, collaboration, drill-down", "**Done**", "Star-schema OLAP; university → school → topic → member"],
    ],
    widths=[0.5, 3.1, 0.7, 2.4],
)
caption("* F5: the “open literature” panel searches papers already ingested from OpenAlex/arXiv, not a live external query.")

h2("2.2 Data Requirements")
para("The brief sets minimum sizes for the seed corpus; the delivered database exceeds each.")
table(
    ["Requirement", "Minimum", "Delivered"],
    [
        ["Papers with abstracts", "500", "**1,089** (960 papers + 129 RSS articles)"],
        ["Source records", "—", "772 OpenAlex, 234 arXiv, 129 RSS; 46 duplicates merged"],
        ["Members across departments", "50 / 6", "**61** across 6 schools, all 4 roles"],
        ["Posts and comments", "2,000", "601 posts + 2,002 comments"],
        ["Activity events over 6 months", "10,000", "**14,389** (22 May – 25 Nov 2026)"],
        ["Follow links", "—", "362 member follows, 120 topic follows"],
        ["Planted ground truth (separate file)", "yes", "30 duplicate pairs, 5 spam accounts, 3 topic spikes"],
    ],
    widths=[2.6, 1.1, 3.0],
)

h2("2.3 Software Requirements")
para("All software is free and open-source. The main libraries and pretrained models, and why each was chosen:")
table(
    ["Component", "Used for", "Why this choice"],
    [
        ["PostgreSQL 16 + pgvector", "Relational data, vectors (HNSW), and the warehouse", "Vectors sit next to the rows they describe; one engine to run and back up"],
        ["pg_trgm + full-text search", "Keyword ranking and fuzzy matching", "Stemming and weighted fields without a separate service"],
        ["sentence-transformers (all-MiniLM-L6-v2)", "384-d embeddings of papers, chunks, profiles, posts, queries", "Small and fast on CPU; strong semantic quality for its size"],
        ["datasketch", "MinHash signatures and LSH for duplicate detection", "Makes candidate generation near-linear"],
        ["NetworkX", "Citation graph and PageRank", "Standard, well-tested graph algorithms"],
        ["mlxtend", "FP-Growth / FP-Max and association rules", "Faster than Apriori on sparse baskets; gives support, confidence, lift"],
        ["scikit-learn", "Isolation Forest, Ward clustering, silhouette score", "Reference implementations with fixed seeds for reproducibility"],
        ["Ollama (llama3.2:3b)", "Answer generation in the assistant", "Runs locally on CPU; data never leaves the machine"],
        ["MinIO", "S3-compatible raw data lake", "Same API as Amazon S3; one container"],
        ["FastAPI / Pydantic / Uvicorn", "REST API, validation, OpenAPI docs", "Typed models reject bad input before it reaches SQL"],
        ["Next.js 14 / React 18 / TypeScript / Tailwind", "Frontend", "App Router pages, type-checked API client"],
        ["Docker Compose", "Orchestration of all services", "One command to run the whole stack"],
    ],
    widths=[2.2, 2.3, 2.3], font=9,
)

h2("2.4 Hardware Requirements")
para("The system was developed and runs on a single laptop. Recommended for a local deployment:")
bullet("8 GB RAM minimum (16 GB comfortable); the embedding model and the 3-billion-parameter language model load into memory.", "Memory: ")
bullet("About 5 GB for Docker images, the language model (~2 GB quantised) and the database volume.", "Disk: ")
bullet("A modern multi-core CPU is sufficient; no GPU is required. Retrieval latency is about 22 ms; the first assistant answer pays a one-time model-load cost.", "CPU/GPU: ")
page_break()

# ============================= 3. METHODOLOGY AND DESIGN =============================
h1("3. Methodology and Design")

h2("3.1 System Architecture")
para("The platform is a layered pipeline. External sources feed an ingestion stage that archives raw responses "
     "to a data lake, parses and embeds them, and resolves duplicates. A single PostgreSQL instance holds the "
     "operational tables, the vector indexes and a separate warehouse schema. A FastAPI backend serves the "
     "application and the analytics; batch jobs (deduplication, PageRank, the warehouse rebuild and the alert "
     "scans) run on a schedule. A Next.js frontend and a local language model complete the system.")
para("Design rationale: expensive or global computations run in batch, while everything a member waits for "
     "(search, feed, recommendations, retrieval) is a single indexed SQL query. Keeping the operational data, "
     "the vectors and the warehouse in one PostgreSQL instance avoids running and synchronising a separate "
     "vector database and OLAP engine at this scale, while the separate warehouse schema keeps analytical "
     "queries away from the tables the website writes to.")
code([
 "OpenAlex | arXiv | RSS feeds | Crossref / page metadata",
 "        |         |          |",
 "        v         v          v",
 "  DATA PIPELINE: archive raw -> MinIO lake; parse -> embed (MiniLM 384-d)",
 "                 -> MinHash signature; dedup (LSH + verify + union-find merge)",
 "        |",
 "        v",
 "  POSTGRESQL 16 + pgvector + pg_trgm",
 "    public (OLTP): users, papers, paper_sources, paper_chunks, posts,",
 "                   comments, library_saves, activity_events, system_alerts",
 "    dw (star schema): dim_date/member/paper/topic, fact_research_activity,",
 "                      fact_dept_collaboration        <- rebuilt by ELT every 6h",
 "        |                                   ^",
 "        v                                   |",
 "  FASTAPI BACKEND (:8000)  <--->  OLLAMA (:11434, llama3.2:3b)",
 "    auth, feed, library, search (RRF), recommend, also-saved (FP-Growth),",
 "    trends, spam (Isolation Forest), assistant (RAG), admin + analytics",
 "        |",
 "        v",
 "  NEXT.JS FRONTEND (:3000)",
])
caption("Figure 1. End-to-end architecture.")

h2("3.2 Database Design (Operational Schema)")
para("The operational schema keeps one canonical row per paper, with every source recorded separately, so a "
     "merge moves saves, posts and citations in one place. Articles are stored as papers with a type flag, so "
     "they are searched, saved and discussed exactly like papers. All embeddings live in the tables they "
     "describe.")
for t, d in [
    ("users", "profile (role, school, bio, interests) and a 384-d profile embedding; is_synthetic / spam flags"),
    ("papers", "canonical title, abstract, authors, embedding, full-text vector, MinHash signature, PageRank score, save count, item type (paper/article)"),
    ("paper_sources / paper_citations / paper_chunks / paper_merges", "one row per source record; citation edges; abstract chunks for the assistant; an audit of every merge"),
    ("library_saves / collections", "saves with private notes and optional collection"),
    ("posts / comments / post_upvotes", "discussions filed under research domains, threaded comments, ±1 votes"),
    ("activity_events", "one event log (search, view, save, post, comment, vote) feeding trends, spam features and the warehouse"),
]:
    bullet(d, bold_lead=t + ": ")
para("Indexing: HNSW (cosine) on every embedding column for approximate nearest-neighbour search; GIN on the "
     "full-text vectors (title weighted above abstract); B-tree indexes on event time and on the foreign keys "
     "used in joins; unique constraints on DOI and arXiv ID.")

h2("3.3 Data Warehouse (Star Schema)")
para("The administrator dashboard reads only from a dimensional star schema in a separate schema, rebuilt in "
     "batch from the operational tables. Keeping analytical, pre-joined, additive facts separate makes the "
     "dashboard queries simple and fast and keeps them off the live tables.")
table(
    ["Table", "Type", "Grain / contents"],
    [
        ["dim_date", "Dimension", "One row per day, with academic semester"],
        ["dim_member", "Dimension", "Role, school, active flag"],
        ["dim_paper", "Dimension", "Title, year, source, PageRank tier (High/Medium/Low)"],
        ["dim_topic", "Dimension", "Topic name and parent cluster (Ward clustering)"],
        ["fact_research_activity", "Fact", "Date × member × topic × paper: saves, posts, comments, upvotes, views"],
        ["fact_dept_collaboration", "Fact", "Date × source school × target school × interaction type (follow / comment)"],
    ],
    widths=[1.9, 1.0, 3.5],
)
para("Conformed dimensions (date, member) are shared by both facts, so engagement and collaboration can be "
     "sliced by the same school and semester. Derived attributes — the PageRank tier and the topic cluster — "
     "are computed once during the rebuild. At this data size a full rebuild takes seconds and avoids "
     "slowly-changing-dimension bookkeeping; an incremental load is described in the deployment plan.")

h2("3.4 Data Pipeline")
para("Ingestion follows a raw-first, incremental design:")
numbered("Each API response (OpenAlex JSON, arXiv XML, RSS/Atom XML) is written unchanged to the MinIO lake before it is parsed, so a parser fix can re-derive the tables without calling the source again.", "Raw first: ")
numbered("A cursor is kept per source, topic and feed (OpenAlex paging cursor, arXiv offset, RSS ETag / Last-Modified). Known identifiers are skipped before the costly embedding step; each run is logged.", "Incremental: ")
numbered("New records are embedded and chunked, a MinHash signature is computed, and the deduplication step merges any that duplicate an existing paper.", "Enrich: ")
numbered("A scheduler runs ingestion, deduplication and the warehouse rebuild every six hours (RSS every cycle, scholarly sources less often).", "Schedule: ")

h2("3.5 Data-Mining Methods per Feature")

h3("3.5.1 Entity Resolution — MinHash + LSH (F4/F5)")
para("The same work often arrives twice: an arXiv preprint and its OpenAlex record, or a reformatted title. "
     "A 128-permutation MinHash over word 3-shingles of title and abstract estimates Jaccard similarity; "
     "Locality-Sensitive Hashing (threshold 0.5) returns only candidate pairs likely to be similar, avoiding "
     "an all-pairs comparison. Each candidate is verified (shared DOI/arXiv ID, or shingle Jaccard ≥ 0.5 with "
     "title overlap ≥ 0.4 or embedding cosine ≥ 0.93), and verified pairs are grouped with union-find and "
     "merged into one canonical record. Exact-title matching misses reformatted titles and wrongly matches "
     "short generic ones; LSH makes candidate generation near-linear, and cheap verification removes the false "
     "candidates an LSH threshold alone admits.")

h3("3.5.2 Hybrid Search — Reciprocal Rank Fusion (F5)")
para("One query feeds four panels (library papers, open-literature papers, people, discussions). Papers are "
     "ranked by Reciprocal Rank Fusion of two candidate lists: semantic nearest-neighbours (pgvector HNSW, "
     "cosine) and full-text matches (ts_rank on the GIN index):")
code(["score(p) = 1/(60 + semantic_rank) + 1/(60 + keyword_rank) + w * pagerank_percentile"])
para("RRF uses only ranks, so it combines two scores that are on different scales, needs no training data, and "
     "is robust when one list is empty. The PageRank weight w was swept on development queries and set to 0, "
     "because every positive weight lowered ranking quality (the citation graph is sparse and the relevance "
     "labels measure topical match, not authority). PageRank is retained for tie-breaks, the prestige tier and "
     "featured papers. PageRank itself is NetworkX PageRank (damping 0.85) over the citation graph.")

h3("3.5.3 Recommendations — Co-save CF + Content (F6)")
para("Paper recommendations blend collaborative filtering with content similarity, standardised so the two "
     "signals are comparable:")
code([
 "content(p) = 0.7 * cos(p, profile) + 0.3 * cos(p, centroid of the member's saves)",
 "cf(p)      = ln(1 + sum over members m of |saves(m) ∩ my saves| * [m saved p])",
 "score(p)   = 1.0 * z(cf) + 0.5 * z(content)",
])
para("A signal with no spread contributes nothing, so a brand-new member (no saves) receives content-only "
     "results from their profile text — the cold-start case. Each recommendation states its reason. People "
     "recommendations use nearest profile embeddings, excluding those already followed.")

h3("3.5.4 “Also Saved” — FP-Growth Association Rules (F6)")
para("“Members who saved this also saved” is filled in three tiers so every library item gets an answer: "
     "FP-Growth association rules over member libraries (each library is one basket; minimum support of two "
     "members; ranked by confidence then lift), then co-saves, then embedding similarity. FP-Growth avoids "
     "Apriori’s candidate generation and is faster on sparse baskets; rules are cached until the library "
     "changes. The interface labels which tier produced each suggestion.")

h3("3.5.5 Trend and Spam Detection (F7)")
para("A topic’s spike ratio is its event count in the last 7 days divided by its average weekly rate over the "
     "preceding 30 days; an alert is raised at a ratio ≥ 1.5 with at least five events, so small topics do not "
     "spike on two events. A rate ratio against the topic’s own baseline is interpretable and needs no labels.")
para("Spam accounts are found by an Isolation Forest (150 trees) over three features per member: "
     "log(1 + post count), log(1 + mean seconds between posts) and mean upvotes. Isolation Forest needs no "
     "labels, which suits spam (rare and unlabelled in a real deployment). Flagged members enter an administrator "
     "review queue; once cleared, they are not re-flagged unless they post again.")

h3("3.5.6 Research Assistant — Retrieval-Augmented Generation (F8)")
para("Abstracts are chunked and embedded. A question is embedded, the four nearest chunks are retrieved, and "
     "chunks below a similarity of 0.32 are dropped; if none remain, the assistant refuses rather than invent "
     "an answer. The prompt numbers the passages and requires the model to answer only from them and cite every "
     "claim. A local 3-billion-parameter model (Llama 3.2 via Ollama) keeps all data on the machine; if it is "
     "unavailable, an extractive fallback returns the most relevant passage sentences, still cited.")

h3("3.5.7 Clustering for Analytics (F9)")
para("Ward agglomerative clustering groups topic centroids into four named clusters for the warehouse "
     "(dim_topic) and groups member profiles into researcher archetypes, each described by tertile trait "
     "rules; the silhouette score checks the grouping. FP-Growth and FP-Max over paper topic baskets per "
     "school give co-occurring topic pairs and maximal topic bundles.")
page_break()

# ============================= 4. IMPLEMENTATION =============================
h1("4. Implementation")

h2("4.1 Technology Stack and Services")
para("The system is packaged as seven Docker services; all credentials come from an environment file and the "
     "stack refuses to start without them.")
table(
    ["Service", "Image / build", "Port", "Role"],
    [
        ["crc_postgres", "pgvector/pgvector:pg16", "5434", "Operational DB, vectors, warehouse"],
        ["crc_minio", "minio/minio", "9000/9001", "Raw data lake (S3-compatible)"],
        ["crc_ollama", "ollama/ollama", "11434", "Local LLM (llama3.2:3b)"],
        ["crc_backend", "./backend (FastAPI)", "8000", "REST API and analytics"],
        ["crc_frontend", "./frontend (Next.js)", "3000", "Web interface"],
        ["crc_pipeline", "./backend", "—", "One-off seed job"],
        ["crc_scheduler", "./backend", "—", "Ingest + ELT every 6 hours"],
    ],
    widths=[1.5, 2.0, 1.0, 2.4],
)
para("For security the database, data lake and language model are published on the loopback address only, so "
     "they are reachable from the host machine but not from the network.")

h2("4.2 Backend")
para("The backend is a FastAPI application (backend/main.py) with the data-mining logic factored into shared "
     "service modules so the evaluation measures exactly the deployed code:")
bullet("hybrid search SQL (Reciprocal Rank Fusion).", bold_lead="search_service.py — ")
bullet("the co-save + content recommendation query.", bold_lead="recommendation_service.py — ")
bullet("the Isolation Forest and its features.", bold_lead="spam_service.py — ")
bullet("FP-Growth / FP-Max bundles and Ward researcher archetypes.", bold_lead="mining_service.py — ")
bullet("the submission gatekeeper (live anomaly scoring).", bold_lead="anomaly_service.py — ")
para("Representative endpoints (full interactive documentation is served at /docs):")
table(
    ["Method & path", "Purpose"],
    [
        ["POST /api/auth/register, /login", "Accounts; JWT sessions (8 h)"],
        ["GET /api/feed?sort=best|new|top|following", "Personal feed with the reason each post is shown"],
        ["GET /api/search?q=", "Four-panel hybrid search (RRF) + related topics"],
        ["GET /api/recommendations/{user_id}", "Co-save + content paper and people recommendations"],
        ["GET /api/papers/{id}/also-saved", "FP-Growth “also saved” with fall-backs"],
        ["GET /api/trends-and-anomalies, /api/alerts", "Topic spikes and the moderation queue"],
        ["POST /api/assistant/ask[/stream]", "RAG assistant with retrieved passages and citations"],
        ["GET /api/analytics/overview, /drilldown, …", "Star-schema OLAP, FP-Growth bundles, archetypes"],
    ],
    widths=[3.0, 3.2], font=9,
)

h2("4.3 Frontend")
para("The interface is a Next.js 14 application (App Router, TypeScript, Tailwind CSS) with a type-checked API "
     "client. The main pages are Home, Feed and threaded discussions, Library (Chanakya holdings, My saves, "
     "Recommended, Collections), unified Search, the Research Assistant, member profiles, the paper page "
     "(abstract, sources, citation graph, discussions, readers-also-saved), and the administrator Dashboard "
     "(Overview, Members, Chanakya holdings, Analytics). Members can edit and delete their own posts and "
     "comments; administrators can moderate posts and comments, manage members and roles, and post library "
     "holdings.")

h2("4.4 Security and Configuration")
bullet("Passwords are hashed (bcrypt / PBKDF2-SHA256); sessions are signed JWTs with an 8-hour expiry; five failed logins per identifier per minute are throttled.", "Authentication: ")
bullet("Every administrator and analytics endpoint checks the role on the server, not only in the interface; recommendations are private to the member or an administrator.", "Authorization: ")
bullet("All credentials are read from an environment file that is never committed; the code stops with a clear message if one is missing.", "Secrets: ")

h2("4.5 Testing")
para("Thirty-three end-to-end tests exercise the API against the development database — login and throttling, "
     "profiles, posts and domain validation, feeds and follow reasons, library saves and notes, "
     "save-by-identifier, search panels, recommendation privacy, also-saved, trends, moderation, drill-down, "
     "administrator holdings and member management, and comment editing and deletion. Throwaway test accounts "
     "use a reserved email domain and are deleted with everything they create, so the tests leave no trace.")
page_break()

# ============================= 5. EVALUATION =============================
h1("5. Evaluation and Results")
para("Every number below is produced by evaluation/evaluate_all.py against the same SQL and constants the "
     "application uses, so the evaluation measures the deployed system rather than a re-implementation. Labels "
     "are rebuilt from the seed’s planting rules (never from any detector’s output). Tunable settings are "
     "chosen on a development split and reported on held-out data; intervals are 95% bootstrap intervals.")

h3("5.1 Duplicate Detection (F4/F5)")
table(
    ["Method", "Precision", "Recall", "F1"],
    [
        ["Exact title match", "0.054", "0.690", "0.101"],
        ["Word-set MinHash LSH 0.65 (original)", "0.763", "1.000", "0.866"],
        ["Deployed: 3-shingle MinHash + verification", "**1.000**", "**1.000**", "**1.000**"],
    ],
    widths=[3.3, 1.1, 1.1, 1.0],
)
para("Of the merges actually made in the database, 45 of 46 are correct and all 30 planted duplicates were "
     "merged; author name-variant matching scores 0.933 on 15 pairs.", size=10)

h3("5.2 Unified Search (F5) — 25 held-out queries")
table(
    ["System", "nDCG@10 [95% CI]", "MRR"],
    [
        ["Keyword only (full-text)", "0.197 [0.089, 0.316]", "0.44"],
        ["Semantic only (pgvector)", "0.822 [0.703, 0.926]", "0.83"],
        ["Previous hybrid (PageRank × 50)", "0.724 [0.590, 0.843]", "0.73"],
        ["Deployed hybrid RRF (w = 0)", "**0.815 [0.694, 0.920]**", "**0.83**"],
    ],
    widths=[3.0, 2.3, 0.9],
)
para("The hybrid is level with semantic-only search and far above keyword search; the keyword list rescues "
     "exact terms (acronyms, author names) that embeddings handle poorly. PageRank correlates with real "
     "citations (Spearman ρ = 0.41, p ≈ 2×10⁻⁴⁶) but the citation graph is sparse (188 internal edges), which "
     "is why it does not help relevance here.", size=10)

h3("5.3 Recommendations (F6) — 28 held-out members")
table(
    ["Method", "Recall@10", "nDCG@10"],
    [
        ["Popularity", "0.018", "0.022"],
        ["Profile similarity only", "0.036", "0.036"],
        ["Item-based collaborative filtering", "0.107", "0.075"],
        ["Deployed co-save + content hybrid", "**0.107**", "**0.066**"],
    ],
    widths=[3.4, 1.2, 1.2],
)
para("The hybrid ties item-CF on held-out members (intervals overlap) and beats popularity six-fold, and unlike "
     "pure CF it still serves members with no saves. “Also saved” coverage: rules alone answer 151 of 461 "
     "library items; with the co-save and similarity tiers, all 461.", size=10)

h3("5.4 Trends and Spam (F7)")
para("Topic spikes: the three topics with the highest spike ratio are exactly the three planted ones "
     "(recall@3 = 1.00, alert precision = 1.00). Spam accounts (5 planted of 61 members): Isolation Forest "
     "ROC-AUC 0.975, PR-AUC 0.73; at the deployed threshold, precision 0.67 and recall 0.80. A one-feature "
     "post-count baseline scores a higher PR-AUC (0.925) because the planted spammers differ mainly in volume; "
     "this is reported honestly, and the forest is kept because it also catches other kinds of abnormal "
     "behaviour, with every flag going to a human review queue.", size=10)

h3("5.5 Research Assistant (F8)")
table(
    ["Test", "Result"],
    [
        ["In-corpus questions (15): expected paper in top 4", "**Hit@4 = 1.00**"],
        ["Mean retrieval latency", "22 ms"],
        ["Out-of-corpus “trap” questions refused (< 0.32)", "**0.80** (4 of 5)"],
    ],
    widths=[4.0, 2.0],
)
page_break()

# ============================= 6. CONCLUSION =============================
h1("6. Conclusion")

h2("6.1 Summary")
para("Chanakya Research Commons delivers all nine functional areas of the brief as a single runnable system, "
     "and demonstrates the core data-mining and warehousing techniques of the course on real literature: "
     "MinHash/LSH entity resolution (F1 = 1.00 on the benchmark), rank-fusion hybrid search (nDCG@10 0.82, "
     "four times keyword search), PageRank authority, FP-Growth association rules with full library coverage, "
     "a recommendation hybrid that matches collaborative filtering while handling cold start, sliding-window "
     "trend detection and Isolation-Forest spam flags, retrieval-augmented question answering with a local "
     "model and a refusal gate, and a star-schema warehouse with drill-down analytics. The evaluation compares "
     "each method with baselines on planted ground truth or held-out data and reports the findings honestly.")

h2("6.2 Limitations")
numbered("The community is synthetic; planted patterns are cleaner than real behaviour, so the spam and spike results are upper bounds.")
numbered("Evaluation samples are small (25 queries, 28 members, 5 spam accounts), so several comparisons are statistical ties.")
numbered("Search relevance is judged automatically by query terms in titles and topics, not by human assessors.")
numbered("The citation graph is sparse, so PageRank adds no relevance and the prestige tier is coarse.")
numbered("The assistant reads abstracts only; it cannot answer detailed method questions from full text.")
numbered("A single-machine deployment with a full warehouse rebuild suits the current size, not tens of thousands of members.")

h2("6.3 Future Work and Deployment")
para("A phased roll-out for the university would: replace the demo accounts with single sign-on through the "
     "university identity provider and publish a data-privacy notice; pilot with one or two schools, seeding "
     "the library from their reading lists and faculty publications; collect real labels (moderators’ spam "
     "decisions, relevance and recommendation feedback) and re-tune the spam threshold and the search and "
     "recommendation models on them; then scale with incremental warehouse loads, partitioned event tables, a "
     "shared cache across API workers, and full-text PDFs so the assistant can answer method-level questions. "
     "Success would be measured by weekly active members per school, the share of searches that end in a save, "
     "cross-school follows and discussions, and moderator precision on spam flags.")

h2("6.4 Conclusion")
para("The project shows that the techniques of data mining and warehousing — hashing and similarity, link "
     "analysis, association rules, clustering, anomaly detection, dimensional modelling and retrieval — combine "
     "into a coherent, useful research platform, and that honest evaluation against baselines is as important "
     "as the methods themselves. The result is a complete system that runs locally on free software and is "
     "ready to pilot at Chanakya University.")

hrule()
para("Supporting material in the repository: full engineering write-up (docs/TECHNICAL_REPORT.md), demo and "
     "viva guide (docs/DEMO_AND_VIVA.md), requirement checklist (REQUIREMENTS_CHECKLIST.md), reproducible "
     "evaluation (evaluation/evaluate_all.py and evaluation_results.json), and the setup guide (README.md).",
     size=9, italic=True, color=GREY)

# ---- footer with page numbers ----
def add_page_numbers(document):
    for section in document.sections:
        footer = section.footer
        fp = footer.paragraphs[0]
        fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        lead = fp.add_run("Chanakya Research Commons  ·  ")
        lead.font.size = Pt(8); lead.font.color.rgb = GREY
        fldbegin = OxmlElement("w:fldChar"); fldbegin.set(qn("w:fldCharType"), "begin")
        instr = OxmlElement("w:instrText"); instr.set(qn("xml:space"), "preserve"); instr.text = "PAGE"
        fldend = OxmlElement("w:fldChar"); fldend.set(qn("w:fldCharType"), "end")
        run = fp.add_run(); run.font.size = Pt(8); run.font.color.rgb = GREY
        run._r.append(fldbegin); run._r.append(instr); run._r.append(fldend)


add_page_numbers(doc)
doc.save(OUT)
print("saved", OUT)
