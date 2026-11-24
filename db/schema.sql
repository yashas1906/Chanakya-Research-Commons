-- ==========================================
-- 1. EXTENSIONS
-- ==========================================
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ==========================================
-- 2. OPERATIONAL & VECTOR SCHEMA (public)
-- ==========================================

-- F1: Accounts, Profiles & Social Graph
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id VARCHAR(30) UNIQUE NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) CHECK (role IN ('student', 'faculty', 'researcher', 'admin')) NOT NULL,
    department VARCHAR(100) NOT NULL,
    bio TEXT,
    profile_url TEXT,
    interest_tags TEXT[],
    profile_embedding VECTOR(384),
    is_synthetic BOOLEAN DEFAULT FALSE,
    is_flagged_spam BOOLEAN DEFAULT FALSE,
    spam_score FLOAT DEFAULT 0.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_follows (
    follower_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    followee_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (follower_id, followee_id)
);

CREATE TABLE topic_follows (
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    topic_tag VARCHAR(80) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, topic_tag)
);

-- F3, F4, F5, F8: Canonical Papers, Provenance & Citations
CREATE TABLE papers (
    paper_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doi VARCHAR(150) UNIQUE,
    arxiv_id VARCHAR(50) UNIQUE,
    canonical_title TEXT NOT NULL,
    abstract TEXT,
    authors JSONB NOT NULL,
    publication_year INT,
    venue VARCHAR(200),
    topics TEXT[],
    minhash_signature BYTEA,
    embedding VECTOR(384),
    search_tsv TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(canonical_title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(abstract, '')), 'B')
    ) STORED,
    pagerank_score FLOAT DEFAULT 0.0,
    save_count INT DEFAULT 0,
    sources JSONB DEFAULT '["openalex"]'::jsonb,
    in_chanakya_library BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE paper_sources (
    source_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id UUID REFERENCES papers(paper_id) ON DELETE CASCADE,
    source_name VARCHAR(50) NOT NULL,
    external_id VARCHAR(150),
    source_url TEXT NOT NULL,
    raw_minio_path TEXT,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (source_name, external_id)
);

CREATE TABLE paper_citations (
    citing_paper_id UUID REFERENCES papers(paper_id) ON DELETE CASCADE,
    cited_paper_id UUID REFERENCES papers(paper_id) ON DELETE CASCADE,
    PRIMARY KEY (citing_paper_id, cited_paper_id)
);

CREATE TABLE paper_chunks (
    chunk_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id UUID REFERENCES papers(paper_id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    chunk_text TEXT NOT NULL,
    chunk_embedding VECTOR(384) NOT NULL
);

-- F3, F6: Shared Library & Personal Collections
CREATE TABLE collections (
    collection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE library_saves (
    save_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    paper_id UUID REFERENCES papers(paper_id) ON DELETE CASCADE,
    collection_id UUID REFERENCES collections(collection_id) ON DELETE SET NULL,
    private_notes TEXT,
    saved_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, paper_id)
);

-- F2, F5, F7: Posts, Discussions & Upvotes
CREATE TABLE posts (
    post_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    attached_paper_id UUID REFERENCES papers(paper_id) ON DELETE SET NULL,
    title VARCHAR(250) NOT NULL,
    body TEXT NOT NULL,
    tags TEXT[],
    upvote_count INT DEFAULT 0,
    post_embedding VECTOR(384),
    search_tsv TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
    ) STORED,
    is_flagged_spam BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    edited_at TIMESTAMPTZ
);

CREATE TABLE comments (
    comment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES posts(post_id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES comments(comment_id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE post_upvotes (
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    post_id UUID REFERENCES posts(post_id) ON DELETE CASCADE,
    value SMALLINT NOT NULL DEFAULT 1 CHECK (value IN (-1, 1)),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, post_id)
);

CREATE INDEX idx_comments_post ON comments(post_id, created_at);

-- F6, F7, F9: Event Stream & Anomaly Alerts
CREATE TABLE activity_events (
    event_id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    event_type VARCHAR(30) NOT NULL,
    target_id UUID,
    search_query TEXT,
    topic_tags TEXT[],
    occurred_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE system_alerts (
    alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type VARCHAR(30) NOT NULL,
    entity_ref VARCHAR(150) NOT NULL,
    severity_score FLOAT NOT NULL,
    details JSONB,
    is_resolved BOOLEAN DEFAULT FALSE,
    detected_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vector & Full-Text Indexes
CREATE INDEX idx_papers_embedding ON papers USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_papers_library_embedding ON papers USING hnsw (embedding vector_cosine_ops) WHERE in_chanakya_library = TRUE;
CREATE INDEX idx_chunks_embedding ON paper_chunks USING hnsw (chunk_embedding vector_cosine_ops);
CREATE INDEX idx_users_embedding  ON users USING hnsw (profile_embedding vector_cosine_ops);
CREATE INDEX idx_posts_embedding  ON posts USING hnsw (post_embedding vector_cosine_ops);

CREATE INDEX idx_papers_tsv ON papers USING GIN (search_tsv);
CREATE INDEX idx_posts_tsv  ON posts USING GIN (search_tsv);
CREATE INDEX idx_events_time ON activity_events (occurred_at DESC);
CREATE INDEX idx_events_topic_tags ON activity_events USING GIN (topic_tags);
CREATE INDEX idx_library_saves_user ON library_saves (user_id);
CREATE INDEX idx_comments_post ON comments (post_id);
CREATE INDEX idx_posts_created_at ON posts (created_at DESC);
CREATE INDEX idx_system_alerts_unresolved ON system_alerts (alert_type, is_resolved) WHERE is_resolved = FALSE;

-- ==========================================
-- 3. STAR SCHEMA DATA WAREHOUSE (dw) - F9
-- ==========================================
CREATE SCHEMA IF NOT EXISTS dw;

CREATE TABLE dw.dim_date (
    date_key INT PRIMARY KEY,
    full_date DATE NOT NULL,
    year INT NOT NULL,
    quarter INT NOT NULL,
    month INT NOT NULL,
    month_name VARCHAR(15) NOT NULL,
    week_of_year INT NOT NULL,
    academic_semester VARCHAR(20)
);

CREATE TABLE dw.dim_member (
    member_key SERIAL PRIMARY KEY,
    user_id UUID UNIQUE NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    role VARCHAR(20) NOT NULL,
    department VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE dw.dim_topic (
    topic_key SERIAL PRIMARY KEY,
    topic_name VARCHAR(100) UNIQUE NOT NULL,
    parent_cluster VARCHAR(100) NOT NULL
);

CREATE TABLE dw.dim_paper (
    paper_key SERIAL PRIMARY KEY,
    paper_id UUID UNIQUE NOT NULL,
    title TEXT NOT NULL,
    publication_year INT,
    primary_source VARCHAR(50),
    pagerank_tier VARCHAR(20)
);

CREATE TABLE dw.fact_research_activity (
    activity_fact_id BIGSERIAL PRIMARY KEY,
    date_key INT REFERENCES dw.dim_date(date_key),
    member_key INT REFERENCES dw.dim_member(member_key),
    topic_key INT REFERENCES dw.dim_topic(topic_key),
    paper_key INT REFERENCES dw.dim_paper(paper_key),
    saves_count INT DEFAULT 0,
    posts_count INT DEFAULT 0,
    comments_count INT DEFAULT 0,
    upvotes_count INT DEFAULT 0,
    views_count INT DEFAULT 0
);

CREATE TABLE dw.fact_dept_collaboration (
    collab_fact_id BIGSERIAL PRIMARY KEY,
    date_key INT REFERENCES dw.dim_date(date_key),
    source_department VARCHAR(100) NOT NULL,
    target_department VARCHAR(100) NOT NULL,
    interaction_type VARCHAR(30) NOT NULL,
    interaction_count INT DEFAULT 1
);

-- ==========================================
-- 4. ANALYTICAL MINING VIEWS & ALIASES (dw)
-- ==========================================

-- Compatibility aliases for standard Star Schema dimension names
CREATE OR REPLACE VIEW dw.dim_researcher AS
SELECT 
    member_key AS researcher_key,
    user_id AS researcher_id,
    full_name,
    role,
    department,
    is_active
FROM dw.dim_member;

CREATE OR REPLACE VIEW dw.dim_keyword AS
SELECT 
    topic_key AS keyword_key,
    topic_name AS keyword_name,
    parent_cluster AS domain_cluster
FROM dw.dim_topic;

CREATE OR REPLACE VIEW dw.fact_publication AS
SELECT 
    paper_key,
    paper_id,
    title,
    publication_year,
    primary_source,
    pagerank_tier
FROM dw.dim_paper;

-- Flattened Publication Topic Baskets View for FP-Growth / FP-Max Mining
CREATE OR REPLACE VIEW dw.vw_paper_topic_baskets AS
WITH paper_topics_exploded AS (
    -- 1. Topics from papers.topics array (excluding pure department strings)
    SELECT 
        p.paper_id::text AS tid,
        p.paper_id,
        dp.paper_key,
        TRIM(t) AS item_label,
        COALESCE(p.publication_year, dp.publication_year, 2024) AS pub_year
    FROM papers p
    LEFT JOIN dw.dim_paper dp ON p.paper_id = dp.paper_id
    CROSS JOIN UNNEST(p.topics) AS t
    WHERE TRIM(t) NOT IN (
        'School of Arts, Humanities and Social Sciences', 'School of Biosciences', 'School of Engineering', 'School of Law, Governance and Public Policy', 'School of Management Sciences', 'School of Mathematics and Natural Sciences'
    )

    UNION

    -- 2. Topics linked via Star Schema fact_research_activity and dim_topic
    SELECT 
        p.paper_id::text AS tid,
        p.paper_id,
        dp.paper_key,
        TRIM(dt.topic_name) AS item_label,
        COALESCE(p.publication_year, dp.publication_year, 2024) AS pub_year
    FROM papers p
    JOIN dw.dim_paper dp ON p.paper_id = dp.paper_id
    JOIN dw.fact_research_activity fa ON dp.paper_key = fa.paper_key
    JOIN dw.dim_topic dt ON fa.topic_key = dt.topic_key
    WHERE dt.topic_name IS NOT NULL
),
paper_meta AS (
    SELECT 
        p.paper_id,
        COALESCE(
            (SELECT t FROM UNNEST(p.topics) t WHERE t IN (
                'School of Arts, Humanities and Social Sciences', 'School of Biosciences', 'School of Engineering', 'School of Law, Governance and Public Policy', 'School of Management Sciences', 'School of Mathematics and Natural Sciences'
            ) LIMIT 1),
            'School of Engineering'
        ) AS department_name
    FROM papers p
)
SELECT DISTINCT
    pte.tid,
    pte.paper_key,
    pte.paper_id,
    pte.item_label,
    pm.department_name AS school_name,
    pm.department_name,
    pte.pub_year
FROM paper_topics_exploded pte
JOIN paper_meta pm ON pte.paper_id = pm.paper_id
WHERE pte.item_label IS NOT NULL AND LENGTH(pte.item_label) > 1;

-- Researcher Analytical Profiles View for Agglomerative Clustering & Trait Profiling
CREATE OR REPLACE VIEW dw.vw_researcher_profiles AS
SELECT 
    u.user_id AS researcher_id,
    u.full_name AS researcher_name,
    u.role,
    u.department,
    u.department::text AS school_name,
    COUNT(DISTINCT ls.paper_id)::INT AS total_publications,
    COALESCE(COUNT(DISTINCT pc.citing_paper_id), 0)::INT AS total_citations,
    ROUND(COALESCE(AVG(jsonb_array_length(COALESCE(p.authors, '[]'::jsonb))), 1.0)::NUMERIC, 2)::FLOAT AS avg_coauthors,
    ROUND(COALESCE(AVG(p.pagerank_score), 0.001)::NUMERIC, 5)::FLOAT AS avg_pagerank,
    GREATEST(
        COALESCE(CARDINALITY(u.interest_tags), 0),
        COUNT(DISTINCT fa.topic_key),
        1
    )::INT AS topic_breadth
FROM users u
LEFT JOIN library_saves ls ON u.user_id = ls.user_id
LEFT JOIN papers p ON ls.paper_id = p.paper_id
LEFT JOIN paper_citations pc ON p.paper_id = pc.cited_paper_id
LEFT JOIN dw.dim_member dm ON u.user_id = dm.user_id
LEFT JOIN dw.fact_research_activity fa ON dm.member_key = fa.member_key
WHERE u.is_flagged_spam = FALSE
GROUP BY u.user_id, u.full_name, u.role, u.department, u.interest_tags;
