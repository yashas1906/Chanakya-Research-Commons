-- 005: Phase 1 additions. Safe to run more than once.
--
--   * papers.item_type / papers.url  - RSS articles live beside papers (item_type = 'article'), so search,
--                                       saving, the library and the assistant all handle both.
--   * users.publication_links        - links to publications (profile_url stays the personal page).
--   * paper_merges                   - log of near-duplicates merged into one canonical record (F5).
--   * ingestion_runs                 - one row per batch an ingestion job ran (F4 audit trail).
--   * ingestion_state                - per-source cursors so scheduled runs fetch only the next batch.

ALTER TABLE papers ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) NOT NULL DEFAULT 'paper';
ALTER TABLE papers ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS publication_links TEXT[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'papers_item_type_check') THEN
        ALTER TABLE papers ADD CONSTRAINT papers_item_type_check CHECK (item_type IN ('paper', 'article'));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS paper_merges (
    merge_id BIGSERIAL PRIMARY KEY,
    duplicate_paper_id UUID NOT NULL,      -- no FK: the duplicate row is deleted after merging
    canonical_paper_id UUID NOT NULL REFERENCES papers(paper_id) ON DELETE CASCADE,
    duplicate_title TEXT,
    minhash_jaccard FLOAT,
    embedding_cosine FLOAT,
    method VARCHAR(60) NOT NULL,
    merged_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (duplicate_paper_id)
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
    run_id BIGSERIAL PRIMARY KEY,
    source_name VARCHAR(50) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    fetched_count INT DEFAULT 0,
    inserted_count INT DEFAULT 0,
    skipped_count INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'running',
    details JSONB
);

CREATE TABLE IF NOT EXISTS ingestion_state (
    source_name VARCHAR(50) NOT NULL,
    state_key TEXT NOT NULL,
    cursor_value TEXT,
    etag TEXT,
    last_modified TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (source_name, state_key)
);

CREATE INDEX IF NOT EXISTS idx_paper_sources_paper ON paper_sources (paper_id);
CREATE INDEX IF NOT EXISTS idx_papers_item_type ON papers (item_type);
CREATE INDEX IF NOT EXISTS idx_library_saves_paper ON library_saves (paper_id);
