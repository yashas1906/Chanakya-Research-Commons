ALTER TABLE post_upvotes
  ADD COLUMN IF NOT EXISTS value SMALLINT NOT NULL DEFAULT 1 CHECK (value IN (-1, 1));

CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);
